import { useEffect, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import type { Account, TransactionImportResult } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { downloadText } from '@/lib/format';
import { useApp } from '@/app/providers/AppProviders';
import { Modal } from '@/components/ui/Modal';

export function ImportTransactionsModal({ open, onClose, accounts, initialAccountId, onImported }: { open: boolean; onClose: () => void; accounts: Account[]; initialAccountId?: string; onImported: () => void }) {
  const available = accounts.filter(account => account.type !== '汇总账户' && !account.archived);
  const [accountId, setAccountId] = useState(initialAccountId ?? available[0]?.id ?? '');
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useApp();
  useEffect(() => {
    if (open) { setAccountId(available.some(item => item.id === initialAccountId) ? initialAccountId! : available[0]?.id ?? ''); setFilename(''); setContent(''); setError(null); }
  }, [open, initialAccountId, accounts]);
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 5_000_000) { setError('CSV 文件不能超过 5 MB'); return; }
    setFilename(file.name); setContent(await file.text());
  };
  const submit = async () => {
    setSaving(true); setError(null);
    try {
      const result = await api.post<TransactionImportResult, { content: string }>(`/accounts/${accountId}/transactions/import`, { content });
      notify(`已导入 ${result.imported} 笔真实交易记录`); onImported(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '导入失败，请检查文件格式'); }
    finally { setSaving(false); }
  };
  return <Modal open={open} onClose={onClose} title="导入交易记录" className="wide" footer={<><button className="button ghost" onClick={onClose}>取消</button><button className="button primary" disabled={!accountId || !content || saving} onClick={() => void submit()}><FileUp size={15} />{saving ? '正在校验并导入…' : '导入交易记录'}</button></>}>
    <div className="form-grid"><label>导入到账户<select value={accountId} onChange={event => setAccountId(event.target.value)}>{available.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>选择 CSV 文件<input type="file" accept=".csv,text/csv" onChange={event => void readFile(event.target.files?.[0])} /></label></div>
    <div className="import-help"><p>必需列：<strong>日期、类型</strong>；买卖还需要<strong>股票、数量、成交价</strong>。可选列：金额、费用、备注。</p><p>类型支持买入、卖出、资金转入、资金转出。股票支持标的 ID（如 sh-600519）、代码或唯一名称；记录写入上方所选账户。</p><button className="text-button" onClick={() => downloadText('危微-交易导入模板.csv', '\ufeff日期,类型,股票,数量,成交价,金额,费用,备注\n', 'text/csv;charset=utf-8')}><Download size={13} />下载空白 CSV 模板</button></div>
    {filename && <div className="csv-file-preview"><strong>{filename}</strong><span>{content.split(/\r?\n/).filter(line => line.trim()).length - 1} 行待校验</span><pre>{content.split(/\r?\n/).slice(0, 6).join('\n')}</pre></div>}
    {!available.length && <p className="history-error">没有可记账账户，请先在账户管理中新建或恢复账户。</p>}
    {error && <p className="history-error" role="alert">{error}</p>}
    <p className="dialog-subtitle">所有记录校验通过后才写入，不会产生部分导入。收益汇总目前仍为演示口径。</p>
  </Modal>;
}
