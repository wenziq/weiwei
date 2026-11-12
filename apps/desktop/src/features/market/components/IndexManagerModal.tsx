import { useEffect, useState } from 'react';
import type { IndexQuote } from '@weiwei/contracts';
import { Modal } from '@/components/ui/Modal';
import { useApp } from '@/app/providers/AppProviders';

export function IndexManagerModal({ open, onClose, indices, favorites, onSave }: { open: boolean; onClose: () => void; indices: IndexQuote[]; favorites: string[]; onSave: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(favorites);
  const { notify } = useApp();
  useEffect(() => { if (open) setSelected(favorites); }, [open, favorites]);
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const save = () => {
    if (selected.length > 6) { notify('核心关注最多选择 6 个'); return; }
    if (!selected.length) { notify('请至少保留 1 个核心指数'); return; }
    onSave(selected); onClose();
  };
  return <Modal open={open} onClose={onClose} title="管理核心关注指数" className="wide" footer={<><span className="dialog-subtitle">已选择 {selected.length} / 6</span><button className="button primary" onClick={save}>保存关注</button></>}>
    <p className="dialog-subtitle">首页顶部最多显示 6 个核心指数，全部 22 个指数始终保留在指数全景中。</p>
    <div className="index-manager-grid">{indices.map(item => <label className="setting-row" key={item.id}><span>{item.name}<small>{item.code} · {item.group}</small></span><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></label>)}</div>
  </Modal>;
}
