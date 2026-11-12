import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { WatchGroup } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';

export function GroupManagerModal({ open, onClose, groups, currentGroup, onChanged, onSelect }: { open: boolean; onClose: () => void; groups: WatchGroup[]; currentGroup: string; onChanged: () => void; onSelect: (name: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(''); setError(null); setConfirmDelete(null); } }, [open]);
  const changed = () => { onChanged(); window.dispatchEvent(new Event('weiwei-groups-changed')); };
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true); setError(null);
    try { const group = await api.post<WatchGroup, { name: string }>('/watchlist/groups', { name: name.trim() }); changed(); onSelect(group.name); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '创建分组失败'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirmDelete) return;
    setBusy(true); setError(null);
    try {
      await api.delete(`/watchlist/groups/${encodeURIComponent(confirmDelete)}`);
      const deleted = confirmDelete;
      setConfirmDelete(null);
      changed();
      if (deleted === currentGroup) onSelect('观察');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '删除分组失败'); }
    finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="管理自选分组" footer={<span className="dialog-subtitle">删除分组只移除组织关系，不删除股票标签、研究档案或真实交易记录。</span>}>
    <div className="group-create-row"><label>新建分组<input autoFocus value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void create(); }} placeholder="例如：AI 算力观察" maxLength={24} /></label><button className="button primary" disabled={busy || !name.trim()} onClick={() => void create()}><Plus size={15} />新建分组</button></div>
    {error && <p className="history-error" role="alert">{error}</p>}
    <div className="group-manager-list">{groups.map(group => <div className="setting-row" key={group.name}><button className="group-name-button" onClick={() => onSelect(group.name)}><strong>{group.name}</strong><small>{group.count} 只股票</small></button>{['全部账户 · 持仓', '观察'].includes(group.name) ? <span className="soft-badge">系统分组</span> : <button className="icon-button" aria-label={`删除分组 ${group.name}`} title={`删除分组 ${group.name}`} onClick={() => setConfirmDelete(group.name)}><Trash2 size={15} /></button>}</div>)}</div>
    {confirmDelete && <div className="group-delete-confirm" role="alert"><p>确认删除“{confirmDelete}”？只删除分组，不删除其中股票的研究数据。</p><div><button className="button ghost" onClick={() => setConfirmDelete(null)}>取消</button><button className="button primary" disabled={busy} onClick={() => void remove()}>确认删除</button></div></div>}
  </Modal>;
}
