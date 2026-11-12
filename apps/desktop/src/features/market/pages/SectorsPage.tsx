import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Star } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Sector } from '@weiwei/contracts';
import { marketEndpoints } from '../api';
import { useApi } from '@/lib/useApi';
import { usePersistentState } from '@/lib/usePersistentState';
import { amount, signed } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChangeText } from '@/components/ui/ChangeText';
import { Sparkline } from '@/components/ui/Sparkline';
import { AsyncState } from '@/components/ui/AsyncState';
import { Modal } from '@/components/ui/Modal';
import { CandleChart } from '@/components/charts/CandleChart';

const defaultFavorites = ['CPO', '光模块', '半导体', '人形机器人', '通信设备', '汽车零部件'];

export function SectorsPage() {
  const { data: sectors, loading, error, updatedAt } = useApi<Sector[]>(marketEndpoints.sectors, [], { refetchIntervalMs: 30000 });
  const [searchParams, setSearchParams] = useSearchParams();
  const [type, setType] = useState('全部');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = usePersistentState<string[]>('weiwei-favorite-sectors', defaultFavorites);
  const [managerOpen, setManagerOpen] = useState(false);
  const navigate = useNavigate();
  const selectedName = searchParams.get('sector') ?? 'CPO';
  const selected = sectors?.find(item => item.name === selectedName) ?? sectors?.[0];
  useEffect(() => { if (sectors?.length && !sectors.some(item => item.name === selectedName)) setSearchParams({ sector: sectors[0]!.name }, { replace: true }); }, [sectors, selectedName, setSearchParams]);
  const filtered = useMemo(() => (sectors ?? []).filter(item => (type === '全部' || item.type === type) && `${item.name}${item.leader}`.toLowerCase().includes(query.toLowerCase())), [sectors, type, query]);
  const toggleFavorite = (name: string) => setFavorites(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name]);
  const up = (sectors ?? []).filter(item => (item.changePct ?? 0) > 0).length;
  const down = (sectors ?? []).filter(item => (item.changePct ?? 0) < 0).length;
  const flat = (sectors ?? []).length - up - down;
  const ranked = [...(sectors ?? [])].filter(item => item.changePct !== null).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const strongest = ranked[0], weakest = ranked.at(-1);

  return <div className="page"><PageHeader title="板块行情" subtitle="比较真实价格强度与成交变化，找到资金正在聚集的方向" actions={<><button className="button ghost" onClick={() => navigate('/dashboard')}><ArrowLeft size={14} />返回看盘台</button><button className="button primary" onClick={() => setManagerOpen(true)}><Star size={14} />管理自选板块</button></>} />
    <div className="sectors-summary"><div className="sector-summary-item"><span>上涨板块</span><strong className="up">{up}</strong><small className="up">占比 {sectors?.length ? (up / sectors.length * 100).toFixed(1) : '—'}%</small></div><div className="sector-summary-item"><span>下跌板块</span><strong className="down">{down}</strong><small>平盘 {flat} 个</small></div><div className="sector-summary-item"><span>行业 / 概念</span><strong>{sectors?.filter(item => item.type === '行业').length ?? 0} / {sectors?.filter(item => item.type === '概念').length ?? 0}</strong><small>无完整来源的字段显示为 —</small></div><div className="sector-summary-item"><span>最强 / 最弱</span><strong className="up" style={{ fontSize: 15 }}>{strongest ? `${strongest.name} ${signed(strongest.changePct)}` : '—'}</strong><small className="down">{weakest ? `${weakest.name} ${signed(weakest.changePct)}` : '—'}</small></div></div>
    <AsyncState loading={loading} error={error}><div className="sectors-workspace"><div className="sectors-list-area"><div className="sectors-filter-bar"><div className="sectors-type-tabs">{['全部', '行业', '概念'].map(name => <button key={name} className={type === name ? 'active' : ''} onClick={() => setType(name)}>{name}</button>)}</div><span className="catalog-source-note">同花顺行业 · 新浪行业与概念</span><label className="inner-search"><Search size={12} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索板块或领涨股" /></label></div><div className="sectors-range-row"><span className="soft-badge">今日真实快照</span><span>{filtered.length} 个板块 · {updatedAt ? new Date(updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'} 更新</span></div><div className="sectors-table-wrap"><table className="data-table sectors-all-table"><thead><tr><th>板块</th><th className="num">涨跌幅</th><th>近期走势</th><th className="num">成交额</th><th className="num">较昨日</th><th className="num">涨 / 跌</th><th>领涨股</th><th className="num">资金净流入</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} className={`clickable${selected?.id === item.id ? ' selected' : ''}`} onClick={() => setSearchParams({ sector: item.name })}><td><button className={`favorite-button${favorites.includes(item.name) ? ' active' : ''}`} onClick={event => { event.stopPropagation(); toggleFavorite(item.name); }}><Star size={13} /></button><span className="soft-badge">{item.type === '行业' ? '行' : '概'}</span> <strong>{item.name}</strong></td><td className="num"><ChangeText value={item.changePct} /></td><td><Sparkline values={item.spark} positive={(item.changePct ?? 0) >= 0} width={62} height={24} /></td><td className="num">{amount(item.amount)}</td><td className="num"><ChangeText value={item.deltaPct} /></td><td className="num"><span className="up">{item.up ?? '—'}</span> / <span className="down">{item.down ?? '—'}</span></td><td>{item.leader} <ChangeText value={item.leaderChangePct} /></td><td className="num">{item.flow === null ? '—' : <ChangeText value={item.flow} />}</td></tr>)}</tbody></table></div></div>
      {selected && <aside className="sector-detail-area"><div className="sector-detail-head"><div className="sector-detail-title"><span className="soft-badge">{selected.type === '行业' ? '行' : '概'}</span><h2>{selected.name}</h2></div><button className={`favorite-button${favorites.includes(selected.name) ? ' active' : ''}`} onClick={() => toggleFavorite(selected.name)}><Star size={17} /></button></div><div className="sector-detail-quote"><strong className={(selected.changePct ?? 0) >= 0 ? 'up' : 'down'}>{signed(selected.changePct)}</strong><span>今日快照 · {selected.type} · {selected.dataSource}</span></div><div className="sector-detail-metrics"><div><span>成交额</span><strong>{amount(selected.amount)}</strong></div><div><span>较昨日</span><ChangeText value={selected.deltaPct} /></div><div><span>上涨 / 下跌</span><strong><em className="up">{selected.up ?? '—'}</em> / <em className="down">{selected.down ?? '—'}</em></strong></div></div><CandleChart instrumentId={selected.id} height={222} /><div className="panel-head"><h3>领涨股</h3><span className="data-time">由行情源提供</span></div><table className="data-table"><thead><tr><th>股票</th><th className="num">今日涨跌</th></tr></thead><tbody><tr><td><strong>{selected.leader}</strong></td><td className="num"><ChangeText value={selected.leaderChangePct} /></td></tr></tbody></table><div className="form-actions"><button className="button ghost full" onClick={() => navigate(`/screener?${selected.type === '行业' ? 'industry' : 'concept'}=${encodeURIComponent(selected.name)}`)}>进入板块筛选</button></div></aside>}
    </div></AsyncState>
    <Modal open={managerOpen} onClose={() => setManagerOpen(false)} title="管理自选板块"><p className="dialog-subtitle">首页按以下顺序显示前 6 个板块。点击列表中的星标可继续添加。</p>{favorites.map((name, index) => <div className="setting-row" key={name}><span>{String(index + 1).padStart(2, '0')} · {name}<small>{index < 6 ? '首页显示' : '备选'}</small></span><button className="text-button" onClick={() => toggleFavorite(name)}>移除</button></div>)}</Modal>
  </div>;
}
