import { useState } from 'react';
import { Check, Star } from 'lucide-react';
import type { Instrument, WatchlistData } from '@weiwei/contracts';
import { amount, dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { useApp } from '@/app/providers/AppProviders';
import { Modal } from '@/components/ui/Modal';
import { ChangeText } from '@/components/ui/ChangeText';
import { CandleChart } from '@/components/charts/CandleChart';

function percent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

export function InstrumentPreviewModal({ stock, onClose }: { stock: Instrument | null; onClose: () => void }) {
  const { data: watchlist, refresh } = useApi<WatchlistData>(stock ? '/watchlist' : null, [stock?.id]);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useApp();
  const joined = Boolean(stock && (addedId === stock.id || watchlist?.stocks.some(item => item.id === stock.id)));
  const add = async () => {
    if (!stock || joined || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post<Instrument, Record<string, never>>(`/watchlist/${stock.id}`, {});
      setAddedId(stock.id);
      refresh();
      window.dispatchEvent(new Event('weiwei-tags-changed'));
      notify(`${stock.name}已加入自选`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加入自选失败');
    } finally {
      setBusy(false);
    }
  };
  return <Modal open={Boolean(stock)} onClose={onClose} title={stock ? `${stock.name} · ${stock.code}` : '股票详情'} className="instrument-preview-dialog" footer={stock && <><span className="instrument-preview-provenance">{stock.dataSource} · {stock.quoteTime ? dateTime(stock.quoteTime) : '报价时间未知'}{stock.financialReport ? ` · 财报期 ${stock.financialReport}` : ''}</span><button className="button primary" disabled={joined || busy} onClick={() => void add()}>{joined ? <Check size={15} /> : <Star size={15} />}{busy ? '正在加入…' : joined ? '已加入自选' : '加入自选'}</button></>}>
    {stock && <div className="instrument-preview-body">
      <div className="instrument-preview-quote"><strong>{money(stock.price, stock.currency)}</strong><ChangeText value={stock.changePct} /><span>{stock.market} · {stock.industry}</span><span className="soft-badge">{stock.status}</span></div>
      <CandleChart instrumentId={stock.id} height={360} />
      <dl className="instrument-preview-facts">
        <div><dt>成交额</dt><dd>{amount(stock.amount)}</dd></div>
        <div><dt>换手率</dt><dd>{percent(stock.turnover)}</dd></div>
        <div><dt>总市值</dt><dd>{amount(stock.cap)}</dd></div>
        <div><dt>所属行业</dt><dd>{stock.industry}</dd></div>
        <div><dt>股息率</dt><dd>{percent(stock.dividend)}</dd></div>
        <div><dt>ROE</dt><dd>{percent(stock.roe)}</dd></div>
        <div><dt>净利率</dt><dd>{percent(stock.net)}</dd></div>
        <div><dt>资产负债率</dt><dd>{percent(stock.debt)}</dd></div>
      </dl>
      {stock.tags.length > 0 && <div className="tag-list instrument-preview-tags">{stock.tags.map(tag => <span className="stock-tag" key={tag}>#{tag}</span>)}</div>}
      {error && <p className="history-error" role="alert">{error}</p>}
    </div>}
  </Modal>;
}
