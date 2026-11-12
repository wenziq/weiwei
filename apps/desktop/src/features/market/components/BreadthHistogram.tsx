import type { BreadthBucket } from '@weiwei/contracts';

export function BreadthHistogram({ data, onSelect, timestamp, loading = false }: { data: BreadthBucket[]; onSelect: (bucket: BreadthBucket) => void; timestamp?: string | null; loading?: boolean }) {
  if (!data.length) return <div className="breadth-v2"><div className="breadth-v2-head"><div className="breadth-v2-title"><strong>涨跌分布</strong><span>{loading ? '正在刷新市场统计…' : '市场统计暂不可用'}</span></div></div><div className="breadth-xlabels breadth-labels-pending">{['跌停', '< -7%', '-7 ~ -5%', '-5 ~ -3%', '-3 ~ 0%', '0%', '0 ~ 3%', '3 ~ 5%', '5 ~ 7%', '> 7%', '涨停'].map(label => <span key={label}>{label}</span>)}</div></div>;
  const max = Math.max(1, ...data.map(item => item.count));
  const up = data.filter(item => item.side === 'positive').reduce((sum, item) => sum + item.count, 0);
  const down = data.filter(item => item.side === 'negative').reduce((sum, item) => sum + item.count, 0);
  const mood = up > down * 1.5 ? '市场人气较高' : down > up * 1.5 ? '市场人气偏弱' : '市场涨跌分化';
  return <div className="breadth-v2"><div className="breadth-v2-head"><div className="breadth-v2-title"><strong>涨跌分布</strong><span>{mood}</span></div><time>{timestamp ? new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</time></div><div className="breadth-chart">{data.map(bucket => <button key={`${bucket.side}-${bucket.range}`} className={`breadth-column ${bucket.side}`} onClick={() => onSelect(bucket)} title={`${bucket.range} · ${bucket.count} 家，点击查看`}><span className="breadth-count">{bucket.count.toLocaleString()}</span><span className="breadth-bar-rect" style={{ height: Math.max(3, Math.sqrt(bucket.count) / Math.sqrt(max) * 76) }} /></button>)}</div><div className="breadth-xlabels">{data.map((bucket, index) => <span className={bucket.side} key={`${bucket.range}-${index}`}>{bucket.label}</span>)}</div></div>;
}
