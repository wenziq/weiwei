import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useDebouncedValue } from '@/lib/useApi';
import { api } from '@/lib/api';
import type { Instrument, ResearchDocument } from '@weiwei/contracts';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/app/providers/AppProviders';
import { markdownExcerpt } from '@/lib/markdown';
import { InstrumentPreviewModal } from '@/features/market/components/InstrumentPreviewModal';

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query);
  const { data: instruments, loading } = useApi<Instrument[]>(open ? `/market/catalog/search?query=${encodeURIComponent(debounced)}&limit=8` : null, [debounced, open]);
  const { data: research } = useApi<ResearchDocument[]>(open ? '/research' : null, [open]);
  const navigate = useNavigate();
  const { notify } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [previewStock, setPreviewStock] = useState<Instrument | null>(null);
  useEffect(() => {
    if (!open) { setQuery(''); setError(null); }
  }, [open]);
  const documents = (research ?? []).filter(item => `${item.title}${item.contentMarkdown}`.toLowerCase().includes(debounced.toLowerCase())).slice(0, 3);
  const add = async (stock: Instrument) => {
    setError(null);
    try {
      await api.post<Instrument, Record<string, never>>(`/watchlist/${stock.id}`, {});
      window.dispatchEvent(new Event('weiwei-tags-changed'));
      notify(`${stock.name}已加入自选`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '加入自选失败';
      setError(message);
      notify(message);
    }
  };
  return <>
    <Modal open={open} onClose={onClose} title="全局搜索" className="command-modal" hideHeader>
      <div className="command-input"><Search size={18} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="股票名称、代码、拼音首字母或研究关键词" /><kbd>ESC</kbd></div>
      <div className="command-body"><div className="command-label">点击股票查看详情 · 点击 + 加入自选</div>{error && <p className="history-error" role="alert">{error}</p>}
        {loading && <div className="command-empty">正在搜索全市场…</div>}
        {(instruments ?? []).map((stock: Instrument) => <div className="command-stock-row" key={stock.id}>
          <button className="command-stock-main" title={`查看 ${stock.name} 详情`} onClick={() => { setPreviewStock(stock); onClose(); }}><span className="command-symbol">{stock.name[0]}</span><div><strong>{stock.name}</strong><small>{stock.code} · {stock.market} · {stock.industry}</small></div></button>
          <button className="command-add-button" aria-label={`加入自选 ${stock.name}`} title="加入自选" onClick={() => void add(stock)}><Plus size={15} /></button>
        </div>)}
        <div className="command-label">研究笔记</div>
        {documents.map(document => <button key={document.id} onClick={() => { navigate(`/research?document=${document.id}`); onClose(); }}><span className="command-symbol note"><Search size={14} /></span><div><strong>{document.title}</strong><small>{markdownExcerpt(document.contentMarkdown)}</small></div></button>)}
        {!documents.length && !instruments?.length && !loading && <div className="command-empty">没有找到匹配内容</div>}
      </div>
    </Modal>
    <InstrumentPreviewModal stock={previewStock} onClose={() => setPreviewStock(null)} />
  </>;
}
