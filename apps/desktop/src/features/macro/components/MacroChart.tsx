import { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, CrosshairMode, LineSeries, createChart } from 'lightweight-charts';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import type { MacroSeries } from '@weiwei/contracts';
import { useApp } from '@/app/providers/AppProviders';

const colors = ['#d9a36a', '#6d9ef8', '#2bbd8a', '#a98bec'];
const rangeYears = { '1y': 1, '3y': 3, '5y': 5, '10y': 10, all: 1000 };

function format(value: number, unit: string) {
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
}

export function MacroChart({ series, range, normalized, height = 420 }: { series: MacroSeries[]; range: keyof typeof rangeYears; normalized: boolean; height?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [tooltip, setTooltip] = useState<{ time: number; x: number; y: number } | null>(null);
  const { theme } = useApp();
  const prepared = useMemo(() => {
    const cutoff = Date.now() / 1000 - rangeYears[range] * 365.25 * 86400;
    return series.map(item => {
      const points = item.points.filter(point => range === 'all' || point.time >= cutoff);
      const base = points[0]?.value;
      return {
        ...item,
        points: points.map(point => ({ time: point.time as UTCTimestamp, value: normalized && base ? point.value / base * 100 : point.value })),
      };
    });
  }, [series, range, normalized]);
  const tooltipPoints = tooltip ? prepared.map(item => ({ item, point: item.points.find(point => point.time === tooltip.time) })).filter(entry => entry.point) : [];

  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    const instance = createChart(element, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: theme === 'dark' ? '#0f1113' : '#f3f4f3' },
        textColor: theme === 'dark' ? '#7f898b' : '#78817c',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#22272b' : '#e9ece8' },
        horzLines: { color: theme === 'dark' ? '#22272b' : '#e9ece8' },
      },
      rightPriceScale: { borderColor: theme === 'dark' ? '#282d31' : '#dfe3df' },
      timeScale: { borderColor: theme === 'dark' ? '#282d31' : '#dfe3df', timeVisible: true },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'zh-CN' },
    });
    chart.current = instance;
    prepared.forEach((item, index) => {
      const line = instance.addSeries(LineSeries, {
        color: colors[index % colors.length], lineWidth: 2, priceLineVisible: false,
        lastValueVisible: true, title: item.name,
      });
      line.setData(item.points);
    });
    instance.timeScale().fitContent();
    instance.subscribeCrosshairMove(param => {
      if (!param.time || typeof param.time !== 'number' || !param.point) setTooltip(null);
      else setTooltip({ time: param.time, x: param.point.x, y: param.point.y });
    });
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) instance.applyOptions({ width });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      instance.remove();
      chart.current = null;
    };
  }, [prepared, theme, height]);

  return <div className="macro-chart-wrap">
    <div className="macro-chart-legend">{prepared.map((item, index) => <span key={item.id}><i style={{ background: colors[index % colors.length] }} />{item.name}<small>{item.points.length ? format(item.points.at(-1)!.value, normalized ? '' : item.unit) : '准备中'}</small></span>)}</div>
    <div className="macro-chart-canvas" ref={container} role="img" aria-label={`宏观指标历史趋势：${series.map(item => item.name).join('、')}`} />
    {tooltip && tooltipPoints.length > 0 && <div className="macro-chart-tooltip" style={{ left: Math.min(Math.max(tooltip.x + 12, 8), Math.max(8, (container.current?.clientWidth ?? 400) - 230)), top: Math.min(tooltip.y + 12, height - 120) }}>
      <time>{new Date(tooltip.time * 1000).toISOString().slice(0, 10)}</time>
      {tooltipPoints.map(({ item, point }) => <div key={item.id}><span>{item.name}</span><strong>{format(point!.value, normalized ? '' : item.unit)}</strong></div>)}
    </div>}
  </div>;
}
