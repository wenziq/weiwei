import { useId } from 'react';

export function Sparkline({ values, positive = true, width = 82, height = 30 }: { values: number[]; positive?: boolean; width?: number; height?: number }) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return <span className="sparkline-empty" style={{ width, height }} aria-label="暂无连续走势">—</span>;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((value, index) => `${index / Math.max(1, values.length - 1) * 100},${31 - (value - min) / range * 26}`).join(' ');
  const color = positive ? 'var(--up)' : 'var(--down)';
  return <svg className="sparkline" width={width} height={height} viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".16" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs><polygon points={`0,34 ${points} 100,34`} fill={`url(#${id})`} /><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
