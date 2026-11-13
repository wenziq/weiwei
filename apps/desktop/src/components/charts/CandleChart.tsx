import { useCallback, useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, CrosshairMode, HistogramSeries } from 'lightweight-charts';
import type { CandlestickData, HistogramData, IChartApi, ISeriesApi, LogicalRange, UTCTimestamp } from 'lightweight-charts';
import type { Candle, CandleSeries } from '@weiwei/contracts';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { useApp } from '@/app/providers/AppProviders';
import { direction, signed } from '@/lib/format';

const periods = [{ key: 'day', label: '日K' }, { key: 'week', label: '周K' }, { key: 'month', label: '月K' }, { key: '60m', label: '60 分' }, { key: '30m', label: '30 分' }, { key: '15m', label: '15 分' }, { key: '5m', label: '5 分' }, { key: '1m', label: '1 分' }];

function chartTime(candle: Candle, period: string, zone: string) {
  if (!period.endsWith('m')) return candle.time;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(candle.time * 1000));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) / 1000;
}

function mergeCandleSeries(incoming: CandleSeries, current: CandleSeries | null): CandleSeries {
  if (!current || current.instrumentId !== incoming.instrumentId || current.period !== incoming.period || current.adjustment !== incoming.adjustment) return incoming;
  const byTime = new Map<number, Candle>();
  for (const candle of [...current.candles, ...incoming.candles]) byTime.set(candle.time, candle);
  return { ...incoming, candles: [...byTime.values()].sort((a, b) => a.time - b.time) };
}

