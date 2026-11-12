import { Component, ErrorInfo, ReactNode } from 'react';

interface State { error: Error | null }
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('危微页面运行错误', error, info); }
  render() {
    if (this.state.error) return <div className="fatal-error"><h1>页面暂时无法显示</h1><p>{this.state.error.message}</p><pre>{this.state.error.stack}</pre><button className="button primary" onClick={() => this.setState({ error: null })}>重试</button></div>;
    return this.props.children;
  }
}
