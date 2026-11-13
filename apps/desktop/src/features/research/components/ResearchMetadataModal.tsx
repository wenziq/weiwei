import { useState } from 'react';
import { Check } from 'lucide-react';
import type { ResearchDocument, ResearchMetadataUpdate, ResearchStatus } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ResearchMetadataModal({ document, onClose, onSaved }: { document: ResearchDocument; onClose: () => void; onSaved: (document: ResearchDocument) => void }) {
  const [status, setStatus] = useState<ResearchStatus>(document.status);
  const [attitude, setAttitude] = useState(document.attitude);
  const [completedAt, setCompletedAt] = useState(document.completedAt ?? today());
  const [reviewAt, setReviewAt] = useState(document.reviewAt ?? '');
  const [tags, setTags] = useState(document.tags.join('，'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (status === '已完成' && !completedAt) { setError('研究已完成时，请选择完成日期'); return; }
    setSaving(true); setError(null);
    try {
      const payload: ResearchMetadataUpdate = { status, attitude, tags: [...new Set(tags.split(/[，,]/).map(tag => tag.trim()).filter(Boolean))], completedAt: status === '已完成' ? completedAt : null, reviewAt: reviewAt || null };
      const updated = await api.patch<ResearchDocument, ResearchMetadataUpdate>(`/research/${document.id}`, payload);
      onSaved(updated); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试'); }
    finally { setSaving(false); }
  };
  return <Modal open onClose={onClose} title={`${document.title.replace(' · 研究档案', '')} · 研究信息`} footer={<><button className="button ghost" onClick={onClose}>取消</button><button className="button primary" disabled={saving} onClick={() => void save()}><Check size={15} />{saving ? '正在保存…' : '保存研究信息'}</button></>}>
    <div className="form-grid"><label>研究状态<select value={status} onChange={event => setStatus(event.target.value as ResearchStatus)}>{(['未研究', '待研究', '已完成', '已放弃'] as const).map(item => <option key={item} value={item}>{item}</option>)}</select></label><label>我的态度<select value={attitude} onChange={event => setAttitude(event.target.value)}>{['未设态度', '看好', '中性', '不看好'].map(item => <option key={item} value={item}>{item}</option>)}</select></label>{status === '已完成' && <label>研究完成日期<input type="date" value={completedAt} onChange={event => setCompletedAt(event.target.value)} /></label>}<label>下次复查日期<input type="date" value={reviewAt} onChange={event => setReviewAt(event.target.value)} /><small>可以不设置；到期时间由你决定</small></label><label className="full">研究标签<input value={tags} onChange={event => setTags(event.target.value)} placeholder="例如：光模块，长期跟踪" /><small>多个标签用逗号分隔；只修改研究档案，不改变自选股上的标签</small></label></div>
    {error && <p className="history-error" role="alert">{error}</p>}
    <p className="dialog-subtitle research-metadata-note">这些信息用于整理你的研究过程，不会改变持仓或产生交易。正文请使用“编辑研究”单独修改。</p>
  </Modal>;
}
