import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Layers3, Star, BookOpen, Filter, Wallet, Search, Sun, Moon, Settings, Tag } from 'lucide-react';
import { useApp } from '@/app/providers/AppProviders';
import { useApi } from '@/lib/useApi';
import type { ApiHealth, WatchlistData } from '@weiwei/contracts';
import { marketSession } from '@/lib/marketHours';
import { SearchPalette } from './SearchPalette';
import { PreferencesModal } from './PreferencesModal';

const navigation = [
  { path: '/dashboard', label: '看盘台', icon: LayoutDashboard, key: '1' },
  { path: '/sectors', label: '板块行情', icon: Layers3, key: '6' },
  { path: '/watchlist', label: '自选', icon: Star, key: '2' },
  { path: '/research', label: '研究库', icon: BookOpen, key: '3' },
  { path: '/screener', label: '条件选股', icon: Filter, key: '4' },
  { path: '/accounts', label: '账户收益', icon: Wallet, key: '5' },
];

export function AppShell() {
  const { theme, toggleTheme } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesSection, setPreferencesSection] = useState<'display' | 'connections'>('display');
  const [now, setNow] = useState(() => new Date());
  const { data: health, error: healthError } = useApi<ApiHealth>('/health', [], { refetchIntervalMs: 30000 });
  const { data: watchlist, refresh: refreshTags } = useApi<WatchlistData>('/watchlist');
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]') || document.querySelector('.markdown-studio')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); }
      const item = navigation.find(entry => entry.key === event.key);
      if (item && !event.metaKey && !event.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) navigate(item.path);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    const changed = () => refreshTags();
    const openSettings = (event: Event) => {
      setPreferencesSection(event instanceof CustomEvent && event.detail === 'connections' ? 'connections' : 'display');
      setPreferencesOpen(true);
    };
    window.addEventListener('weiwei-tags-changed', changed);
    window.addEventListener('weiwei-open-settings', openSettings);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('weiwei-tags-changed', changed);
      window.removeEventListener('weiwei-open-settings', openSettings);
    };
  }, [refreshTags]);
  const markets = [{ key: 'CN' as const, label: 'A 股' }, { key: 'HK' as const, label: '港股' }, { key: 'US' as const, label: '美股' }];
  const activeTag = location.pathname === '/watchlist' ? new URLSearchParams(location.search).get('tag') : null;
  const tagCounts = new Map<string, number>();
  for (const stock of watchlist?.stocks ?? []) for (const tag of stock.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const tags = watchlist?.tags ?? [];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><i /><i /><i /></div><div><div className="brand-name">危微</div><div className="brand-sub">个人看盘</div></div></div>
      <nav className="main-nav" aria-label="主导航">
        {navigation.map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><Icon size={16} /><span>{label}</span></NavLink>)}
      </nav>
      <div className="sidebar-section"><div className="sidebar-label sidebar-tags-title"><Tag size={13} />标签<span>{tags.length}</span></div>
        <div className="sidebar-tag-list">{tags.map(tag => <button className={`side-link${activeTag === tag ? ' active' : ''}`} key={tag} aria-pressed={activeTag === tag} title={`按 ${tag} 筛选自选股`} onClick={() => navigate(activeTag === tag ? '/watchlist' : `/watchlist?tag=${encodeURIComponent(tag)}`)}><span className="tag-symbol">#</span><span>{tag}</span><small>{tagCounts.get(tag) ?? 0}</small></button>)}</div>
        {!tags.length && <p className="sidebar-tags-empty">添加股票并设置标签后，在这里快速筛选。</p>}
      </div>
      <div className="sidebar-bottom">
        <button className="data-health" onClick={() => setPreferencesOpen(true)} title="行情与历史数据设置"><span className={`status-dot${health ? '' : healthError ? ' error' : ' muted'}`} /><span>{health ? '已连接' : healthError ? '未连接' : '连接中'}</span></button>
        <button className="nav-item subtle" onClick={() => setPreferencesOpen(true)}><Settings size={16} /><span>设置</span></button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><button className="global-search" onClick={() => setSearchOpen(true)}><Search size={14} /><span>搜索股票、代码或研究笔记</span><kbd>⌘ K</kbd></button><div className="market-clocks">{markets.map(market => { const session = marketSession(market.key, now); return <span key={market.key} title="按常规交易时段显示，节假日与临时休市以交易所公告为准"><b className={`status-dot${session.open ? '' : ' muted'}`} />{market.label} <strong className={session.open ? '' : 'muted-text'}>{session.label}</strong></span>; })}</div><div className="topbar-actions"><span className="quote-time">{now.toLocaleTimeString('zh-CN', { hour12: false })}</span><button className="icon-button" title="切换深浅色" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button></div></header>
      <main className="main-content"><Outlet /></main>
    </div>
    <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    <PreferencesModal key={preferencesSection} initialSection={preferencesSection} open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
  </div>;
}
