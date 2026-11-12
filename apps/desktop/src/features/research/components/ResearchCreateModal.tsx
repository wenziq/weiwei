import { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import type { Instrument, ResearchDocument } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApi, useDebouncedValue } from '@/lib/useApi';
import { Modal } from '@/components/ui/Modal';

export function ResearchCreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (document: ResearchDocument) => void }) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query);
  const { data, loading } = useApi<Instrument[]>(open ? `/market/catalog/search?query=${encodeURIComponent(debounced)}&limit=20` : null, [debounced, open]);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = async (stock: Instrument) => {
    setCreatingId(stock.id); setError(null);
    try { onCreated(await api.post<ResearchDocument, Record<string, never>>(`/research/${stock.id}`, {})); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '研究档案创建失败'); }
    finally { setCreatingId(null); }
  };
  return <Modal open={open} onClose={onClose} title="新建研究档案" className="wide" footer={<span className="dialog-subtitle">选择股票后直接进入全屏 Markdown 编辑器。</span>}>
    <label className="inner-search" style={{ marginBottom: 12 }}><Search size={14} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索股票名称、代码或拼音首字母" /></label>
    {loading && <div className="async-state">正在搜索全市场…</div>}{error && <p className="history-error" role="alert">{error}</p>}
    <div className="catalog-results">{data?.map(stock => <div className="setting-row" key={stock.id}><span><strong>{stock.name}</strong><small>{stock.code} · {stock.market} · {stock.industry}</small></span><button className="button compact ghost" disabled={creatingId === stock.id} onClick={() => create(stock)}><BookOpen size={13} />{creatingId === stock.id ? '创建中…' : '创建研究'}</button></div>)}</div>
  </Modal>;
}
