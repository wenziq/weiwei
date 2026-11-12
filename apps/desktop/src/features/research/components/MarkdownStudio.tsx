import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, LayoutList, MessageSquareText } from 'lucide-react';
import { ResearchAssistant } from './ResearchAssistant';
import type { ResearchDocument, ResearchUpdate } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { downloadText } from '@/lib/format';
import { useApp } from '@/app/providers/AppProviders';
import { MarkdownPreview } from './MarkdownPreview';

export function MarkdownStudio({ document, onClose, onSaved }: { document: ResearchDocument; onClose: () => void; onSaved: (document: ResearchDocument) => void }) {
  const [content, setContent] = useState(document.contentMarkdown);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [saveState, setSaveState] = useState('所有更改已保存');
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLElement>(null);
  const contentRef = useRef(content);
  const savePromise = useRef<Promise<void> | null>(null);
  const onSavedRef = useRef(onSaved);
  const { notify } = useApp();
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const save = useCallback(async () => {
    if (savePromise.current) return savePromise.current;
    const task = (async () => {
      while (true) {
        const snapshot = contentRef.current;
        const payload: ResearchUpdate = { contentMarkdown: snapshot, tags: document.tags, status: document.status, attitude: document.attitude };
        const updated = await api.put<ResearchDocument, ResearchUpdate>(`/research/${document.id}`, payload);
        onSavedRef.current(updated);
        if (contentRef.current === snapshot) break;
        setSaveState('正在保存新修改…');
      }
      setSaveState('所有更改已保存');
    })();
    savePromise.current = task;
    try { await task; } finally { savePromise.current = null; }
  }, [document]);

  useEffect(() => {
    if (content === document.contentMarkdown) return;
    setSaveState('有修改待保存');
    const timer = window.setTimeout(() => { save().catch(() => setSaveState('保存失败，内容仍保留在编辑器中')); }, 800);
    return () => window.clearTimeout(timer);
  }, [content, document.contentMarkdown, save]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save().catch(() => setSaveState('保存失败，内容仍保留在编辑器中')); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); format('bold'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save, content]);

  const close = async () => {
    try { await save(); onClose(); }
    catch { setSaveState('保存失败，内容仍保留在编辑器中'); notify('保存失败，请检查个人服务器连接后再关闭'); }
  };

  const format = (type: 'bold' | 'h2' | 'h3' | 'list' | 'quote' | 'table') => {
    const input = textarea.current;
    if (!input) return;
    const start = input.selectionStart, end = input.selectionEnd, selected = content.slice(start, end);
    const replacements = {
      bold: `**${selected || '文字'}**`, h2: `## ${selected || '标题'}`, h3: `### ${selected || '标题'}`,
      list: selected ? selected.split('\n').map(line => `- ${line}`).join('\n') : '- 列表项',
      quote: `> ${selected || '引用内容'}`,
      table: '\n| 观察维度 | 当前判断 | 需要验证 |\n| --- | --- | --- |\n| 项目一 | 待填写 | 待填写 |\n',
    };
    const replacement = replacements[type];
    contentRef.current = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
    setContent(contentRef.current);
    const selectedLength = selected.length;
    requestAnimationFrame(() => {
      input.focus();
      const from = type === 'bold' && selectedLength ? start + 2 : start + replacement.length;
      input.setSelectionRange(from, type === 'bold' && selectedLength ? from + selectedLength : from);
    });
  };

  const headings = useMemo(() => content.split('\n').flatMap((line, index) => {
    const match = line.match(/^(#{1,3})\s+(.+)/);
    return match ? [{ index, level: match[1]?.length ?? 1, title: match[2] }] : [];
  }), [content]);
  const activeHeading = headings.filter(item => item.index <= cursorLine).at(-1)?.index;
  const jumpToHeading = (index: number) => {
    if (mode === 'preview') {
      preview.current?.querySelectorAll('h1,h2,h3')[headings.findIndex(item => item.index === index)]?.scrollIntoView({ block: 'start' });
      return;
    }
    const offset = content.split('\n').slice(0, index).join('\n').length + (index ? 1 : 0);
    textarea.current?.focus();
    textarea.current?.setSelectionRange(offset, offset);
    setCursorLine(index);
  };

  return <div className="markdown-studio"><header className="studio-header"><button className="studio-back" onClick={() => void close()}><ArrowLeft size={15} />返回研究库</button><div className="studio-document"><strong>{document.title}</strong><span>{document.instrumentId}</span></div><span className="studio-save-state" role="status">{saveState}</span><div className="studio-header-actions"><button className="button compact ghost" onClick={() => setAssistantOpen(true)}><MessageSquareText size={14} />AI 研究</button><button className="button compact ghost" onClick={() => downloadText(`${document.title}.md`, content, 'text/markdown;charset=utf-8')}><Download size={14} />导出</button><button className="button compact primary" onClick={() => void close()}><Check size={14} />完成</button></div></header><div className="studio-toolbar"><div className="studio-toolbar-group"><button className={outlineOpen ? 'active' : ''} onClick={() => setOutlineOpen(value => !value)} aria-pressed={outlineOpen}><LayoutList size={15} />大纲</button>{(['edit', 'preview', 'split'] as const).map(item => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item === 'edit' ? '写作' : item === 'preview' ? '预览' : '分屏'}</button>)}</div><div className="studio-toolbar-group formatting"><button onClick={() => format('h2')}>H2</button><button onClick={() => format('h3')}>H3</button><button onClick={() => format('bold')} aria-label="加粗"><strong>B</strong></button><button onClick={() => format('list')}>• 列表</button><button onClick={() => format('quote')}>“ ”</button><button onClick={() => format('table')}>表格</button></div></div><div className={`studio-stage ${mode}${outlineOpen ? ' with-outline' : ''}`}>{outlineOpen && <aside className="studio-outline"><div className="studio-outline-title">本文大纲</div>{headings.map(item => <button key={item.index} className={`outline-level-${item.level}${activeHeading === item.index ? ' active' : ''}`} onClick={() => jumpToHeading(item.index)} title={item.title}>{item.title}</button>)}{!headings.length && <p>输入以 # 开头的标题后，这里会显示大纲。</p>}</aside>}<textarea ref={textarea} className="studio-source" value={content} onChange={event => { contentRef.current = event.target.value; setContent(event.target.value); }} onSelect={event => setCursorLine(event.currentTarget.value.slice(0, event.currentTarget.selectionStart).split('\n').length - 1)} spellCheck={false} aria-label="Markdown 研究正文" /><MarkdownPreview ref={preview} className="markdown-preview" markdown={content} /></div><footer className="studio-footer"><span>{content.replace(/\s/g, '').length.toLocaleString()} 字</span><span>Markdown</span><span>自动保存 · 失败时保留当前内容</span><span><kbd>⌘/Ctrl S</kbd> 保存　<kbd>⌘/Ctrl B</kbd> 加粗</span></footer><ResearchAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} document={document} /></div>;
}
