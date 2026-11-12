import { useEffect, useMemo, useState } from 'react';
import { Filter, Search, Star, BookOpen, Tag, FolderCog, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Instrument, ResearchDocument, WatchlistData } from '@weiwei/contracts';
import { useApi, useDebouncedValue } from '@/lib/useApi';
import { amount, money } from '@/lib/format';
import { markdownExcerpt } from '@/lib/markdown';
import { ChangeText } from '@/components/ui/ChangeText';
import { AsyncState } from '@/components/ui/AsyncState';
import { CandleChart } from '@/components/charts/CandleChart';
import { VerticalStockList } from '../components/VerticalStockList';
import { StockTagsModal, TagFilterModal } from '../components/TagModals';
import { AddInstrumentModal } from '../components/AddInstrumentModal';
import { GroupManagerModal } from '../components/GroupManagerModal';
import { api } from '@/lib/api';
import { useApp } from '@/app/providers/AppProviders';

export function WatchlistPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const group = searchParams.get('group') ?? '全部账户 · 持仓';
  const selectedId = searchParams.get('stock');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [sort, setSort] = useState('default');
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'any' | 'all'>('any');
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<Instrument | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [groupManagerOpen, setGroupManagerOpen] = useState(searchParams.get('manageGroups') === '1');
  const path = `/watchlist?group=${encodeURIComponent(group)}&query=${encodeURIComponent(debouncedQuery)}&tags=${encodeURIComponent(tagFilters.join(','))}&tag_mode=${tagMode}`;
  const { data, dataPath, loading, error, warning, refresh } = useApi<WatchlistData>(path, [path], { refetchIntervalMs: 15000 });
  const { data: research } = useApi<ResearchDocument[]>('/research');
  const navigate = useNavigate();
  const stocks = useMemo(() => {
    const result = [...(data?.stocks ?? [])];
    if (sort === 'changePct') result.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
    if (sort === 'amount') result.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
    if (sort === 'sincePct') result.sort((a, b) => b.sincePct - a.sincePct);
    if (sort === 'turnover') result.sort((a, b) => (b.turnover ?? -1) - (a.turnover ?? -1));
    return result;
  }, [data, sort]);
  const selected = stocks.find(item => item.id === selectedId) ?? stocks[0];
  useEffect(() => {
    if (dataPath === path && selected && selected.id !== selectedId) setSearchParams({ group, stock: selected.id }, { replace: true });
  }, [dataPath, path, selected?.id, selectedId, group, setSearchParams]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (!selected || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) return;
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const index = stocks.findIndex(item => item.id === selected.id);
      const next = stocks[(index + (event.key === 'ArrowDown' ? 1 : -1) + stocks.length) % stocks.length];
      if (next) setSearchParams({ group, stock: next.id });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stocks, selected, group, setSearchParams]);
  const changes = stocks.map(item => item.changePct).filter((value): value is number => value !== null);
  const average = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
  const selectedResearch = research?.find(item => item.id === selected?.id);
  const { notify } = useApp();
  const removeSelected = async () => {
    if (!selected) return;
    try {
      await api.delete(`/watchlist/${selected.id}?group=${encodeURIComponent(group)}`);
      refresh();
      notify(`${selected.name}已移出${group}`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : '移除失败'); }
  };
  const applyTagFilter = (tags: string[], mode: 'any' | 'all') => { setTagFilters(tags); setTagMode(mode); };
  const openActiveResearch = async () => {
    if (!selected) return;
    try {
      if (!selectedResearch) await api.post<ResearchDocument, Record<string, never>>(`/research/${selected.id}`, {});
      navigate(`/research?document=${selected.id}`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : '研究档案打开失败'); }
  };
  const closeGroupManager = () => {
    setGroupManagerOpen(false);
    if (searchParams.has('manageGroups')) {
      const next = new URLSearchParams(searchParams);
      next.delete('manageGroups');
      setSearchParams(next, { replace: true });
    }
  };

  return <div className="page watchlist-page">
    {warning && <p className="history-error">实时刷新暂时失败，当前保留上次真实快照。</p>}
    <div className="vertical-watch-layout"><aside className="vertical-stock-panel"><div className="watch-list-toolbar"><div><h2>{group}</h2><span>{stocks.length} 只股票</span></div><div className="watch-group-actions"><button className="icon-button" title="管理分组" aria-label="管理分组" onClick={() => setGroupManagerOpen(true)}><FolderCog size={16} /></button><button className="icon-button primary-add" title="添加股票" aria-label="添加股票" onClick={() => setAddOpen(true)}><Plus size={17} /></button></div></div><div className="vertical-group-summary"><span>等权<ChangeText value={average} /></span><span><b className="up">{stocks.filter(item => (item.changePct ?? 0) > 0).length} 涨</b> / <b className="down">{stocks.filter(item => (item.changePct ?? 0) < 0).length} 跌</b></span><span>成交<b>{amount(stocks.reduce((sum, item) => sum + (item.amount ?? 0), 0))}</b></span></div><div className="vertical-list-tools"><label className="inner-search"><Search size={12} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索股票 / 代码" /></label><button className={`icon-button${tagFilters.length ? ' active' : ''}`} title="按标签筛选" onClick={() => setFilterOpen(true)}><Filter size={14} />{tagFilters.length > 0 && <small>{tagFilters.length}</small>}</button><select value={sort} onChange={event => setSort(event.target.value)} aria-label="股票排序"><option value="default">默认排序</option><option value="changePct">今日涨跌</option><option value="amount">成交额</option><option value="sincePct">入组以来</option><option value="turnover">换手率</option></select></div><AsyncState loading={loading} error={error} empty={!stocks.length}><VerticalStockList stocks={stocks} selectedId={selected?.id ?? null} onSelect={id => setSearchParams({ group, stock: id })} /></AsyncState><div className="vertical-list-footer"><span>{stocks.length} 只显示{tagFilters.length > 0 ? ` · ${tagFilters.join('、')}` : ''}</span><span><kbd>↑</kbd><kbd>↓</kbd> 连续切换</span></div></aside>
      <div className="vertical-detail"><AsyncState loading={loading} error={error} empty={!selected}>{selected && <><div className="vertical-chart-panel"><div className="chart-stock-head"><div><div className="stock-title"><h2>{selected.name}</h2><span>{selected.code} · {selected.market}</span></div><div className="stock-quote"><strong>{money(selected.price, selected.currency)}</strong><ChangeText value={selected.changePct} /></div><small className="quote-provenance">{selected.dataSource} · {selected.dataStatus === 'snapshot' ? '真实快照' : selected.dataStatus === 'cached' ? '本机缓存' : '暂不可用'} · {selected.quoteTime ? new Date(selected.quoteTime).toLocaleString('zh-CN') : '报价时间未知'}</small></div><div className="chart-stock-actions"><button className="button compact ghost" onClick={() => setEditingStock(selected)}><Tag size={14} />标签</button><button className="button compact ghost" onClick={removeSelected} title="移出当前分组"><Star size={14} />已自选</button><button className="button compact ghost" onClick={openActiveResearch}><BookOpen size={14} />研究档案</button></div></div><CandleChart instrumentId={selected.id} height={390} /></div><aside className="watch-insight-strip"><section className="insight-research"><div className="panel-head"><h3>研究摘要</h3><span className={`research-state ${selected.status === '已完成' ? 'done' : 'todo'}`}>{selected.status}</span></div><blockquote>{selectedResearch ? markdownExcerpt(selectedResearch.contentMarkdown) : '尚未创建研究档案'}</blockquote><div className="tag-list">{selected.tags.map(tag => <span className="stock-tag" key={tag}>#{tag}</span>)}</div><button className="button ghost" onClick={openActiveResearch}>完整研究档案 →</button></section><section className="insight-meta"><div className="panel-head"><h3>研究信息</h3></div><dl className="research-meta"><div><dt>研究完成</dt><dd>{selectedResearch?.completedAt ?? '尚未完成'}</dd></div><div><dt>下次复查</dt><dd>{selectedResearch?.reviewAt ?? '未设置'}</dd></div><div><dt>历史版本</dt><dd>{selectedResearch?.history?.length ?? 0} 个</dd></div></dl></section><section className="insight-position"><div className="panel-head"><h3>行情信息</h3></div><div className="position-mini"><div><span>成交额</span><strong>{amount(selected.amount)}</strong></div><div><span>换手率</span><strong>{selected.turnover === null ? '—' : `${selected.turnover.toFixed(2)}%`}</strong></div><div><span>总市值</span><strong>{amount(selected.cap)}</strong></div><div><span>报价来源</span><strong>{selected.dataSource}</strong></div></div></section></aside></>}</AsyncState></div>
    </div>
    <AddInstrumentModal open={addOpen} onClose={() => setAddOpen(false)} currentGroup={group} groups={data?.groups ?? []} existingIds={stocks.map(item => item.id)} onAdded={(stock, targetGroup) => { setAddOpen(false); refresh(); setSearchParams({ group: targetGroup, stock: stock.id }); }} />
    <StockTagsModal stock={editingStock} onClose={() => setEditingStock(null)} onSaved={() => refresh()} />
    <TagFilterModal open={filterOpen} onClose={() => setFilterOpen(false)} stocks={data?.stocks ?? []} selected={tagFilters} mode={tagMode} onApply={applyTagFilter} />
    <GroupManagerModal open={groupManagerOpen} onClose={closeGroupManager} groups={data?.groups ?? []} currentGroup={group} onChanged={refresh} onSelect={name => { setGroupManagerOpen(false); setSearchParams({ group: name }); }} />
  </div>;
}
