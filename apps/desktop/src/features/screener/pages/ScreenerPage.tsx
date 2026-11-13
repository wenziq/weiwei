import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Download, LoaderCircle, Play, Plus, Settings, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { AIStatus, Instrument, ScreenerCondition, ScreenerCoverage, ScreenerResult, Sector } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { amount, downloadText } from '@/lib/format';
import { useApp } from '@/app/providers/AppProviders';
import { usePersistentState } from '@/lib/usePersistentState';
import { useApi } from '@/lib/useApi';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { ConditionEditorRow } from '../components/ConditionEditorRow';
import { ScreenerCoveragePanel } from '../components/ScreenerCoveragePanel';
import { ScreenerResults } from '../components/ScreenerResults';

const defaultConditions: ScreenerCondition[] = [{ field: 'dividend', operator: 'gte', value: 4 }, { field: 'cap', operator: 'gte', value: 500 }, { field: 'roe', operator: 'gte', value: 10 }, { field: 'industry', operator: 'exclude', value: '房地产' }];
interface ScreenerScheme { name: string; conditions: ScreenerCondition[] }
const defaultSchemes: ScreenerScheme[] = [{ name: '高股息稳健筛选', conditions: defaultConditions }, { name: 'CPO 概念筛选', conditions: [{ field: 'concept', operator: 'include', value: 'CPO' }] }, { name: '高 ROE 低负债', conditions: [{ field: 'roe', operator: 'gte', value: 15 }, { field: 'debt', operator: 'lte', value: 50 }] }];
const valid = (condition: ScreenerCondition) => {
  if (condition.field === 'industry' || condition.field === 'concept') return Boolean(condition.value) && ['include', 'exclude'].includes(condition.operator);
  if (condition.operator === 'between') return Array.isArray(condition.value) && condition.value.length === 2 && condition.value.every(Number.isFinite) && condition.value[0]! <= condition.value[1]!;
  return typeof condition.value === 'number' && Number.isFinite(condition.value) && ['gte', 'lte'].includes(condition.operator);
};