export function CandleChart({ instrumentId, height = 390 }: { instrumentId: string; height?: number }) {
  const [period, setPeriod] = useState('day');
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const { theme, notify } = useApp();
  const { data: series, loading, error, warning, setData: setSeries } = useApi<CandleSeries>(`/market/instruments/${instrumentId}/candles?period=${period}&limit=500&adjustment=none`, [instrumentId, period], { refetchIntervalMs: backgroundRefreshing ? 1500 : period.endsWith('m') ? 30000 : 60000, mergeData: mergeCandleSeries });
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const candlesByTime = useRef(new Map<number, Candle>());
  const changesByTime = useRef(new Map<number, number>());
  const viewKey = useRef('');
  const seriesRef = useRef<CandleSeries | null>(null);
  const loadingOlder = useRef(false);
  const historyExhausted = useRef(false);
  const fitAll = useRef(false);
  const [focused, setFocused] = useState<Candle | null>(null);
  const [hovered, setHovered] = useState<{ time: number; x: number; y: number; changePct: number | null } | null>(null);
  seriesRef.current = series;
  const data = series?.candles ?? null;
  const availablePeriods = instrumentId.startsWith('sector-') ? periods.filter(item => ['day', 'week', 'month'].includes(item.key)) : periods;
  const zone = ['index-dji', 'index-spx', 'index-ixic', 'index-ndx', 'index-sox'].includes(instrumentId) || instrumentId.startsWith('us-') ? 'America/New_York' : 'Asia/Shanghai';

  useEffect(() => {
    setBackgroundRefreshing(Boolean(series?.refreshing));
  }, [series?.refreshing]);

  const loadOlder = useCallback(async () => {
    const current = seriesRef.current;
    if (!current?.candles.length || loadingOlder.current || historyExhausted.current) return;
    const before = current.candles[0]!.time;
    loadingOlder.current = true;
    try {
      const older = await api.get<CandleSeries>(`/market/instruments/${instrumentId}/candles?period=${period}&limit=500&adjustment=none&before=${before}`);
      if (seriesRef.current?.instrumentId !== instrumentId || seriesRef.current.period !== period) return;
      if (!older.candles.length) {
        historyExhausted.current = true;
        return;
      }
      setSeries(currentSeries => {
        if (!currentSeries) return currentSeries;
        const existing = new Set(currentSeries.candles.map(item => item.time));
        return { ...currentSeries, candles: [...older.candles.filter(item => !existing.has(item.time)), ...currentSeries.candles] };
      });
    } catch {
      notify('更早历史读取失败，请稍后重试');
    } finally {
      loadingOlder.current = false;
    }
  }, [instrumentId, period, setSeries, notify]);

  const loadAll = async () => {
    if (loadingAll || !seriesRef.current?.candles.length) return;
    setLoadingAll(true);
    try {
      const result = await api.get<CandleSeries>(`/market/instruments/${instrumentId}/candles?period=${period}&limit=50000&adjustment=none`);
      if (seriesRef.current?.instrumentId !== instrumentId || seriesRef.current.period !== period) return;
      fitAll.current = true;
      setSeries(result);
    } catch {
      notify('全部历史读取失败，请稍后重试');
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    if (!availablePeriods.some(item => item.key === period)) setPeriod('day');
  }, [instrumentId, period]);

  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    const style = getComputedStyle(element);
    const muted = style.getPropertyValue('--muted').trim();
    const border = style.getPropertyValue('--border-soft').trim();
    const instance = createChart(element, {
      width: element.clientWidth,
      height: element.clientHeight,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: muted, fontSize: 13, attributionLogo: false },
      grid: { vertLines: { color: border }, horzLines: { color: border } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, rightOffset: 4, barSpacing: 8, minBarSpacing: 0.01 },
    });
    candleSeries.current = instance.addSeries(CandlestickSeries, { upColor: '#f0646b', downColor: '#2bbd8a', borderVisible: false, wickUpColor: '#f0646b', wickDownColor: '#2bbd8a' }, 0);
    volumeSeries.current = instance.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' } }, 1);
    volumeSeries.current.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.08 } });
    instance.subscribeCrosshairMove(param => {
      const time = param.time as number | undefined;
      const candle = time === undefined ? null : candlesByTime.current.get(time) ?? null;
      if (time === undefined || !param.point || !candle) { setFocused(null); setHovered(null); return; }
      setFocused(candle);
      const tooltipWidth = 190;
      const tooltipHeight = 36;
      const right = param.point.x + 14 + tooltipWidth > element.clientWidth;
      const x = right ? param.point.x - tooltipWidth - 14 : param.point.x + 14;
      const y = param.point.y < tooltipHeight + 14 ? param.point.y + 14 : param.point.y - tooltipHeight - 10;
      setHovered({
        time,
        x: Math.max(8, Math.min(x, element.clientWidth - tooltipWidth - 8)),
        y: Math.max(8, Math.min(y, element.clientHeight - tooltipHeight - 8)),
        changePct: changesByTime.current.get(time) ?? null,
      });
    });
    const clearFocus = () => { setFocused(null); setHovered(null); };
    element.addEventListener('mouseleave', clearFocus);
    chart.current = instance;
    viewKey.current = '';
    const observer = new ResizeObserver(() => instance.applyOptions({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => { observer.disconnect(); element.removeEventListener('mouseleave', clearFocus); instance.remove(); chart.current = null; };
  }, [theme]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const handler = (range: LogicalRange | null) => {
      if (range && range.from < 20) void loadOlder();
    };
    instance.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => instance.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
  }, [theme, loadOlder]);

  useEffect(() => {
    candleSeries.current?.setData([]);
    volumeSeries.current?.setData([]);
    setFocused(null);
    setHovered(null);
    historyExhausted.current = false;
    fitAll.current = false;
  }, [instrumentId, period]);

  useEffect(() => {
    if (!data || !candleSeries.current || !volumeSeries.current || !chart.current) return;
    candlesByTime.current = new Map(data.map(item => [chartTime(item, period, zone), item]));
    changesByTime.current = new Map();
    data.forEach((item, index) => {
      const previousClose = data[index - 1]?.close;
      if (previousClose && previousClose > 0) changesByTime.current.set(chartTime(item, period, zone), (item.close - previousClose) / previousClose * 100);
    });
    const prices: CandlestickData[] = data.map(item => ({ time: chartTime(item, period, zone) as UTCTimestamp, open: item.open, high: item.high, low: item.low, close: item.close }));
    const volumes: HistogramData[] = data.map(item => ({ time: chartTime(item, period, zone) as UTCTimestamp, value: item.volume, color: item.close >= item.open ? 'rgba(240,100,107,.68)' : 'rgba(43,189,138,.68)' }));
    candleSeries.current.setData(prices);
    volumeSeries.current.setData(volumes);
    const nextView = `${instrumentId}:${period}`;
    if (fitAll.current) {
      chart.current.timeScale().setVisibleRange({ from: chartTime(data[0]!, period, zone) as UTCTimestamp, to: chartTime(data[data.length - 1]!, period, zone) as UTCTimestamp });
      fitAll.current = false;
    } else if (viewKey.current !== nextView) {
      chart.current.timeScale().fitContent();
    }
    viewKey.current = nextView;
  }, [data, instrumentId, period, theme]);

  const latest = focused ?? data?.at(-1);
  const sourceStatus = series?.servedBy === 'database' ? '本机数据库' : series?.status === 'snapshot' ? '真实行情快照' : '暂无行情';
  return <section className="candle-module">
    <div className="chart-toolbar"><div className="timeframes">{availablePeriods.map(item => <button key={item.key} className={period === item.key ? 'active' : ''} onClick={() => setPeriod(item.key)}>{item.label}</button>)}</div><div className="chart-options"><button className="text-button" disabled={!data?.length || loadingAll} onClick={() => void loadAll()} title={`本机已加载 ${data?.length ?? 0} 根 · 查看全部已保存历史`}>{loadingAll ? '读取中' : '全部历史'}</button><span className={`data-source ${series?.status ?? ''}`}>不复权 · {series?.source ?? '正在读取本机数据库'}{series ? ` · ${sourceStatus}${series.refreshing ? ' · 后台更新' : ''}` : ''}</span></div></div>
    {latest && <div className="ohlc-line"><span>开 <b>{latest.open.toFixed(2)}</b></span><span>高 <b className="up">{latest.high.toFixed(2)}</b></span><span>低 <b>{latest.low.toFixed(2)}</b></span><span>收 <b className={latest.close >= latest.open ? 'up' : 'down'}>{latest.close.toFixed(2)}</b></span><span>成交量 <b>{Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 }).format(latest.volume)}</b></span></div>}
    <div className="chart-canvas-wrap" style={{ height }}><div ref={container} className="chart-canvas" />{hovered && <div className="candle-hover-tooltip" role="tooltip" style={{ left: hovered.x, top: hovered.y }}><span>{new Date(hovered.time * 1000).toISOString().slice(0, period.endsWith('m') ? 16 : 10).replace('T', ' ')}</span><strong className={`candle-hover-change ${direction(hovered.changePct)}`}>{signed(hovered.changePct)}</strong></div>}{loading && <div className="chart-loading">正在读取本机 K 线…</div>}{error && <div className="chart-loading error">{error}</div>}{!loading && !error && data?.length === 0 && <div className="chart-loading">{series?.message ?? '该标的暂无可显示的行情数据'}</div>}</div>
    {series?.message && data && data.length > 0 && <div className="history-footnote">{series.message}</div>}
    <div className="chart-bottom-bar"><span>向左拖动加载更早历史 · 滚轮缩放 · 十字光标查看 OHLC</span><span title={warning ?? undefined}>{warning ? '刷新暂时失败，显示上次数据' : `${instrumentId.startsWith('sector-') ? '板块日线' : '交易所时区'} · 仅价格与成交量`}</span></div>
  </section>;
}
