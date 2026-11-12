import type { TurnoverComparison } from '@weiwei/contracts';

function path(values: (number | null)[], width: number, height: number) {
  const valid = values.filter((value): value is number => value !== null);
  if (!valid.length) return '';
  const min = Math.min(...valid), max = Math.max(...valid), range = max - min || 1;
  return values.map((value, index) => value === null ? null : `${index ? 'L' : 'M'} ${index / Math.max(1, values.length - 1) * width} ${height - 4 - (value - min) / range * (height - 8)}`).filter(Boolean).join(' ');
}
export function TurnoverChart({ data, loading = false }: { data: TurnoverComparison; loading?: boolean }) {
  const width = 420, height = 75;
  if (data.today.length < 2) return <div className="market-chart-pending"><span>{loading ? '正在刷新分时成交额…' : '沪深分时成交额暂不可用'}</span><div className="chart-legend"><span><i className="legend-line" />今日累计成交额</span><span><i className="legend-line previous" />昨日同期</span></div></div>;
  return <div className="turnover-chart"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><path d={path(data.previous, width, height)} fill="none" stroke="var(--faint)" strokeDasharray="3 3" /><path d={`${path(data.today, width, height)} L ${width} ${height} L 0 ${height} Z`} fill="var(--accent-soft)" /><path d={path(data.today, width, height)} fill="none" stroke="var(--accent)" strokeWidth="1.6" /></svg><div className="chart-legend"><span><i className="legend-line" />今日累计成交额</span>{data.previous.some(value => value !== null) && <span><i className="legend-line previous" />昨日同期</span>}</div></div>;
}
