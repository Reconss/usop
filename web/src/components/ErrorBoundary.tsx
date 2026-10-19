import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** 变化时自动重置错误态（例如路由切换） */
  resetKey?: string;
}

interface State {
  error: Error | null;
  info: string;
}

/**
 * 页面级错误边界。
 *
 * 之前整个应用没有任何 ErrorBoundary —— React 18 遇到渲染期异常会直接卸载
 * 整棵组件树，表现就是「侧边栏、顶栏、内容区全部消失，页面纯白」。规则管理页
 * 就因为一条脏数据（data_source_ids 被存成 JSON 字符串）调 `.filter()` 抛错，
 * 让整站看起来像挂了。
 *
 * 现在把边界收敛到内容区：单个页面崩溃只显示错误卡片，导航和其它页面照常可用。
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ info: errorInfo.componentStack || '' });
    // 保留控制台堆栈，便于排查
    console.error('[ErrorBoundary] 页面渲染失败:', error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: '' });
    }
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex items-start justify-center pt-16">
        <div className="glass-card rounded-card p-6 max-w-2xl w-full border border-danger/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-danger" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-text-primary">页面渲染出错</h2>
              <p className="text-sm text-text-secondary mt-1">
                该模块因数据或代码异常未能渲染，其它功能不受影响。可切换菜单后重新进入，或点击下方重试。
              </p>

              <div className="mt-4 rounded-lg bg-[rgb(4_8_20_/_20%)] p-3 overflow-auto max-h-48">
                <p className="text-xs font-mono text-danger break-all">
                  {error.name}: {error.message}
                </p>
                {info && (
                  <pre className="text-[11px] font-mono text-text-muted mt-2 whitespace-pre-wrap">
                    {info.split('\n').slice(0, 8).join('\n')}
                  </pre>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => this.setState({ error: null, info: '' })}
                  className="px-3 py-1.5 text-xs bg-primary-solid text-white rounded-lg hover:bg-primary-solid-hover flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3" />重试
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 text-xs bg-white/10 text-text-primary rounded-lg hover:bg-white/20"
                >
                  重新加载页面
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
