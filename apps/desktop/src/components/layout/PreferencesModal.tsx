import { useState } from 'react';
import { Moon, Sun, Type } from 'lucide-react';
import { useApp } from '@/app/providers/AppProviders';
import { Modal } from '@/components/ui/Modal';
import { HistorySettings } from '@/features/market/components/HistorySettings';
import { BackendSettings } from '@/components/settings/BackendSettings';
import { AISettings } from '@/components/settings/AISettings';

export function PreferencesModal({ open, onClose, initialSection = 'display' }: { open: boolean; onClose: () => void; initialSection?: 'display' | 'connections' }) {
  const { theme, toggleTheme, fontScale, setFontScale } = useApp();
  const [section, setSection] = useState<'display' | 'connections'>(initialSection);
  const options = [{ value: 'standard', label: '标准', description: '更高信息密度' }, { value: 'large', label: '较大', description: '默认推荐，适合多数显示器' }, { value: 'xlarge', label: '特大', description: '远距离或高分辨率屏幕' }] as const;
  return <Modal open={open} onClose={onClose} title="设置" className="wide preferences-dialog">
    <nav className="preferences-tabs" aria-label="设置分类"><button className={section === 'display' ? 'active' : ''} onClick={() => setSection('display')}>显示与数据</button><button className={section === 'connections' ? 'active' : ''} onClick={() => setSection('connections')}>连接与 AI</button></nav>
    {section === 'display' ? <>
      <div className="setting-row"><span>界面主题<small>深色适合长时间看盘，浅色适合明亮环境</small></span><button className="button ghost" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}切换为{theme === 'dark' ? '浅色' : '深色'}</button></div>
      <div style={{ paddingTop: 16 }}><Type size={17} /><h3 style={{ display: 'inline', marginLeft: 7 }}>字体大小</h3><p className="dialog-subtitle" style={{ marginTop: 8 }}>只改变文字和必要行高，不隐藏行情字段。默认使用较大字体。</p><div className="inline-tabs">{options.map(option => <button key={option.value} className={fontScale === option.value ? 'active' : ''} onClick={() => setFontScale(option.value)}><strong>{option.label}</strong><small>{option.description}</small></button>)}</div></div>
      <HistorySettings open={open} />
    </> : <><BackendSettings open={open} /><AISettings open={open} /><p className="history-footnote license-note">图表组件：TradingView Lightweight Charts · Apache License 2.0 · Copyright 2025 TradingView, Inc. · <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView 来源</a> · <a href="https://github.com/tradingview/lightweight-charts/blob/master/LICENSE" target="_blank" rel="noreferrer">许可原文</a>。图内 Logo 使用官方显示设置关闭。</p></>}
    <div className="dialog-subtitle" style={{ marginTop: 18 }}>显示设置保存在当前设备；个人资料和历史库位于所连接的后端。AI 密钥不会写入上述文件。</div>
  </Modal>;
}
