import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Sparkles } from 'lucide-react';
import type { AIStatus } from '@weiwei/contracts';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useApp } from '@/app/providers/AppProviders';

const providers = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'moonshot', name: 'Moonshot（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.5' },
  { id: 'custom', name: '自定义 OpenAI 兼容服务', baseUrl: '', model: '' },
];

export function AISettings({ open }: { open: boolean }) {
  const { data, refresh } = useApi<AIStatus>(open ? '/ai/status' : null, [open]);
  const [provider, setProvider] = useState('openai');
  const [baseUrl, setBaseUrl] = useState(providers[0]!.baseUrl);
  const [model, setModel] = useState(providers[0]!.model);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useApp();
  useEffect(() => { if (data && open) { setProvider(data.provider); setBaseUrl(data.baseUrl); setModel(data.model); } }, [data, open]);
  const changeProvider = (next: string) => {
    const option = providers.find(item => item.id === next)!;
    setProvider(next);
    if (next !== 'custom') { setBaseUrl(option.baseUrl); setModel(option.model); }
  };
  const save = async () => {
    if (!data?.configured && !key.trim()) { setError('首次配置请输入 AI API Key'); return false; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await api.post<AIStatus, { provider: string; baseUrl: string; model: string; apiKey?: string }>('/ai/config', { provider, baseUrl, model, apiKey: key.trim() || undefined });
      setKey('');
      window.dispatchEvent(new Event('weiwei-ai-config-changed'));
      setMessage('配置已保存；密钥由系统钥匙串或服务端环境变量保管');
      refresh();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'AI 配置保存失败'); return false; }
    finally { setBusy(false); }
  };
  const test = async () => {
    if (!await save()) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await api.post<{ reply: string }, Record<string, never>>('/ai/test', {});
      setMessage(`连接成功 · ${result.reply}`);
      notify('AI 服务连接测试通过');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'AI 连接测试失败'); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true); setError(null);
    try { await api.delete('/ai/key'); setKey(''); setMessage('已清除当前提供商的密钥'); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '清除密钥失败'); }
    finally { setBusy(false); }
  };
  return <section className="settings-section"><h3><Sparkles size={17} />AI 研究服务</h3><p className="dialog-subtitle">用于研究库对话和条件选股解析。支持 OpenAI 兼容接口；AI 输出需要自行核对，不是投资建议。</p><div className="form-grid"><label>提供商<select value={provider} onChange={event => changeProvider(event.target.value)}>{providers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>模型<input value={model} onChange={event => setModel(event.target.value)} placeholder="例如 gpt-4.1-mini" /></label><label className="full">API 地址<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} spellCheck={false} placeholder="https://api.example.com/v1" /></label><label className="full">API Key<div className="secret-input"><input type={showKey ? 'text' : 'password'} value={key} onChange={event => setKey(event.target.value)} placeholder={data?.configured ? '已配置；留空则不修改' : '输入你的 AI API Key'} autoComplete="new-password" /><button className="icon-button" title={showKey ? '隐藏密钥' : '显示密钥'} aria-label={showKey ? '隐藏密钥' : '显示密钥'} onClick={() => setShowKey(value => !value)}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></label></div><div className="settings-actions"><button className="button ghost" disabled={busy || !data} onClick={() => void save()}><KeyRound size={15} />{busy ? '正在保存…' : '保存 AI 配置'}</button><button className="button primary" disabled={busy || !data} onClick={() => void test()}>保存并测试连接</button>{data?.configured && <button className="text-button" disabled={busy} onClick={() => void clear()}>清除当前密钥</button>}</div>{message && <p className="settings-success">{message}</p>}{error && <p className="history-error" role="alert">{error}</p>}<p className="history-footnote">密钥不会写入研究 JSON、localStorage 或日志。只有在你主动测试或发起 AI 对话时才会发送给所选提供商；研究对话会明确包含当前研究资料。</p></section>;
}
