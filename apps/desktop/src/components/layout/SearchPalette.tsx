import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useDebouncedValue } from '@/lib/useApi';
import { api } from '@/lib/api';
import type { Instrument, ResearchDocument } from '@weiwei/contracts';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/app/providers/AppProviders';
import { markdownExcerpt } from '@/lib/markdown';

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query);
  const { data: instruments, loading } = useApi<Instrument[]>(open ? `/market/catalog/search?query=${encodeURIComponent(debounced)}&limit=8` : null, [debounced, open]);
  const { data: research } = useApi<ResearchDocument[]>(open ? '/research' : null, [open]);
  const navigate = useNavigate();
  const { notify } = useApp();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!open) setQuery(''); setError(null); }, [open]);
  const documents = (research ?? []).filter(item => `${item.title}${item.contentMarkdown}`.toLowerCase().includes(debounced.toLowerCase())).slice(0, 3);
  const addAndOpen = async (stock: Instrument) => {
    setError(null);
    try {
      await api.post<Instrument, { group: string }>(`/watchlist/${stock.id}`, { group: '观察' });
      window.dispatchEvent(new Event('weiwei-groups-changed'));
      navigate(`/watchlist?group=${encodeURIComponent('观察')}&stock=${stock.id}`);
      onClose();
    } catch (reason) { const message = reason instanceof Error ? reason.message : '加入自选失败'; setError(message); notify(message); }
  };
  return <Modal open={open} onClose={onClose} title="全局搜索" className="command-modal" hideHeader>
    <div className="command-input"><Search size={18} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="股票名称、代码、拼音首字母或研究关键词" /><kbd>ESC</kbd></div>
    <div className="command-body"><div className="command-label">沪深京、港股与美股目录 · 点击加入观察分组</div>{error && <p className="history-error" role="alert">{error}</p>}
      {loading && <div className="command-empty">正在搜索全市场…</div>}
      {(instruments ?? []).map((stock: Instrument) => <button key={stock.id} onClick={() => addAndOpen(stock)} title="加入自选并查看"><span className="command-symbol">{stock.name[0]}</span><div><strong>{stock.name}</strong><small>{stock.code} · {stock.market} · {stock.industry}</small></div><Plus size={14} /></button>)}
      <div className="command-label">研究笔记</div>
      {documents.map(document => <button key={document.id} onClick={() => { navigate(`/research?document=${document.id}`); onClose(); }}><span className="command-symbol note"><Search size={14} /></span><div><strong>{document.title}</strong><small>{markdownExcerpt(document.contentMarkdown)}</small></div></button>)}
      {!documents.length && !instruments?.length && !loading && <div className="command-empty">没有找到匹配内容</div>}
    </div>
  </Modal>;
}
