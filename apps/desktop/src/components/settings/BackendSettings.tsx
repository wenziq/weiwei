import { useEffect, useState } from 'react';
import { Check, PlugZap } from 'lucide-react';
import { API_STORAGE_KEY, env } from '@/config/env';
import { useApp } from '@/app/providers/AppProviders';

export function BackendSettings({ open }: { open: boolean }) {
  const [value, setValue] = useState(env.apiBaseUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useApp();
  useEffect(() => { if (open) { setValue(env.apiBaseUrl); setMessage(null); setError(null); } }, [open]);
  const connect = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入有效的 HTTP(S) 后端地址，不能包含账号、密码或查询参数');
      if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('远程后端请使用 HTTPS；本机开发可使用 HTTP');
      const normalized = url.toString().replace(/\/$/, '');
      const response = await fetch(`${normalized}/health`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`后端返回 ${response.status}，请检查地址是否包含 /api/v1`);
      const health = await response.json();
      if (health.status !== 'ok') throw new Error('返回内容不是危微行情服务');
      localStorage.setItem(API_STORAGE_KEY, normalized);
      setValue(normalized);
      setMessage(`连接正常 · ${health.provider}`);
      notify('后端地址已保存，后续请求将使用新地址');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '连接失败，请检查地址和服务状态');
    } finally { setBusy(false); }
  };
  return <section className="settings-section"><h3>后端连接</h3><p className="dialog-subtitle">前后端分离部署时，这里填写行情与个人数据服务的 API 地址，例如 http://127.0.0.1:8000/api/v1。</p><label className="settings-field">API 地址<input type="url" value={value} onChange={event => setValue(event.target.value)} spellCheck={false} /></label><div className="settings-actions"><button className="button primary" disabled={busy} onClick={() => void connect()}><PlugZap size={15} />{busy ? '正在测试连接…' : '保存并测试连接'}</button>{message && <span className="settings-success"><Check size={14} />{message}</span>}</div>{error && <p className="history-error" role="alert">{error}</p>}<p className="history-footnote">远程部署请使用 HTTPS，并在服务端配置允许的前端来源（CORS）。不要把 API Key 放在后端地址里，也不要将无访问控制的个人服务直接暴露到公网。</p></section>;
}
