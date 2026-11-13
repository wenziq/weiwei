import { useState } from 'react';
import { Plus, Settings, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Account, AccountSummary, Currency, Transaction } from '@weiwei/contracts';
import { TransactionModal } from '../components/TransactionModal';
import { ImportTransactionsModal } from '../components/ImportTransactionsModal';
import { useApi } from '@/lib/useApi';
import { money, signed } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChangeText } from '@/components/ui/ChangeText';
import { AsyncState } from '@/components/ui/AsyncState';
import { PerformanceChart } from '../components/PerformanceChart';

function signedMoney(value: number | null, currency: Currency) {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : '−'}${money(Math.abs(value), currency)}`;
}

export function AccountsPage() {
  const [activeAccount, setActiveAccount] = useState('all');
  const { data: summary, loading, error, refresh: refreshSummary } = useApi<AccountSummary>(`/accounts/summary?account_id=${activeAccount}`, [activeAccount], { keepPreviousData: true });
  const { data: accounts, refresh: refreshAccounts } = useApi<Account[]>('/accounts');
  const [activeTab, setActiveTab] = useState<'holdings' | 'transactions'>('holdings');
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data: transactions, refresh: refreshTransactions } = useApi<Transaction[]>(`/accounts/${activeAccount}/transactions`, [activeAccount], { keepPreviousData: true });
  const navigate = useNavigate();
  const currency = summary?.currency ?? 'CNY';
  const selectedAccount = accounts?.find(account => account.id === activeAccount);
  const points = summary?.curve ?? [];
  const curveReturn = points.length > 1 && points[0]!.value !== 0 ? (points.at(-1)!.value / points[0]!.value - 1) * 100 : null;
  const refreshAll = () => { refreshSummary(); refreshAccounts(); refreshTransactions(); };
  const metrics = summary ? [
    { label: '总资产', value: money(summary.totalAssets, currency), note: `持仓市值 ${money(summary.marketValue, currency)}`, tone: '' },
    { label: '当日盈亏', value: signedMoney(summary.dayPnl, currency), note: '现价相对上一交易日收盘', tone: summary.dayPnl === null ? '' : summary.dayPnl >= 0 ? 'up' : 'down' },
    { label: '累计盈亏金额', value: signedMoney(summary.totalPnl, currency), note: '总资产扣除累计净投入', tone: summary.totalPnl === null ? '' : summary.totalPnl >= 0 ? 'up' : 'down' },
    { label: '累计收益率', value: signed(summary.totalReturn), note: '累计盈亏 / 累计净投入', tone: summary.totalReturn === null ? '' : summary.totalReturn >= 0 ? 'up' : 'down' },
    { label: '持仓浮动盈亏', value: signedMoney(summary.unrealizedPnl, currency), note: '按移动平均成本计算', tone: summary.unrealizedPnl === null ? '' : summary.unrealizedPnl >= 0 ? 'up' : 'down' },
    { label: '已实现盈亏', value: signedMoney(summary.realizedPnl, currency), note: '已平仓部分，费用已计入', tone: summary.realizedPnl === null ? '' : summary.realizedPnl >= 0 ? 'up' : 'down' },
  ] : [];

  return <div className="page"><PageHeader title={selectedAccount?.name ?? '全部账户'} subtitle="真实交易、现金与行情 · 移动平均成本" actions={<><button className="button ghost" onClick={() => setImportOpen(true)}><Upload size={14} />导入 CSV</button><button className="button primary" onClick={() => setTransactionOpen(true)}><Plus size={14} />记一笔</button></>} />
    <AsyncState loading={loading} error={error}>{summary && <div className="account-metrics">{metrics.map(metric => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong className={metric.tone}>{metric.value}</strong><small>{metric.note}</small></article>)}</div>}</AsyncState>
    {summary && summary.warnings.length > 0 && <div className="history-footnote account-warnings">{summary.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    <div className="account-chart-grid"><section className="performance-panel"><div className="panel-head"><div className="section-title"><h2>收益表现</h2><span className="soft-badge">真实数据</span></div><span className="data-time">交易记录与本机历史行情</span></div><div className="performance-summary"><span>区间收益率 <b className={(curveReturn ?? 0) >= 0 ? 'up' : 'down'}>{signed(curveReturn)}</b></span><span>{points.length} 个真实数据点</span></div><PerformanceChart data={points} /></section><aside className="account-list"><div className="panel-head"><h2>账户构成</h2><span className="data-time">真实账户与记录数</span></div><div className="account-list-scroll">{accounts?.map(account => <button key={account.id} className={`account-item${activeAccount === account.id ? ' active' : ''}`} onClick={() => setActiveAccount(account.id)}><span className={`account-icon ${account.type === '模拟盘' ? 'violet' : account.id === 'global' ? 'blue' : 'coral'}`}>{account.type === '汇总账户' ? '全' : account.type === '模拟盘' ? '模' : account.id === 'global' ? '港' : '实'}</span><div><strong>{account.name}</strong><small>{account.type}</small></div><b>{account.type === '汇总账户' ? `${account.members.length} 个成员` : `${account.records} 笔`}</b></button>)}</div><div className="cash-row"><span>可用现金</span><strong>{money(summary?.cash ?? null, currency)}</strong></div><button className="button full ghost" onClick={() => navigate('/accounts/manage')}><Settings size={14} />管理账户</button></aside></div>
    <section className="positions-panel"><div className="panel-head"><div className="inline-tabs"><button className={activeTab === 'holdings' ? 'active' : ''} onClick={() => setActiveTab('holdings')}>持仓明细 <span>{summary?.positions.length ?? 0}</span></button><button className={activeTab === 'transactions' ? 'active' : ''} onClick={() => setActiveTab('transactions')}>交易记录 <span>{transactions?.length ?? 0}</span></button></div><span className="data-time">持仓与收益均来自当前账户的真实记录</span></div>
      {activeTab === 'holdings' && summary && summary.positions.length > 0 && <div className="account-table-scroll"><table className="data-table"><thead><tr><th>股票</th><th className="num">持股数量</th><th className="num">成本价</th><th className="num">现价</th><th className="num">持仓市值</th><th className="num">仓位占比</th><th className="num">浮动盈亏</th><th className="num">持仓收益率</th></tr></thead><tbody>{summary.positions.map(position => <tr key={position.instrumentId}><td><strong>{position.name}</strong><small>{position.code} · {position.market}</small></td><td className="num">{position.quantity.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}</td><td className="num">{money(position.costPrice, position.currency)}</td><td className="num">{money(position.price, position.currency)}</td><td className="num">{money(position.marketValue, position.currency)}</td><td className="num">{position.weight === null ? '—' : `${position.weight.toFixed(2)}%`}</td><td className="num">{signedMoney(position.unrealizedPnl, position.currency)}</td><td className="num"><ChangeText value={position.returnPct} /></td></tr>)}</tbody></table></div>}
      {activeTab === 'holdings' && summary && !summary.positions.length && <div className="empty-block">当前账户没有持仓。可通过“记一笔”或“导入 CSV”录入真实交易。</div>}
      {activeTab === 'transactions' && transactions && transactions.length > 0 && <div className="account-table-scroll"><table className="data-table"><thead><tr><th>日期时间</th><th>账户</th><th>类型</th><th>股票</th><th className="num">数量</th><th className="num">成交价</th><th className="num">成交金额</th><th className="num">费用</th><th>备注</th></tr></thead><tbody>{transactions.map(transaction => { const account = accounts?.find(item => item.id === transaction.accountId); const transactionCurrency = account?.currency ?? currency; return <tr key={transaction.id}><td>{transaction.date.replace('T', ' ')}</td><td>{account?.name ?? transaction.accountId}</td><td className={transaction.type === 'buy' || transaction.type === 'deposit' ? 'up' : 'down'}>{({ buy: '买入', sell: '卖出', deposit: '转入', withdraw: '转出' } as const)[transaction.type]}</td><td>{transaction.instrumentId ?? '—'}</td><td className="num">{transaction.quantity ?? '—'}</td><td className="num">{transaction.price === null || transaction.price === undefined ? '—' : money(transaction.price, transactionCurrency)}</td><td className="num">{money(transaction.amount, transactionCurrency)}</td><td className="num">{(transaction.fee ?? 0).toFixed(2)}</td><td>{transaction.note || '—'}</td></tr>; })}</tbody></table></div>}
      {activeTab === 'transactions' && !transactions?.length && <div className="empty-block">点击右上角“记一笔”或“导入 CSV”添加真实交易记录。</div>}
    </section>
    <TransactionModal open={transactionOpen} onClose={() => setTransactionOpen(false)} accounts={accounts ?? []} onSaved={refreshAll} />
    <ImportTransactionsModal open={importOpen} onClose={() => setImportOpen(false)} accounts={accounts ?? []} initialAccountId={activeAccount === 'all' ? undefined : activeAccount} onImported={refreshAll} />
  </div>;
}
