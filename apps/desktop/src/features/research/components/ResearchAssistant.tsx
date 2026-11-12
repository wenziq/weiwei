import { useEffect, useRef, useState } from 'react';
import { Bot, Check, LoaderCircle, Send, Settings, Sparkles, Trash2 } from 'lucide-react';
import type { AIStatus, ResearchDocument } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePersistentState } from '@/lib/usePersistentState';
import { Modal } from '@/components/ui/Modal';
import { MarkdownPreview } from './MarkdownPreview';

interface ConversationMessage { role: 'user' | 'assistant'; content: string }
interface AIReply { reply: string; provider: string; model: string }

export function ResearchAssistant({ open, onClose, document }: { open: boolean; onClose: () => void; document: ResearchDocument }) {
  const { data: status, refresh: refreshStatus } = useApi<AIStatus>(open ? '/ai/status' : null, [open]);
  useEffect(() => {
    const changed = () => { if (open) refreshStatus(); };
    window.addEventListener('weiwei-ai-config-changed', changed);
    return () => window.removeEventListener('weiwei-ai-config-changed', changed);
  }, [open, refreshStatus]);
  const [conversations, setConversations] = usePersistentState<Record<string, ConversationMessage[]>>('weiwei-research-conversations', {});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const messages = conversations[document.instrumentId] ?? [];
  const send = async (text = input, retry = false) => {
    const message = text.trim();
    if (!message || busy || !status?.configured) return;
    const history = retry ? messages.slice(-8) : [...messages, { role: 'user' as const, content: message }].slice(-8);
    if (!retry) setConversations(current => ({ ...current, [document.instrumentId]: [...(current[document.instrumentId] ?? []), { role: 'user', content: message }] }));
    setInput(''); setBusy(true); setError(null);
    try {
      const result = await api.post<AIReply, { message: string; history: ConversationMessage[] }>(`/ai/chat/${document.instrumentId}`, { message, history: retry ? messages.slice(0, -1).slice(-8) : history });
      setConversations(current => ({ ...current, [document.instrumentId]: [...(current[document.instrumentId] ?? []), { role: 'assistant', content: result.reply }] }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '研究对话暂时失败，请稍后重试'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (open) { setError(null); setConfirmClear(false); bottom.current?.scrollIntoView({ block: 'nearest' }); } }, [open, document.instrumentId, messages.length]);
  return <Modal open={open} onClose={onClose} title={`${document.title.replace(' · 研究档案', '')} · AI 研究对话`} className="wide research-assistant-dialog">
    <div className="assistant-context"><Sparkles size={16} /><span>围绕 <strong>{document.title.replace(' · 研究档案', '')}</strong> 研究，发送时会附带当前研究正文，供所选 AI 服务处理。</span><span className="soft-badge">{status ? status.configured ? `${status.provider} · ${status.model}` : '尚未配置' : '正在检查配置'}</span></div>
    {!status?.configured ? <div className="assistant-empty"><Bot size={30} /><h3>{status ? '先连接你的 AI 服务' : '正在检查 AI 配置…'}</h3><p>支持 OpenAI 兼容接口。密钥保存在系统钥匙串或服务端环境变量中，不会进入对话记录。</p>{status && <button className="button primary" onClick={() => window.dispatchEvent(new CustomEvent('weiwei-open-settings', { detail: 'connections' }))}><Settings size={15} />打开连接与 AI 设置</button>}</div> : <>
      <div className="assistant-messages" aria-live="polite">{messages.map((message, index) => <article key={index} className={`assistant-message ${message.role}`}><header>{message.role === 'user' ? '我' : <><Bot size={14} />{status.model}</>}</header>{message.role === 'assistant' ? <MarkdownPreview markdown={message.content} /> : <p>{message.content}</p>}</article>)}
        {!messages.length && <div className="assistant-empty"><Bot size={30} /><h3>从你的研究资料开始</h3><p>可以核对逻辑、整理待验证问题，不会让 AI 替代你的研究结论。</p><div className="assistant-suggestions">{['这份研究有哪些需要进一步验证的假设？', '把研究正文整理成一份复查清单', '分析这份研究逻辑可能的反面证据'].map(text => <button key={text} onClick={() => void send(text)}>{text}</button>)}</div></div>}
        {busy && <div className="assistant-thinking"><LoaderCircle size={16} className="spin" />AI 正在阅读当前研究档案…</div>}<div ref={bottom} />
      </div>
      {error && <div className="assistant-error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { const question = [...messages].reverse().find(item => item.role === 'user')?.content ?? ''; void send(question, true); }}>重试</button></div>}
      <div className="assistant-compose"><textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="输入研究问题，Enter 发送，Shift + Enter 换行" aria-label="研究问题" rows={3} disabled={busy} /><div><span>AI 输出可能有误，请核对事实与数据来源。</span><button className="button primary" disabled={!input.trim() || busy} onClick={() => void send()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}{busy ? '正在回答…' : '发送'}</button></div></div>
      {messages.length > 0 && <div className="assistant-history-actions">{confirmClear ? <><span>仅清空这只股票保存在本机的对话，不影响研究正文。</span><button className="button compact ghost" onClick={() => setConfirmClear(false)}>取消</button><button className="button compact danger" onClick={() => { setConversations(current => ({ ...current, [document.instrumentId]: [] })); setConfirmClear(false); }}><Check size={13} />确认清空</button></> : <button className="text-button" onClick={() => setConfirmClear(true)}><Trash2 size={13} />清空本机对话</button>}</div>}
    </>}
  </Modal>;
}