export function ScreenerPage() {
  const [searchParams] = useSearchParams();
  const concept = searchParams.get('concept');
  const industry = searchParams.get('industry');
  const initialConditions: ScreenerCondition[] = industry ? [{ field: 'industry', operator: 'include', value: industry }] : concept ? [{ field: 'concept', operator: 'include', value: concept }] : defaultConditions;
  const [conditions, setConditions] = useState<ScreenerCondition[]>(initialConditions);
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [description, setDescription] = useState('ROE 大于 10%，股息率不低于 4%，总市值 500 亿以上');
  const { notify } = useApp();
  const [schemes, setSchemes] = usePersistentState<ScreenerScheme[]>('weiwei-screener-schemes', defaultSchemes);
  const [activePlan, setActivePlan] = useState<number | null>(concept || industry ? null : 0);
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [schemeName, setSchemeName] = useState('');
  const [reviewConditions, setReviewConditions] = useState<ScreenerCondition[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [parseSource, setParseSource] = useState('');
  const [parsing, setParsing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [market, setMarket] = useState<'all' | 'CN' | 'HK' | 'US'>('all');
  const { data: coverage, refresh: refreshCoverage } = useApi<ScreenerCoverage>('/screener/status', [], { refetchIntervalMs: 3000 });
  const { data: sectorData } = useApi<Sector[]>('/market/sectors', [], { refetchIntervalMs: coverage?.running ? 5000 : 60000 });
  const sectors = sectorData ?? [];
  const { data: aiStatus, refresh: refreshAIStatus } = useApi<AIStatus>('/ai/status');
  useEffect(() => {
    const changed = () => refreshAIStatus();
    window.addEventListener('weiwei-ai-config-changed', changed);
    return () => window.removeEventListener('weiwei-ai-config-changed', changed);
  }, [refreshAIStatus]);
  const validConditions = conditions.every(valid);
  const previousCoverage = useRef(0);
  const run = useCallback(async (nextConditions = conditions) => {
    if (!nextConditions.every(valid)) { notify('请补全条件：名称需要选择，数值需要填写，区间起点不能大于终点'); return; }
    setLoading(true); setScreenError(null);
    try { const next = await api.post<ScreenerResult, { conditions: ScreenerCondition[]; market: string }>('/screener/run', { conditions: nextConditions, market }); setResult(next); setSelectedIds([]); }
    catch (reason) { const message = reason instanceof Error ? reason.message : '筛选失败'; setScreenError(`${message}。当前保留上一次成功结果，未将其替换。`); notify(message); }
    finally { setLoading(false); }
  }, [conditions, notify, market]);
  useEffect(() => {
    const count = coverage?.markets.CN.withFinancials ?? 0;
    if (previousCoverage.current === 0 && count > 0 && activePlan === 0 && result?.count === 0) void run();
    previousCoverage.current = count;
  }, [coverage?.markets.CN.withFinancials, activePlan, result?.count, run]);
  useEffect(() => { void run(initialConditions); }, []);
  const saveScheme = () => { setSchemeName(activePlan === null ? `我的选股方案 ${schemes.length + 1}` : schemes[activePlan]?.name ?? ''); setSchemeOpen(true); };
  const newScheme = () => { setActivePlan(null); setSchemeName(''); setSchemeOpen(true); };
  const confirmScheme = () => {
    const name = schemeName.trim();
    if (!name) return;
    if (activePlan === null) {
      setSchemes(current => [...current, { name, conditions: [] }]);
      setActivePlan(schemes.length); setConditions([]); setResult(null);
      notify(`已新建“${name}”，请添加筛选条件`);
    } else {
      setSchemes(current => current.map((scheme, index) => index === activePlan ? { name, conditions } : scheme));
      notify(`“${name}”已保存到本机`);
    }
    setSchemeOpen(false);
  };
  const switchScheme = (index: number) => { const scheme = schemes[index]!; setActivePlan(index); setConditions(scheme.conditions); void run(scheme.conditions); };
  const updateCondition = (index: number, condition: ScreenerCondition) => setConditions(current => current.map((item, itemIndex) => itemIndex === index ? condition : item));
  const parseDescription = async () => {
    const query = description.trim();
    if (!query || parsing) return;
    setParsing(true);
    try {
      if (aiStatus?.configured) {
        const response = await api.post<{ conditions: ScreenerCondition[]; provider: string; model: string }, { query: string }>('/ai/parse-screener', { query });
        setReviewConditions(response.conditions); setParseSource(`${response.provider} · ${response.model} · 已发送这段描述`);
      } else {
        const next: ScreenerCondition[] = [];
        if (description.includes('股息率')) next.push({ field: 'dividend', operator: 'gte', value: Number(description.match(/股息率\s*(\d+(?:\.\d+)?)/)?.[1] ?? 4) });
        if (description.includes('总市值')) next.push({ field: 'cap', operator: 'gte', value: Number(description.match(/总市值\D*(\d+(?:\.\d+)?)/)?.[1] ?? 500) });
        if (/ROE/i.test(description)) next.push({ field: 'roe', operator: 'gte', value: Number(description.match(/ROE\D*(\d+(?:\.\d+)?)/i)?.[1] ?? 10) });
        if (/管理层优秀|护城河/.test(description)) { notify('“管理层优秀”等描述没有可复现字段，请改用明确的数值或分类条件'); return; }
        if (!next.length) { notify('本地规则目前识别 ROE、股息率和总市值；其他条件请手动添加或配置 AI'); return; }
        setReviewConditions(next); setParseSource('本地规则 · 未发送描述 · 仅识别部分明确字段');
      }
      setReviewOpen(true);
    } catch (reason) { notify(reason instanceof Error ? reason.message : '条件解析失败，请检查 AI 设置或手动添加条件'); }
    finally { setParsing(false); }
  };
  const exportCSV = () => {
    if (!result?.stocks.length) { notify('请先运行筛选，再导出真实结果'); return; }
    const rows = result.stocks;
    const csv = ['名称,代码,行业,总市值,股息率,ROE,净利率,今日涨跌幅', ...rows.map(stock => `${stock.name},${stock.code},${stock.industry},${stock.cap},${stock.dividend},${stock.roe},${stock.net},${stock.changePct}`)].join('\n');
    downloadText('危微-选股结果.csv', `\ufeff${csv}`, 'text/csv;charset=utf-8');
  };
  const addToWatchlist = async () => {
    if (!selectedIds.length) return;
    setBatchBusy(true);
    try {
      await Promise.all(selectedIds.map(id => api.post<Instrument, Record<string, never>>(`/watchlist/${id}`, {})));
      notify(`已将 ${selectedIds.length} 只股票加入自选`); setSelectedIds([]); window.dispatchEvent(new Event('weiwei-tags-changed'));
    } catch (reason) { notify(reason instanceof Error ? reason.message : '批量加入失败'); }
    finally { setBatchBusy(false); }
  };
  return <div className="page"><PageHeader title="条件选股" subtitle="只按明确条件过滤，不评价公司，不推荐买卖" actions={<><button className="button ghost" disabled={!result?.stocks.length} onClick={exportCSV}><Download size={14} />导出 CSV</button><button className="button primary" disabled={loading || !validConditions} onClick={() => void run()}><Play size={14} />{loading ? '筛选中…' : '运行筛选'}</button></>} />
    <div className="ai-query"><div className="ai-icon"><Sparkles size={18} /></div><div className="ai-input-wrap"><label htmlFor="screener-description">用一句话描述筛选条件</label><input id="screener-description" value={description} onChange={event => setDescription(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void parseDescription(); }} /></div><button className="button ghost" disabled={parsing || !description.trim()} onClick={() => void parseDescription()}>{parsing ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{parsing ? '正在解析…' : '解析为条件'}</button><button className="ai-parse-status text-button" onClick={() => window.dispatchEvent(new CustomEvent('weiwei-open-settings', { detail: 'connections' }))}>{aiStatus?.configured ? `${aiStatus.provider} · ${aiStatus.model}` : '使用本地规则 · 配置 AI'}<br />解析后必须确认，不自动执行</button></div>
    <div className="screen-builder"><aside className="saved-plans"><div className="screen-plan-head"><h3>选股方案</h3><button className="icon-button" aria-label="新建选股方案" title="新建选股方案" onClick={newScheme}><Plus size={16} /></button></div>{schemes.map((scheme, index) => <button key={`${scheme.name}-${index}`} className={`saved-plan${activePlan === index ? ' active' : ''}`} onClick={() => switchScheme(index)}><Bookmark size={15} /><span>{scheme.name}<small>{scheme.conditions.length} 个条件</small></span></button>)}</aside><div className="condition-area"><div className="condition-head"><div><h2>{concept ? `${concept} · 成分筛选` : activePlan === null ? '未保存筛选' : schemes[activePlan]?.name}</h2><p>条件之间为「且」；切换市场或编辑后，点击运行更新结果。</p></div><div className="condition-actions"><select aria-label="筛选市场" value={market} onChange={event => setMarket(event.target.value as typeof market)}><option value="all">全部市场</option><option value="CN">沪深京 A 股</option><option value="HK">港股</option><option value="US">美股</option></select><button className="button compact ghost" onClick={() => setConditions(current => [...current, { field: 'roe', operator: 'gte', value: 10 }])}><Plus size={15} />添加条件</button></div></div><div className="condition-editor-head"><h3>筛选条件 <span>{conditions.length}</span></h3><span>行业与概念从真实板块列表中选择</span></div><div className="condition-editor-list">{conditions.map((condition, index) => <ConditionEditorRow key={index} condition={condition} sectors={sectors} onChange={next => updateCondition(index, next)} onRemove={() => setConditions(current => current.filter((_, itemIndex) => itemIndex !== index))} />)}{!conditions.length && <div className="condition-empty">暂无筛选条件。点击“添加条件”，或从左侧选择一个方案。</div>}</div><div className="condition-footer"><span>修改条件不会自动运行；保存方案后可在这台电脑上重复使用。</span><div><button className="button compact ghost" onClick={saveScheme}><Bookmark size={14} />{activePlan === null ? '保存为方案' : '保存方案'}</button><button className="button compact primary" disabled={loading || !validConditions} onClick={() => void run()}><Play size={14} />运行筛选</button></div></div></div></div>
    <ScreenerCoveragePanel coverage={coverage} onChanged={refreshCoverage} />
    {screenError && <div className="inline-load-error" role="alert">{screenError}</div>}
    <ScreenerResults result={result} loading={loading} selectedIds={selectedIds} onToggle={(id, checked) => setSelectedIds(current => checked ? [...current, id] : current.filter(item => item !== id))} onToggleAll={checked => setSelectedIds(checked ? result?.stocks.map(stock => stock.id) ?? [] : [])} onAddToWatchlist={() => void addToWatchlist()} batchBusy={batchBusy} />
    <Modal open={schemeOpen} onClose={() => setSchemeOpen(false)} title={activePlan === null ? '新建选股方案' : '保存选股方案'} footer={<>{activePlan !== null && <button className="button danger scheme-delete" onClick={() => { if (window.confirm(`删除“${schemes[activePlan]?.name}”？只会删除本机方案，不影响股票和研究。`)) { setSchemes(current => current.filter((_, index) => index !== activePlan)); setActivePlan(null); setConditions([]); setResult(null); setSchemeOpen(false); } }}>删除方案</button>}<button className="button ghost" onClick={() => setSchemeOpen(false)}>取消</button><button className="button primary" disabled={!schemeName.trim()} onClick={confirmScheme}><Check size={14} />{activePlan === null ? '创建并编辑条件' : '保存方案'}</button></>}><label className="settings-field">方案名称<input autoFocus value={schemeName} onChange={event => setSchemeName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') confirmScheme(); }} placeholder="例如：低负债高股息" /></label><p className="dialog-subtitle">{activePlan === null ? '创建后进入空白条件编辑器，不会覆盖现有方案。' : `将保存当前的 ${conditions.length} 个条件；结果以运行时数据为准。`}</p></Modal>
    <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="确认解析后的条件" className="wide" footer={<><button className="button ghost" onClick={() => setReviewOpen(false)}>返回修改描述</button><button className="button primary" disabled={!reviewConditions.every(valid)} onClick={() => { setConditions(reviewConditions); setActivePlan(null); setReviewOpen(false); void run(reviewConditions); }}><Play size={14} />确认并运行</button></>}><p className="dialog-subtitle">{parseSource}。以下条件尚未执行，可在运行前逐项修改。</p><div className="condition-editor-list">{reviewConditions.map((condition, index) => <ConditionEditorRow key={index} condition={condition} sectors={sectors} onChange={next => setReviewConditions(current => current.map((item, itemIndex) => itemIndex === index ? next : item))} onRemove={() => setReviewConditions(current => current.filter((_, itemIndex) => itemIndex !== index))} />)}</div>{!reviewConditions.length && <div className="condition-empty">未识别出条件，请返回修改描述或手动添加。</div>}<button className="text-button" onClick={() => window.dispatchEvent(new CustomEvent('weiwei-open-settings', { detail: 'connections' }))}><Settings size={13} />AI 服务设置</button></Modal>
  </div>;
}
