import { useEffect, useMemo, useState } from 'react';
import { Download, Edit3, FileText, History, MessageSquareText, Plus, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { ResearchDocument, ResearchVersion } from '@weiwei/contracts';
import { useApi } from '@/lib/useApi';
import { dateTime, downloadText } from '@/lib/format';
import { markdownExcerpt } from '@/lib/markdown';
import { api } from '@/lib/api';
import { useApp } from '@/app/providers/AppProviders';
import { PageHeader } from '@/components/ui/PageHeader';
import { AsyncState } from '@/components/ui/AsyncState';
import { Modal } from '@/components/ui/Modal';
import { MarkdownPreview } from '../components/MarkdownPreview';
import { MarkdownStudio } from '../components/MarkdownStudio';
import { ResearchCreateModal } from '../components/ResearchCreateModal';
import { ResearchAssistant } from '../components/ResearchAssistant';
import { ResearchMetadataModal } from '../components/ResearchMetadataModal';

export function ResearchPage() {
  const { data: documents, loading, error, refresh, setData: setDocuments } = useApi<ResearchDocument[]>('/research');
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('document');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('全部');
  const [editing, setEditing] = useState<ResearchDocument | null>(null);
  const [editingMetadata, setEditingMetadata] = useState<ResearchDocument | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPreview, setHistoryPreview] = useState<ResearchVersion | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { notify } = useApp();
  const filtered = useMemo(() => (documents ?? []).filter(item => (status === '全部' || item.status === status) && `${item.title}${item.contentMarkdown}`.toLowerCase().includes(query.toLowerCase())), [documents, query, status]);
  const selected = documents?.find(item => item.id === selectedId) ?? filtered[0] ?? documents?.[0];
  useEffect(() => { if (selected && selected.id !== selectedId) setSearchParams({ document: selected.id }, { replace: true }); }, [selected?.id]);
  const exportDocument = () => { if (selected) downloadText(`${selected.title}.md`, selected.contentMarkdown, 'text/markdown;charset=utf-8'); };
  const importDocument = () => {
    if (!selected) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.md,.markdown,.txt';
    input.onchange = async () => { const file = input.files?.[0]; if (file) setEditing({ ...selected, contentMarkdown: await file.text() }); };
    input.click();
  };
  const deleteDocument = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await api.delete(`/research/${selected.id}`);
      const remaining = (documents ?? []).filter(item => item.id !== selected.id);
      setDocuments(remaining);
      setSearchParams(remaining[0] ? { document: remaining[0].id } : {}, { replace: true });
      setDeleteOpen(false);
      setHistoryOpen(false);
      setHistoryPreview(null);
      setAssistantOpen(false);
      notify(`已删除“${selected.title.replace(' · 研究档案', '')}”`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : '删除研究失败'); }
    finally { setDeleting(false); }
  };
  return <div className="page"><PageHeader title="研究库" subtitle="研究在这里沉淀，与短期股价保持距离" actions={<><button className="button ghost" disabled={!selected} onClick={exportDocument}><Download size={14} />导出备份</button><button className="button ghost" disabled={!selected} onClick={importDocument}><Upload size={14} />导入 Markdown</button><button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={14} />新建研究</button></>} />
    <div className="research-toolbar"><label className="inner-search"><FileText size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索研究正文、股票" /></label>{['全部', '未研究', '待研究', '已完成', '已放弃'].map(name => <button key={name} className={`filter-chip${status === name ? ' active' : ''}`} onClick={() => setStatus(name)}>{name}<span>{name === '全部' ? documents?.length ?? 0 : documents?.filter(item => item.status === name).length ?? 0}</span></button>)}</div>
    <div className="research-layout"><aside className="research-list"><div className="research-list-head"><span>{filtered.length} 份研究档案</span><span>最近更新</span></div><AsyncState loading={loading} error={error} empty={!filtered.length}>{filtered.map(item => <button key={item.id} className={`research-list-item${selected?.id === item.id ? ' active' : ''}`} onClick={() => setSearchParams({ document: item.id })}><div><strong>{item.title.replace(' · 研究档案', '')}</strong><small>{item.instrumentId}</small><span className={`research-state ${item.status === '已完成' ? 'done' : 'todo'}`}>{item.status}</span></div><p>{markdownExcerpt(item.contentMarkdown)}</p><footer><span className={item.attitude === '看好' ? 'up' : item.attitude === '不看好' ? 'down' : 'muted-text'}>{item.attitude}</span><span>{item.updatedAt.slice(0, 10)}</span></footer></button>)}</AsyncState></aside>
      {selected && <><article className="research-document"><div className="document-head"><div><div className="stock-title"><h2>{selected.title.replace(' · 研究档案', '')}</h2><span>{selected.instrumentId}</span><span className={`research-state ${selected.status === '已完成' ? 'done' : 'todo'}`}>{selected.status}</span></div><p>最后更新于 {dateTime(selected.updatedAt)}</p></div><div><button className="button compact ghost danger" onClick={() => setDeleteOpen(true)}><Trash2 size={14} />删除</button><button className="button compact ghost" onClick={() => setEditingMetadata(selected)}><SlidersHorizontal size={14} />编辑信息</button><button className="button compact ghost" onClick={() => setHistoryOpen(true)}><History size={14} />历史版本</button><button className="button compact primary" onClick={() => setEditing(selected)}><Edit3 size={14} />编辑研究</button></div></div><MarkdownPreview markdown={selected.contentMarkdown} /></article><aside className="research-side"><section><div className="panel-head"><h3>研究信息</h3><button className="text-button" onClick={() => setEditingMetadata(selected)}>修改</button></div><dl><div><dt>研究状态</dt><dd><span className={`research-state ${selected.status === '已完成' ? 'done' : 'todo'}`}>{selected.status}</span></dd></div><div><dt>我的态度</dt><dd className={selected.attitude === '看好' ? 'up' : selected.attitude === '不看好' ? 'down' : ''}>{selected.attitude}</dd></div><div><dt>关联标的</dt><dd>{selected.instrumentId}</dd></div><div><dt>研究完成</dt><dd>{selected.completedAt ?? '尚未完成'}</dd></div><div><dt>下次复查</dt><dd>{selected.reviewAt ?? '未设置'}</dd></div></dl><div className="tag-list">{selected.tags.map(tag => <span className="stock-tag" key={tag}>#{tag}</span>)}</div></section><section><h3>围绕这只股票继续研究</h3><p className="dialog-subtitle">把你的问题与当前研究正文一起交给 AI，核对后可写回正文。</p><button className="button full ghost research-assistant-button" onClick={() => setAssistantOpen(true)}><MessageSquareText size={16} />打开 AI 研究对话</button></section><button className="button full ghost" onClick={() => setHistoryOpen(true)}><History size={14} />查看 {selected.history?.length ?? 0} 个历史版本</button></aside></>}
    </div>
    <ResearchCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={document => { setCreateOpen(false); setEditing(document); refresh(); }} />
    {editing && <MarkdownStudio document={editing} onClose={() => setEditing(null)} onSaved={updated => { setEditing(updated); refresh(); }} />}
    {editingMetadata && <ResearchMetadataModal document={editingMetadata} onClose={() => setEditingMetadata(null)} onSaved={updated => { setDocuments(current => current?.map(item => item.id === updated.id ? updated : item) ?? current); }} />}
    {selected && <ResearchAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} document={selected} />}
    <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="研究历史版本"><p className="dialog-subtitle">正文或研究信息发生变化时自动保留旧版本，可查看历史正文。</p>{(selected?.history ?? []).slice().reverse().map((version, index) => <div className="setting-row" key={`${version.updatedAt}-${index}`}><span>版本 {(selected?.history?.length ?? 0) - index}<small>{dateTime(version.updatedAt)}</small></span><button className="text-button" onClick={() => setHistoryPreview(version)}>查看</button></div>)}{(selected?.history?.length ?? 0) === 0 && <div className="empty-block">完成一次正文或研究信息修改后，这里会显示真实历史版本。</div>}</Modal>
    <Modal open={Boolean(historyPreview)} onClose={() => setHistoryPreview(null)} title={historyPreview ? `历史版本 · ${historyPreview.updatedAt.slice(0, 10)}` : ''} className="wide">{historyPreview && <MarkdownPreview markdown={historyPreview.contentMarkdown} />}</Modal>
    <Modal open={deleteOpen && Boolean(selected)} onClose={() => setDeleteOpen(false)} title="删除研究档案" footer={<><button className="button ghost" onClick={() => setDeleteOpen(false)}>取消</button><button className="button danger" disabled={deleting} onClick={() => void deleteDocument()}><Trash2 size={15} />{deleting ? '正在删除…' : '确认永久删除'}</button></>}><p className="delete-account-warning">将永久删除<strong>{selected?.title.replace(' · 研究档案', '')}</strong>的正文及全部历史版本，无法恢复。</p><p className="dialog-subtitle">不会影响股票、自选、标签或账户交易记录。</p></Modal>
  </div>;
}
