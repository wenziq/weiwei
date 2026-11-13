import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react';
import type { MacroIndicator, MacroSeries } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useApp } from '@/app/providers/AppProviders';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { MacroChart } from '../components/MacroChart';

const initialForm = { name: '', category: '自定义', unit: '点', kind: 'manual' as 'manual' | 'fred', code: '', content: '' };
const rangeOptions = [{ value: '1y', label: '近 1 年' }, { value: '3y', label: '近 3 年' }, { value: '5y', label: '近 5 年' }, { value: '10y', label: '近 10 年' }, { value: 'all', label: '全部历史' }] as const;

function latestValue(item: MacroIndicator) {
  if (item.latest === null) return item.refreshing ? '正在准备历史' : '—';
  return `${item.latest.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${item.unit ? ` ${item.unit}` : ''}`;
}

function dateLabel(time: number | null) {
  return time ? new Date(time * 1000).toISOString().slice(0, 10) : '等待历史数据';
}

export function MacroPage() {
  const [selected, setSelected] = useState(['cn-pmi-manufacturing', 'cn-cpi-yoy']);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('全部');
  const [category, setCategory] = useState('全部');
  const [range, setRange] = useState<'1y' | '3y' | '5y' | '10y' | 'all'>('5y');
  const [normalized, setNormalized] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [form, setForm] = useState(initialForm);
  const { notify } = useApp();
  const { data: indicators, error: catalogError, refresh: refreshIndicators } = useApi<MacroIndicator[]>('/macro/indicators', [], { refetchIntervalMs: 30000 });
  const selectedKey = selected.join(',');
  const { data: series, error: seriesError } = useApi<MacroSeries[]>(selectedKey ? `/macro/series?ids=${encodeURIComponent(selectedKey)}` : null, [selectedKey], { refetchIntervalMs: historyRefreshing ? 1500 : 60000 });
  useEffect(() => { setHistoryRefreshing(Boolean(series?.some(item => item.refreshing))); }, [series]);
  const filtered = useMemo(() => (indicators ?? []).filter(item => (region === '全部' || item.region === region) && (category === '全部' || item.category === category) && `${item.name}${item.source}`.toLowerCase().includes(query.trim().toLowerCase())), [indicators, query, region, category]);
  const groups = useMemo(() => {
    const result = new Map<string, MacroIndicator[]>();
    filtered.forEach(item => result.set(item.category, [...(result.get(item.category) ?? []), item]));
    return [...result.entries()];
  }, [filtered]);
  const selectedItems = selected.map(id => indicators?.find(item => item.id === id)).filter((item): item is MacroIndicator => Boolean(item));
  const categories = [...new Set((indicators ?? []).map(item => item.category))];
  const toggle = (id: string) => {
    if (selected.includes(id)) setSelected(current => current.filter(item => item !== id));
    else if (selected.length >= 4) notify('最多同时对比 4 个指标，可先取消一个再添加');
    else setSelected(current => [...current, id]);
  };
  const submit = async () => {
    setBusy(true);
    try {
      const created = await api.post<MacroIndicator, typeof form>('/macro/custom', form);
      setSelected(current => [...new Set([...current, created.id])].slice(-4));
      setAddOpen(false);
      setForm(initialForm);
      refreshIndicators();
      notify(`已添加“${created.name}”，历史数据保存在服务器`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : '添加指标失败'); }
    finally { setBusy(false); }
  };
  const remove = async (item: MacroIndicator) => {
    if (!window.confirm(`删除自定义指标“${item.name}”及其历史数据？`)) return;
    try {
      await api.delete(`/macro/custom/${item.id}`);
      setSelected(current => current.filter(id => id !== item.id));
      refreshIndicators();
      notify(`已删除“${item.name}”`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : '删除失败'); }
  };
  return <div className="page macro-page">
    <PageHeader title="宏观研究" subtitle="增长、通胀、就业、利率与流动性 · 历史数据保存在服务器" actions={<button className="button primary" onClick={() => setAddOpen(true)}><Plus size={15} />添加指标</button>} />
    {catalogError && <div className="inline-load-error" role="alert">{catalogError}</div>}
    <div className="macro-summary-grid">{selectedItems.map(item => <article className="macro-summary-card" key={item.id}>
      <div><span>{item.category} · {item.region}</span><small>{item.frequency}</small></div><h3>{item.name}</h3><strong>{latestValue(item)}</strong>
      <footer><span>{item.change === null ? '较上期 —' : `较上期 ${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}${item.unit === '%' ? ' 个百分点' : ` ${item.unit}`}`}</span><time>{dateLabel(item.time)}</time></footer>
      <div className="macro-card-source">{item.source}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`查看${item.name}数据来源`}><ExternalLink size={12} /></a>}{item.custom && <button className="icon-button" aria-label={`删除${item.name}`} onClick={() => void remove(item)}><Trash2 size={13} /></button>}</div>
      {item.error && <p className="macro-error" title={item.error}>更新失败，保留已有历史</p>}
    </article>)}</div>
    <div className="macro-workspace">
      <aside className="macro-catalog"><div className="macro-catalog-head"><div><h2>指标目录</h2><span>{filtered.length} 个可用指标</span></div><span>已选 {selected.length} / 4</span></div>
        <div className="macro-catalog-tools"><label className="inner-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索 PMI、CPI、利率…" /></label><div className="macro-filter-row"><select aria-label="指标地区" value={region} onChange={event => setRegion(event.target.value)}><option>全部</option><option>中国</option><option>美国</option><option>自定义</option></select><select aria-label="指标分类" value={category} onChange={event => setCategory(event.target.value)}><option>全部</option>{categories.map(item => <option key={item}>{item}</option>)}</select></div></div>
        <div className="macro-catalog-list">{groups.map(([name, items]) => <section key={name} className="macro-category"><h3>{name}<span>{items.length}</span></h3>{items.map(item => <div className={`macro-indicator-row${selected.includes(item.id) ? ' selected' : ''}`} key={item.id}>
          <button className="macro-indicator-select" aria-pressed={selected.includes(item.id)} onClick={() => toggle(item.id)}><span className="macro-indicator-check">{selected.includes(item.id) ? '✓' : '+'}</span><span className="macro-indicator-name"><strong>{item.name}</strong><small>{item.source} · {item.frequency}{item.custom ? ' · 自定义' : ''}</small></span><span className="macro-indicator-latest"><b>{latestValue(item)}</b><small>{dateLabel(item.time)}</small></span></button>
        </div>)}</section>)}{!filtered.length && <div className="macro-empty">没有找到匹配的指标，请缩短关键词或切换分类。</div>}</div>
      </aside>
      <section className="macro-analysis"><div className="macro-analysis-head"><div><h2>历史趋势对比</h2><p>{selected.length ? `${selected.length} 个指标 · 单位不同可统一为起点 100` : '从左侧选择指标开始比较'}</p></div><div className="segmented"><button className={!normalized ? 'active' : ''} onClick={() => setNormalized(false)}>原始值</button><button className={normalized ? 'active' : ''} onClick={() => setNormalized(true)}>起点 = 100</button></div></div>
        <div className="macro-range-tabs">{rangeOptions.map(option => <button key={option.value} className={range === option.value ? 'active' : ''} onClick={() => setRange(option.value)}>{option.label}</button>)}</div>
        {seriesError && <div className="inline-load-error" role="alert">{seriesError}</div>}
        {series?.length ? <MacroChart series={series} range={range} normalized={normalized} /> : <div className="macro-chart-pending"><LoaderCircle size={20} className={selected.length ? 'spin' : ''} /><strong>{selected.length ? '正在读取已有历史，缺失时会优先采集' : '尚未选择指标'}</strong><span>已有内容会先显示，后台更新不会阻塞页面。</span></div>}
        <div className="macro-analysis-note"><span>数据日期按各来源发布的统计期记录，不代表发布日期。</span><span>来源：国家统计局 / 商务部 / 东方财富 / FRED / 个人录入</span></div>
      </section>
    </div>
    <Modal open={addOpen} onClose={() => { if (!busy) setAddOpen(false); }} title="添加自定义指标" className="wide" footer={<><button className="button ghost" disabled={busy} onClick={() => setAddOpen(false)}>取消</button><button className="button primary" disabled={busy || !form.name.trim() || (form.kind === 'fred' ? !form.code.trim() : !form.content.trim())} onClick={() => void submit()}>{busy ? '正在保存…' : '保存并加入对比'}</button></>}>
      <div className="macro-custom-kind segmented"><button className={form.kind === 'manual' ? 'active' : ''} onClick={() => setForm(current => ({ ...current, kind: 'manual' }))}>手动历史数据</button><button className={form.kind === 'fred' ? 'active' : ''} onClick={() => setForm(current => ({ ...current, kind: 'fred' }))}>FRED 公开序列</button></div>
      <div className="macro-custom-grid"><label className="settings-field">指标名称<input autoFocus value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="例如：我的流动性观察值" /></label><label className="settings-field">分类<input value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} /></label><label className="settings-field">单位<input value={form.unit} onChange={event => setForm(current => ({ ...current, unit: event.target.value }))} placeholder="例如：%、点、亿元" /></label></div>
      {form.kind === 'fred' ? <label className="settings-field">FRED 序列代码<input value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="例如：DGS10" /><small>保存后由服务器优先采集完整公开历史，可在 FRED 网站查询序列代码。</small></label> : <label className="settings-field">历史数据（CSV）<textarea className="macro-csv-input" value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} placeholder={'日期,数值\n2024-01-01,100\n2024-02-01,103.5'} /><small>每行一个日期和数值；支持年-月-日、年/月/日、年月。相同日期保留最后一条。</small></label>}
    </Modal>
  </div>;
}
