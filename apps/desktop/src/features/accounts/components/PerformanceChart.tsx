import type { AccountEquityPoint } from '@weiwei/contracts';

export function PerformanceChart({ data }: { data: AccountEquityPoint[] }) {
  if (!data.length) return <div className="performance-empty">导入或录入真实交易后，在这里查看账户总资产变化。</div>;
  const low = Math.min(...data.map(item => item.value));
  const high = Math.max(...data.map(item => item.value));
  const padding = Math.max((high - low) * 0.1, Math.abs(high) * 0.01, 1);
  const minimum = low - padding;
  const range = high - low + padding * 2;
  const points = data.map((item, index) => ({
    x: index / Math.max(data.length - 1, 1) * 700,
    y: 190 - (item.value - minimum) / range * 170,
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const latest = points.at(-1)!;
  return <div className="performance-chart"><svg viewBox="0 0 700 220" preserveAspectRatio="none" role="img" aria-label="账户真实总资产变化">
    <path d={`${path} L 700 205 L 0 205 Z`} fill="var(--accent-soft)" />
    <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    <circle cx={latest.x} cy={latest.y} r="4" fill="var(--accent)" />
    <text x="0" y="214" fill="var(--faint)" fontSize="10">{data[0]!.date}</text>
    <text x="700" y="214" textAnchor="end" fill="var(--faint)" fontSize="10">{data.at(-1)!.date}</text>
  </svg><div className="chart-legend"><span><i className="legend-line" />账户总资产</span><span>真实交易与本机行情</span></div></div>;
}
