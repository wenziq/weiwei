import { useState } from 'react';
import { Database, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ScreenerCoverage } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApp } from '@/app/providers/AppProviders';

export function ScreenerCoveragePanel({ coverage, onChanged }: { coverage: ScreenerCoverage | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const { notify } = useApp();
  const refresh = async () => {
    setBusy(true);
    try { await api.post<ScreenerCoverage, Record<string, never>>('/screener/refresh', {}); onChanged(); notify('已开始后台更新全市场财务与板块成分'); }
    catch (reason) { notify(reason instanceof Error ? reason.message : '启动更新失败'); }
    finally { setBusy(false); }
  };
  return <section className="screener-coverage" aria-label="全市场数据覆盖情况">
    <div className="coverage-pool"><Database size={17} /><span>真实证券池</span><strong>{coverage ? coverage.universeSize.toLocaleString() : '正在读取'}</strong><small>只证券，不是预设样本</small></div>
    {(['CN', 'HK', 'US'] as const).map(market => { const data = coverage?.markets[market]; return <div className="coverage-market" key={market}><span>{market === 'CN' ? '沪深京' : market === 'HK' ? '港股' : '美股'}</span><strong>{data ? `${data.withFinancials.toLocaleString()} / ${data.total.toLocaleString()}` : '—'}</strong><small>{data?.withFinancials ? '有真实财报记录' : market === 'CN' ? '等待批量采集' : '暂无可靠批量财务源'}</small></div>; })}
    <div className="coverage-boards"><span>真实行业 / 概念成分</span><strong>{coverage ? `${coverage.boards.covered} / ${coverage.boards.total}` : '正在读取'}</strong><small>{coverage?.running ? `后台采集中 · ${coverage.stage}` : coverage?.stage === '完成' ? '本机数据已保存' : '可手动更新'}</small></div>
    <button className="button compact ghost coverage-refresh" disabled={busy || coverage?.running} onClick={() => void refresh()}>{busy || coverage?.running ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}{coverage?.running ? '正在后台采集' : '更新财务与板块'}</button>
    {coverage?.error && <p className="coverage-error" role="alert">{coverage.error}</p>}
    <p className="coverage-note">财务：东方财富真实报告；股息率按近一年已实施分红 ÷ 现价计算。行业与概念来自真实分类/成分；缺失指标不按 0 处理，不参与数值匹配。</p>
  </section>;
}
