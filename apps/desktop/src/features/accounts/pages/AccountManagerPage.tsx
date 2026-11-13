import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Download, Plus, Trash2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Account, AccountInput, Transaction } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { csvCell, downloadText } from '@/lib/format';
import { useApp } from '@/app/providers/AppProviders';
import { PageHeader } from '@/components/ui/PageHeader';
import { AsyncState } from '@/components/ui/AsyncState';
import { Modal } from '@/components/ui/Modal';
import { ImportTransactionsModal } from '../components/ImportTransactionsModal';

export function AccountManagerPage() {
  const { data: accounts, loading, error, refresh } = useApi<Account[]>('/accounts');
  const [selectedId, setSelectedId] = useState('all');
  const [form, setForm] = useState<Account | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newType, setNewType] = useState<Account['type']>('实盘账户');
  const [newName, setNewName] = useState('');
  const [newCurrency, setNewCurrency] = useState<Account['currency']>('CNY');
  const [newDescription, setNewDescription] = useState('');
  const [exporting, setExporting] = useState(false);
  const { notify } = useApp();
  const navigate = useNavigate();
  const items = accounts ?? [];
  const selected = items.find(account => account.id === selectedId) ?? items[0];
  useEffect(() => { if (selected) setForm({ ...selected }); }, [selected?.id]);
  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { notify('账户名称不能为空'); return; }
    try { const updated = await api.patch<Account, Partial<Account>>(`/accounts/${form.id}`, form); setForm(updated); refresh(); notify('账户设置已保存'); }
    catch (reason) { notify(reason instanceof Error ? reason.message : '保存失败'); }
  };
  const remove = async () => {
    if (!form) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/accounts/${form.id}`);
      const remaining = items.filter(account => account.id !== form.id);
      setSelectedId(remaining[0]?.id ?? 'all');
      setForm(null);
      setDeleteOpen(false);
      refresh();
      notify(`已永久删除“${form.name}”`);
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };
  const create = async () => {
    if (!newName.trim()) { notify('请输入账户名称'); return; }
    const payload: AccountInput = { name: newName.trim(), type: newType, currency: newCurrency, description: newDescription.trim(), initial: 0, members: [] };
    try {
      const account = await api.post<Account, AccountInput>('/accounts', payload);
      refresh(); setSelectedId(account.id); setNewOpen(false); setNewName(''); setNewDescription(''); notify(`已创建${newType}“${account.name}”`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : '账户创建失败'); }
  };
  const exportTransactions = async () => {
    if (!form) return;
    setExporting(true);
    try {
      const transactions = await api.get<Transaction[]>(`/accounts/${form.id}/transactions`);
      const types = { buy: '买入', sell: '卖出', deposit: '资金转入', withdraw: '资金转出' };
      const rows = transactions.map(item => [item.date, form.name, types[item.type], item.instrumentId ?? '', item.quantity ?? '', item.price ?? '', item.amount, item.fee ?? 0, item.note ?? ''].map(csvCell).join(','));
      downloadText(`${form.name}-交易记录.csv`, `\ufeff日期,账户,类型,股票,数量,成交价,金额,费用,备注\n${rows.join('\n')}\n`, 'text/csv;charset=utf-8');
      notify(`已导出 ${transactions.length} 笔真实交易记录`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : '导出失败'); }
    finally { setExporting(false); }
  };
  return <div className="page"><PageHeader title="账户管理" subtitle="管理真实账户、交易记录与收益口径" actions={<><button className="button ghost" onClick={() => navigate('/accounts')}><ArrowLeft size={14} />返回账户收益</button><button className="button primary" onClick={() => setNewOpen(true)}><Plus size={14} />新建账户</button></>} />
    <div className="account-manager-summary"><div><span>实盘账户</span><strong>{items.filter(account => account.type === '实盘账户').length}</strong><small>独立记账</small></div><div><span>汇总账户</span><strong>{items.filter(account => account.type === '汇总账户').length}</strong><small>不单独记账</small></div><div><span>模拟盘</span><strong>{items.filter(account => account.type === '模拟盘').length}</strong><small>独立统计</small></div><div><span>交易记录</span><strong>{items.reduce((sum, account) => sum + account.records, 0)}</strong><small>按实际记录统计</small></div></div>
    <div className="account-manager-workspace"><aside className="account-manager-list"><div className="account-manager-list-head"><h2>我的账户</h2><span>{items.length} 个账户</span></div>{(['汇总账户', '实盘账户', '模拟盘'] as const).map(type => <div key={type}><div className="account-list-section-label">{type === '汇总账户' ? '账户总览' : type}</div>{items.filter(account => account.type === type).map(account => <button key={account.id} className={`managed-account-item${selected?.id === account.id ? ' active' : ''}`} onClick={() => setSelectedId(account.id)}><span className={`account-icon ${account.type === '模拟盘' ? 'violet' : account.id === 'global' ? 'blue' : 'coral'}`}>{account.type === '汇总账户' ? '全' : account.type === '模拟盘' ? '模' : account.id === 'global' ? '港' : '实'}</span><span><strong>{account.name}</strong><small>{account.type} · {account.currency}</small></span><b>{account.type === '汇总账户' ? `${account.members.length} 个成员` : `${account.records} 笔`}</b></button>)}</div>)}</aside>
      <div className="account-manager-detail"><AsyncState loading={loading} error={error} empty={!form}>{form && <><div className="account-detail-head"><div><span className="account-icon coral">{form.type === '汇总账户' ? '全' : form.type === '模拟盘' ? '模' : '实'}</span><div><h2>{form.name}</h2><p>{form.type} · 账户规则与记账设置</p></div></div><span className="soft-badge">{form.currency} 记账</span></div>
        <section className="form-section"><h3>基本信息</h3><div className="form-grid"><label>账户名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>账户类型<select value={form.type} disabled><option>{form.type}</option></select></label><label>记账币种<select value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value as Account['currency'] })}><option value="CNY">人民币</option><option value="USD">美元</option><option value="HKD">港币</option></select></label><label>开始记账日期<input type="date" value={form.start} onChange={event => setForm({ ...form, start: event.target.value })} /></label><label className="full">账户说明<input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label></div></section>
        {form.type === '汇总账户' && <section className="form-section"><h3>成员账户</h3><div className="description">汇总账户只合并所选实盘账户，本身不单独记账。模拟盘不会混入实盘汇总。</div>{items.filter(account => account.type === '实盘账户').map(member => <label className="account-member-row" key={member.id}><span>{member.name}<small>{member.currency} · {member.records} 笔记录</small></span><input type="checkbox" checked={form.members.includes(member.id)} onChange={() => setForm({ ...form, members: form.members.includes(member.id) ? form.members.filter(id => id !== member.id) : [...form.members, member.id] })} /></label>)}</section>}
        {form.type === '实盘账户' && <><section className="form-section"><h3>默认交易费率</h3><div className="description">录入买卖时可参考此费率计算，仍可对每一笔费用手动修改。</div><div className="form-grid"><label>佣金（万分之）<input type="number" min="0" step="any" value={form.commission} onChange={event => setForm({ ...form, commission: Number(event.target.value) })} /></label><label>最低费用<input type="number" min="0" step="any" value={form.minFee} onChange={event => setForm({ ...form, minFee: Number(event.target.value) })} /></label><label>印花税（万分之）<input type="number" min="0" step="any" value={form.stamp} onChange={event => setForm({ ...form, stamp: Number(event.target.value) })} /></label></div><p className="dialog-subtitle">持仓使用移动平均成本，买入费用计入成本，卖出费用冲减收入。</p></section><section className="form-section"><h3>期初设置</h3><div className="form-grid"><label>期初资产（{form.currency}）<input type="number" min="0" step="any" value={form.initial} onChange={event => setForm({ ...form, initial: Number(event.target.value) })} /></label></div></section></>}
        {form.type === '模拟盘' && <section className="form-section"><h3>模拟盘设置</h3><div className="form-grid"><label>初始资金<input type="number" min="0" step="any" value={form.initial} onChange={event => setForm({ ...form, initial: Number(event.target.value) })} /></label><label>默认成交价格<select value={form.fill} onChange={event => setForm({ ...form, fill: event.target.value })}><option>录入时实时价格</option><option>手动填写价格</option></select></label></div><p className="dialog-subtitle">模拟盘独立统计，不纳入实盘汇总。</p></section>}
        <section className="form-section"><h3>数据与记录</h3><div className="account-member-row"><span>交易与资金记录<small>{form.records} 笔 · 持仓与收益按实际记录计算</small></span><button className="button compact ghost" disabled={exporting} onClick={() => void exportTransactions()}><Download size={13} />{exporting ? '正在导出…' : '导出 CSV'}</button><button className="button compact ghost" onClick={() => setImportOpen(true)}><Upload size={13} />导入 CSV</button></div><div className="account-member-row"><span>存储位置<small>数据保存在当前设置的后端</small></span><span className="health-ok">已持久化</span></div></section>
        <section className="form-section"><div className="account-danger-zone"><span><strong>删除此账户</strong><small>永久删除账户及其交易记录，操作不可恢复。</small></span><button className="button ghost danger" onClick={() => { setDeleteError(null); setDeleteOpen(true); }}><Trash2 size={14} />删除账户</button></div></section><div className="form-actions"><span>设置保存到当前后端，不会修改历史交易</span><button className="button ghost" onClick={() => setForm({ ...selected! })}>取消修改</button><button className="button primary" onClick={() => void save()}><Check size={14} />保存设置</button></div></>}</AsyncState></div>
    </div>
    <Modal open={newOpen} onClose={() => setNewOpen(false)} title="新建账户" footer={<button className="button primary" onClick={() => void create()}>创建账户</button>}><div className="inline-tabs" style={{ marginBottom: 14 }}>{(['实盘账户', '模拟盘', '汇总账户'] as const).map(type => <button key={type} className={newType === type ? 'active' : ''} onClick={() => setNewType(type)}>{type}</button>)}</div><div className="form-grid"><label>账户名称<input value={newName} onChange={event => setNewName(event.target.value)} placeholder="例如：长期实盘" /></label><label>记账币种<select value={newCurrency} onChange={event => setNewCurrency(event.target.value as Account['currency'])}><option value="CNY">人民币</option><option value="USD">美元</option><option value="HKD">港币</option></select></label><label className="full">账户说明<textarea value={newDescription} onChange={event => setNewDescription(event.target.value)} placeholder="可选" /></label></div></Modal>
    <Modal open={deleteOpen && Boolean(form)} onClose={() => setDeleteOpen(false)} title="永久删除账户" footer={<><button className="button ghost" onClick={() => setDeleteOpen(false)}>取消</button><button className="button danger" disabled={deleting} onClick={() => void remove()}><Trash2 size={15} />{deleting ? '正在删除…' : '确认永久删除'}</button></>}><p className="delete-account-warning">将永久删除<strong>{selected?.name ?? form?.name}</strong>及其 {selected?.records ?? form?.records ?? 0} 笔交易记录，无法恢复。</p>{form?.type === '汇总账户' && <p className="dialog-subtitle">汇总账户只删除汇总关系，成员账户及其交易记录不受影响。</p>}{deleteError && <p className="history-error" role="alert">{deleteError}</p>}</Modal>
    {form && <ImportTransactionsModal open={importOpen} onClose={() => setImportOpen(false)} accounts={items} initialAccountId={form.id} onImported={refresh} />}
  </div>;
}
