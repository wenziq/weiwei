export function AsyncState({ loading, error, empty, children }: { loading: boolean; error: string | null; empty?: boolean; children: React.ReactNode }) {
  if (loading) return <div className="async-state"><span className="loading-spinner" />正在加载行情…</div>;
  if (error) return <div className="async-state error">{error}<small>请确认 FastAPI 服务已启动在 127.0.0.1:8000</small></div>;
  if (empty) return <div className="async-state">暂无符合条件的数据</div>;
  return children;
}
