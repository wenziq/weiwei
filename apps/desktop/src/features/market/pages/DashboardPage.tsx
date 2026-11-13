import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { BreadthBucket, DashboardData, IndexQuote, Sector } from '@weiwei/contracts';
import { marketEndpoints } from '../api';
import { useApi } from '@/lib/useApi';
import { usePersistentState } from '@/lib/usePersistentState';
import { amount } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChangeText } from '@/components/ui/ChangeText';
import { Sparkline } from '@/components/ui/Sparkline';
import { Modal } from '@/components/ui/Modal';
import { CandleChart } from '@/components/charts/CandleChart';
import { TurnoverChart } from '../components/TurnoverChart';
import { BreadthHistogram } from '../components/BreadthHistogram';
import { IndexDirectory } from '../components/IndexDirectory';
import { IndexManagerModal } from '../components/IndexManagerModal';
import { useApp } from '@/app/providers/AppProviders';

const defaultFavorites = ['index-000001', 'index-399001', 'index-399006', 'index-000688', 'index-899050', 'index-000985'];
const defaultSectors = ['CPO', '光模块', '半导体', '人形机器人', '通信设备', '汽车零部件'];
const indexMetadata: [string, string, string][] = [
  ['上证指数', '000001', 'A股核心'], ['深证成指', '399001', 'A股核心'], ['创业板指', '399006', 'A股核心'], ['科创 50', '000688', 'A股核心'], ['北证 50', '899050', 'A股核心'],
  ['中证 A50', '930050', 'A股规模'], ['沪深 300', '000300', 'A股规模'], ['中证 A500', '000510', 'A股规模'], ['中证 500', '000905', 'A股规模'],
  ['中证 1000', '000852', '全A口径'], ['中证 2000', '932000', '全A口径'], ['中证全指', '000985', '全A口径'], ['中证红利', '000922', 'A股主题'], ['中证全指半导体', 'H30184', 'A股主题'],
  ['恒生指数', 'HSI', '港股'], ['恒生科技', 'HSTECH', '港股'], ['恒生国企', 'HSCEI', '港股'],
  ['道琼斯', 'DJI', '美股'], ['标普 500', 'SPX', '美股'], ['纳斯达克综合', 'IXIC', '美股'], ['纳斯达克 100', 'NDX', '美股'], ['费城半导体', 'SOX', '美股'],
];
const indexPlaceholders: IndexQuote[] = indexMetadata.map(([name, code, group]) => ({ id: `index-${code.toLowerCase()}`, name, code, group, point: null, changePct: null, amount: null, deltaPct: null, marketState: '', spark: [], dataSource: '等待行情', dataStatus: 'unavailable', quoteTime: null }));
const emptyTurnover = { total: null, deltaPct: null, today: [], previous: [] };

