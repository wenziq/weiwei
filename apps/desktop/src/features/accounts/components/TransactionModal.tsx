import { useEffect, useState } from 'react';
import type { Account, Instrument, Transaction, TransactionInput } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApi, useDebouncedValue } from '@/lib/useApi';
import { useApp } from '@/app/providers/AppProviders';
import { Modal } from '@/components/ui/Modal';

function localDateTime() { return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function TransactionModal({ open, onClose, accounts, onSaved }: { open: boolean; onClose: () => void; accounts: Account[]; onSaved: (transaction: Transaction) => void }) {
  const [accountId, setAccountId] = useState('cmb');
  const [type, setType] = useState<TransactionInput['type']>('buy');
  const [instrumentId, setInstrumentId] = useState('sz-300502');
  const [stockQuery, setStockQuery] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('10000');
  const [fee, setFee] = useState('5.00');
  const [date, setDate] = useState(localDateTime);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { notify } = useApp();
  const available = accounts.filter(account => account.type !== '汇总账户' && !account.archived);
  const debounced = useDebouncedValue(stockQuery);
  const { data: stockData, loading: searching } = useApi<Instrument[]>(open ? `/market/catalog/search?query=${encodeURIComponent(debounced)}&limit=20` : null, [open, debounced]);
  useEffect(() => {
    if (open) { setAccountId(current => available.some(item => item.id === current) ? current : available[0]?.id ?? ''); setDate(localDateTime()); setStockQuery(''); }
  }, [open, accounts]);
  const isTrade = type === 'buy' || type === 'sell';
  const submit = async () => {
    setSaving(true);
    try {
      const payload: TransactionInput = { type, date, fee: Number(fee), note, ...(isTrade ? { instrumentId, quantity: Number(quantity), price: Number(price) } : { amount: Number(amount) }) };
      const transaction = await api.post<Transaction, TransactionInput>(`/accounts/${accountId}/transactions`, payload);
      onSaved(transaction); onClose(); notify('记录已保存，账户记录已更新');
    } catch (reason) { notify(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setSaving(false); }
  };
  return <Modal open={open} onClose={onClose} title="记一笔" footer={<><button className="button ghost" onClick={onClose}>取消</button><button className="button primary" disabled={saving || !available.length} onClick={() => void submit()}>{saving ? '保存中…' : '保存记录'}</button></>}>
    <div className="form-grid"><label>账户<select value={accountId} onChange={event => setAccountId(event.target.value)}>{available.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>类型<select value={type} onChange={event => setType(event.target.value as TransactionInput['type'])}><option value="buy">买入</option><option value="sell">卖出</option><option value="deposit">资金转入</option><option value="withdraw">资金转出</option></select></label>{isTrade ? <><label className="full">搜索全市场股票<input value={stockQuery} onChange={event => setStockQuery(event.target.value)} placeholder="输入名称或代码，例如 600519、腾讯控股、AAPL" /><small>{searching ? '正在搜索…' : '覆盖沪深京、港股与美股目录'}</small></label><label className="full">股票<select value={instrumentId} onChange={event => { const id = event.target.value; setInstrumentId(id); const stock = stockData?.find(item => item.id === id); if (stock?.price !== null && stock?.price !== undefined) setPrice(String(stock.price)); }}>{stockData && !stockData.some(item => item.id === instrumentId) && <option value={instrumentId}>{instrumentId}（当前选择）</option>}{stockData?.map(stock => <option key={stock.id} value={stock.id}>{stock.name} · {stock.code} · {stock.market}</option>)}</select></label><label>数量<input type="number" min="0" step="any" value={quantity} onChange={event => setQuantity(event.target.value)} /></label><label>成交价<input type="number" min="0" step="any" value={price} onChange={event => setPrice(event.target.value)} placeholder="按实际成交填写" /></label></> : <label>金额<input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>}<label>费用<input type="number" min="0" step="0.01" value={fee} onChange={event => setFee(event.target.value)} /></label><label>日期时间<input type="datetime-local" value={date} onChange={event => setDate(event.target.value)} /></label><label className="full">备注<input value={note} onChange={event => setNote(event.target.value)} placeholder="可选" /></label></div>
    {!available.length && <p className="history-error">请先在账户管理中新建或恢复一个可记账账户。</p>}
    <p className="dialog-subtitle" style={{ marginTop: 12 }}>买卖按“数量 × 成交价 + 费用”计算成交额。选择股票时可使用当前行情作为填写起点，请按真实成交核对。资金转入转出不会直接改变时间加权收益率。</p>
  </Modal>;
}
