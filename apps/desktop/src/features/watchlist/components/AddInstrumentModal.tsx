import { useEffect, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import type { Instrument, WatchGroup } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApi, useDebouncedValue } from '@/lib/useApi';
import { useApp } from '@/app/providers/AppProviders';
import { money } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { ChangeText } from '@/components/ui/ChangeText';

export function AddInstrumentModal({ open, onClose, currentGroup, groups, existingIds, onAdded }: { open: boolean; onClose: () => void; currentGroup: string; groups: WatchGroup[]; existingIds: string[]; onAdded: (stock: Instrument, group: string) => void }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(currentGroup === '全部账户 · 持仓' ? '观察' : currentGroup);
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounced = useDebouncedValue(query, 250);
  const { data, loading, error } = useApi<Instrument[]>(open ? `/market/catalog/search?query=${encodeURIComponent(debounced)}&limit=30` : null, [debounced, open]);
  useEffect(() => {
    if (open) {
      setGroup(currentGroup === '全部账户 · 持仓' ? '观察' : currentGroup);
      setQuery('');
    }
  }, [open, currentGroup]);
  const { notify } = useApp();
  const add = async (stock: Instrument) => {
    setAddingId(stock.id);
    try { const added = await api.post<Instrument, { group: string }>(`/watchlist/${stock.id}`, { group }); onAdded(added, group); }
    catch (reason) { notify(reason instanceof Error ? reason.message : '添加失败'); }
    finally { setAddingId(null); }
  };
  return <Modal open={open} onClose={onClose} title="添加股票到自选" className="wide" footer={<span className="dialog-subtitle">加入自选不等于买入或持仓，不会修改任何证券账户。</span>}>
    <div className="form-grid" style={{ marginBottom: 12 }}><label>搜索全市场<div className="inner-search"><Search size={14} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="股票名称、代码或拼音首字母" /></div></label><label>加入分组<select value={group} onChange={event => setGroup(event.target.value)}>{groups.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label></div>
    <div className="dialog-subtitle">覆盖沪深京全市场、港交所股票与 REIT、美股非 ETF 证券。显示真实行情快照，离线时使用本机目录与缓存。</div>
    {loading && <div className="async-state">正在搜索全市场…</div>}{error && <div className="async-state error">{error}</div>}
    <div className="catalog-results">{data?.map(stock => <div className="setting-row" key={stock.id}><span><strong>{stock.name}</strong><small>{stock.code} · {stock.market} · {stock.industry}</small></span><span className="catalog-quote"><strong>{money(stock.price, stock.currency)}</strong><ChangeText value={stock.changePct} /></span><button className="button compact ghost" disabled={existingIds.includes(stock.id) || addingId === stock.id} onClick={() => add(stock)}>{existingIds.includes(stock.id) ? <><Check size={13} />已加入</> : addingId === stock.id ? '加入中…' : <><Plus size={13} />加入</>}</button></div>)}</div>
  </Modal>;
}