export function DashboardPage() {
  const { data, loading, error, warning } = useApi<DashboardData>(marketEndpoints.dashboard, [], { refetchIntervalMs: 15000 });
  const { data: allSectors } = useApi<Sector[]>(marketEndpoints.sectors, [], { refetchIntervalMs: 30000 });
  const [favoriteIds, setFavoriteIds] = usePersistentState<string[]>('weiwei-favorite-indices', defaultFavorites);
  const [favoriteSectorNames] = usePersistentState<string[]>('weiwei-favorite-sectors', defaultSectors);
  const [selectedIndex, setSelectedIndex] = useState<IndexQuote | null>(null);
  const [breadthBucket, setBreadthBucket] = useState<BreadthBucket | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const { notify } = useApp();
  const navigate = useNavigate();
  const firstLoad = loading && !data;
  const indices = data?.indices ?? indexPlaceholders;
  const favoriteIndices = favoriteIds.map(id => indices.find(item => item.id === id)).filter((item): item is IndexQuote => Boolean(item));
  const sectors = allSectors ? favoriteSectorNames.map(name => allSectors.find(item => item.name === name)).filter((item): item is Sector => Boolean(item)) : favoriteSectorNames.map(name => ({ id: `pending-${name}`, name, type: name === '半导体' || name === '通信设备' || name === '汽车零部件' ? '行业' as const : '概念' as const, changePct: null, amount: null, deltaPct: null, up: null, down: null, leader: '正在刷新', leaderChangePct: null, flow: null, etf: '', spark: [], dataSource: '等待行情', dataStatus: 'unavailable' as const, quoteTime: null }));
  const toggleFavorite = (id: string) => setFavoriteIds(current => {
    if (current.includes(id)) return current.filter(item => item !== id);
    if (current.length >= 6) { notify('核心关注最多显示 6 个，请先移除一个再添加'); return current; }
    return [...current, id];
  });
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  return <div className="page"><PageHeader title="看盘台" subtitle={`${date} · 真实行情快照，报价延迟以数据源为准`} actions={<span className={`soft-badge ${data?.dataStatus === 'cached' ? 'cached' : ''}`}>{firstLoad ? <><LoaderCircle size={13} className="spin" />正在刷新行情</> : data?.dataStatus === 'cached' ? '本机缓存' : data ? '多源真实行情' : '等待行情服务'}</span>} />
    {(error || warning) && <div className="inline-load-error" role="alert">{error ?? '本次刷新暂时失败，页面保留上一次成功取得的数据。'}</div>}
    <div className="section-topline"><div className="section-title"><h2>关注指数</h2><span className="soft-badge">核心关注 · {favoriteIndices.length} / {indices.length}</span></div><button className="text-button" onClick={() => setManagerOpen(true)}>管理指数</button></div>
    <div className="index-grid">{favoriteIndices.map(item => <button className={`index-card${item.dataStatus === 'unavailable' ? ' refreshing' : ''}`} key={item.id} onClick={() => { if (data) setSelectedIndex(item); }}><div className="index-head"><span>{item.name}<small>{item.code}</small></span></div><div className="index-main"><div><strong className="index-value">{item.point?.toLocaleString() ?? '—'}</strong>{item.changePct === null ? <span className="refreshing-label">正在刷新</span> : <ChangeText className="change" value={item.changePct} />}</div><Sparkline values={item.spark} positive={(item.changePct ?? 0) >= 0} width={48} height={28} /></div><div className="index-foot"><span>成交额 <b>{item.amount === null ? '正在刷新' : amount(item.amount)}</b></span><ChangeText value={item.deltaPct} suffix=" 较昨日" /></div></button>)}</div>
    <div className="dashboard-middle"><section className="market-panel"><div className="panel-head"><div><h2>市场整体</h2><span className="data-time">{data?.quoteTime ? new Date(data.quoteTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '正在刷新'} 更新</span></div><span className="soft-badge">沪深京</span></div><div className="turnover-row"><div><span className="metric-label">沪深成交额（不含北交所）</span><div className="turnover-value">{data?.turnover.total?.toLocaleString() ?? '—'} <small>亿</small></div></div><div className="turnover-delta">{firstLoad ? <span className="refreshing-label">正在刷新</span> : <ChangeText value={data?.turnover.deltaPct ?? null} />}<small>较昨日同一时刻</small></div></div><TurnoverChart data={data?.turnover ?? emptyTurnover} loading={firstLoad} /><BreadthHistogram data={data?.breadth ?? []} onSelect={setBreadthBucket} timestamp={data?.quoteTime} loading={firstLoad} /></section>
      <section className="sector-panel"><div className="panel-head"><div><h2>自选板块</h2><span className="data-time">真实行业 / 概念快照</span></div><span className="soft-badge">今日</span></div><div className="sector-table-scroll"><table className="data-table"><thead><tr><th>板块</th><th className="num">涨跌幅</th><th className="num">成交额</th><th className="num">较昨日</th><th className="num">涨 / 跌</th><th>领涨股</th><th className="num">近期走势</th></tr></thead><tbody>{sectors.map(item => <tr key={item.id} className="clickable" onClick={() => { if (allSectors) navigate(`/sectors?sector=${encodeURIComponent(item.name)}`); }}><td><span className={`soft-badge ${item.type === '行业' ? 'industry' : 'concept'}`}>{item.type === '行业' ? '行' : '概'}</span> <strong>{item.name}</strong></td><td className="num">{item.changePct === null ? <span className="refreshing-label">正在刷新</span> : <ChangeText value={item.changePct} />}</td><td className="num">{amount(item.amount)}</td><td className="num"><ChangeText value={item.deltaPct} /></td><td className="num"><span className="up">{item.up ?? '—'}</span> / <span className="down">{item.down ?? '—'}</span></td><td>{item.leader} <ChangeText value={item.leaderChangePct} /></td><td><Sparkline values={item.spark} positive={(item.changePct ?? 0) >= 0} width={70} height={24} /></td></tr>)}{!sectors.length && <tr><td colSpan={7} className="sector-favorites-empty">尚未选择可用板块，请前往“板块行情”添加</td></tr>}</tbody></table></div><div className="panel-footer"><span>同花顺行业 / 新浪行业与概念 · 空值表示源未提供</span><button className="text-button" onClick={() => navigate('/sectors')}>查看全部板块 →</button></div></section></div>
    <IndexDirectory indices={indices} favorites={favoriteIds} onToggleFavorite={toggleFavorite} onOpen={index => { if (data) setSelectedIndex(index); }} />
    <Modal open={Boolean(selectedIndex)} onClose={() => setSelectedIndex(null)} title={selectedIndex ? `${selectedIndex.name} · 指数量价` : ''} className="wide">{selectedIndex && <CandleChart instrumentId={selectedIndex.id} height={430} />}</Modal>
    <Modal open={Boolean(breadthBucket)} onClose={() => setBreadthBucket(null)} title={breadthBucket ? `${breadthBucket.range} · 市场统计` : ''} className="wide"><p className="dialog-subtitle">该区间统计来自沪深京全市场目录，共 {breadthBucket?.count.toLocaleString()} 家。可通过全局搜索或添加股票查询具体标的。</p></Modal>
    <IndexManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} indices={indices} favorites={favoriteIds} onSave={setFavoriteIds} />
  </div>;
}
