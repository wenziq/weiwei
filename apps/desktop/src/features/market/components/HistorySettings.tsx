import { useState } from 'react';
import type { HistoryStatus } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useApp } from '@/app/providers/AppProviders';
import { env } from '@/config/env';

export function HistorySettings({ open }: { open: boolean }) {
  const { data, refresh } = useApi<HistoryStatus>(open ? '/market/history/status' : null, [open], { refetchIntervalMs: 2000 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useApp();
  const backendHost = new URL(env.apiBaseUrl).host;
  const toggle = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      if (data.running) await api.post('/market/history/stop', {});
      else await api.post('/market/history/start', { markets: ['CN', 'HK', 'US'], priorityOnly: false });
      refresh();
      notify(data.running ? '已请求暂停，当前网络请求结束后停止' : '历史采集已启动，优先处理自选与持仓');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };
  const progress = data?.total ? Math.min(100, (data.completed + data.failed) / data.total * 100) : 0;
  const coverage = data ? Object.values(data.stats.markets).reduce((sum, market) => sum + market.withHistory, 0) : 0;
  return <section className="history-settings"><h3>行情与历史数据</h3><p className="history-footnote">采集与存储均位于当前后端：{backendHost}</p><div className="setting-row"><span>历史行情库（服务器）<small>{data ? `${data.stats.instruments.toLocaleString()} 只证券目录 · ${coverage.toLocaleString()} 只已有历史 · ${(data.stats.databaseBytes / 1048576).toFixed(1)} MB` : '正在读取服务器数据…'}</small></span><button className="button ghost" disabled={!data || busy} onClick={toggle}>{data?.running ? '暂停采集' : data?.runStatus === 'paused' || data?.runStatus === 'failed' || data?.runStatus === 'interrupted' ? '继续全市场采集' : '开始全市场采集'}</button></div>{data && <><div className="history-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress}%` }} /></div><div className="history-stats"><div><strong>{data.stats.candles.toLocaleString()}</strong><small>已保存 K 线</small></div><div><strong>{data.completed.toLocaleString()} / {data.total.toLocaleString()}</strong><small>本次完成</small></div><div><strong>{data.rowsCollected.toLocaleString()}</strong><small>本次取得 K 线</small></div></div><p className="history-footnote">原始不复权日线 · 自选与持仓优先 · 限速串行采集 · 重启后增量续传{data.failed ? ` · ${data.failed} 只失败，已记录原因` : ''}</p>{data.currentId && <p className="history-footnote">当前：{data.currentId} · {data.running ? '采集中' : data.runStatus}</p>}{data.error && <p className="history-error">{data.error}</p>}</>}{error && <p className="history-error">{error}</p>}<p className="history-footnote">免费行情快照可能存在延迟，仅供个人研究；不承诺交易所级实时权限。港股使用港交所官方目录，包含股票、REIT 与 ETP；美股使用 Nasdaq Trader 目录，包含 ETF，排除测试证券。</p></section>;
}
