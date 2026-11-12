import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Instrument } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';

const suggestions = ['算力', '光模块', 'CPO', '高股息', '长期', '观察', '高成长', '底仓', '新能源', '半导体', '港股', '美股'];

export function StockTagsModal({ stock, onClose, onSaved }: { stock: Instrument | null; onClose: () => void; onSaved: (stock: Instrument) => void }) {
  const [tags, setTags] = useState<string[]>([]);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setTags(stock?.tags ?? []); setValue(''); setError(null); }, [stock]);
  if (!stock) return null;
  const add = (tag: string) => { const cleaned = tag.trim().replace(/^#/, ''); if (cleaned && !tags.includes(cleaned)) setTags(current => [...current, cleaned]); setValue(''); };
  const save = async () => { setSaving(true); setError(null); try { const updated = await api.patch<Instrument, { tags: string[] }>(`/watchlist/${stock.id}/tags`, { tags }); onSaved(updated); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : '标签保存失败'); } finally { setSaving(false); } };
  return <Modal open onClose={onClose} title={`${stock.name} · 股票标签`} footer={<><button className="button ghost" onClick={onClose}>取消</button><button className="button primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存标签'}</button></>}><p className="dialog-subtitle">标签用于自选清单筛选，一只股票可以拥有多个标签。保存会写入个人服务器。</p><div className="tag-list" style={{ minHeight: 40 }}>{tags.map(tag => <span className="stock-tag" key={tag}>{tag}<button aria-label={`移除 ${tag}`} onClick={() => setTags(current => current.filter(item => item !== tag))}><X size={11} /></button></span>)}</div><div className="tag-add-row" style={{ display: 'flex', gap: 8, margin: '14px 0' }}><input style={{ flex: 1 }} value={value} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(value); } }} placeholder="输入新标签，按 Enter 添加" /><button className="button ghost" onClick={() => add(value)}>添加</button></div><div className="tag-list">{suggestions.map(tag => <button className="stock-tag" key={tag} onClick={() => add(tag)}>+ {tag}</button>)}</div>{error && <p className="history-error" role="alert">{error}</p>}</Modal>;
}

export function TagFilterModal({ open, onClose, stocks, selected, mode, onApply }: { open: boolean; onClose: () => void; stocks: Instrument[]; selected: string[]; mode: 'any' | 'all'; onApply: (tags: string[], mode: 'any' | 'all') => void }) {
  const [checked, setChecked] = useState<string[]>(selected);
  const [matchMode, setMatchMode] = useState<'any' | 'all'>(mode);
  useEffect(() => { setChecked(selected); setMatchMode(mode); }, [open, selected, mode]);
  const tags = [...new Set(stocks.flatMap(stock => stock.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const toggle = (tag: string) => setChecked(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]);
  return <Modal open={open} onClose={onClose} title="按标签筛选股票" footer={<><button className="button ghost" onClick={() => setChecked([])}>清空选择</button><button className="button primary" onClick={() => { onApply(checked, matchMode); onClose(); }}>应用筛选</button></>}><div className="setting-row"><span>多标签组合方式</span><div className="segmented small"><button className={matchMode === 'any' ? 'active' : ''} onClick={() => setMatchMode('any')}>任一匹配</button><button className={matchMode === 'all' ? 'active' : ''} onClick={() => setMatchMode('all')}>全部匹配</button></div></div>{tags.map(tag => <label className="setting-row tag-filter-row" key={tag}><span><span className="stock-tag">{tag}</span><small>{stocks.filter(stock => stock.tags.includes(tag)).length} 只</small></span><input type="checkbox" checked={checked.includes(tag)} onChange={() => toggle(tag)} /></label>)}</Modal>;
}
