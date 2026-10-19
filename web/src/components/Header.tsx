import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  User,
  LogOut,
  Moon,
  Sun,
  CheckCircle,
  AlertTriangle,
  Info,
  Loader2,
  Shield,
  X,
  Check,
  Menu
} from 'lucide-react';
import { authApi, notificationsApi } from '../services/api';
import { menuItems } from './Sidebar';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at?: string;
  data?: Record<string, any>;
}

interface HeaderProps {
  onMenuClick: () => void;
}

// 面包屑标题从 Sidebar.menuItems 派生（单一事实来源），此处仅补充不进菜单的路径
const extraPageTitles: Record<string, string> = {
  '/system/notifications': '通知设置',
  '/data/templates': '资源管理',   // 旧路径兼容
  '/profile': '个人中心'
};

const flatPageTitles: Record<string, [string, string]> = (() => {
  const map: Record<string, [string, string]> = {};
  for (const group of menuItems) {
    if (group.path) {
      map[group.path] = ['', group.label];
      continue;
    }
    for (const item of group.children || []) {
      if (item.path) map[item.path] = [group.label, item.label];
    }
  }
  return map;
})();

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  // 后端可用性标记：连续失败后暂停通知轮询，避免刷屏报错
  const backendUnavailableRef = React.useRef(false);
  const consecutiveErrorsRef = React.useRef(0);
  const [notifyInterval, setNotifyInterval] = useState<number | null>(60000);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 获取通知列表
  const fetchNotifications = async (isRetry = false) => {
    // 后端已确认不可用时，跳过请求（除非是手动重试）
    if (backendUnavailableRef.current && !isRetry) return;

    try {
      setLoadingNotifications(true);
      const res = await notificationsApi.getNotifications({ limit: 50 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        // 后端 to_dict 字段：title / message / type / read / data —— 无需再映射
        setNotifications(items);
      }
      // 成功后重置错误计数
      consecutiveErrorsRef.current = 0;
      backendUnavailableRef.current = false;
      if (notifyInterval !== 60000) setNotifyInterval(60000);
    } catch (error: any) {
      consecutiveErrorsRef.current += 1;
      // 仅首次和每第 10 次打印日志，避免刷屏
      if (consecutiveErrorsRef.current <= 1 || consecutiveErrorsRef.current % 10 === 0) {
        console.warn(`[通知服务] 后端不可用 (${consecutiveErrorsRef.current}次)，将自动降级`);
      }
      setNotifications([]);
      // 连续 3 次失败后暂停轮询（60 秒后自动尝试恢复）
      if (consecutiveErrorsRef.current >= 3) {
        backendUnavailableRef.current = true;
        setNotifyInterval(null); // 停止定时器
        setTimeout(() => {
          backendUnavailableRef.current = false;
          consecutiveErrorsRef.current = 0;
          setNotifyInterval(60000);
          fetchNotifications(true); // 尝试恢复
        }, 60000);
      }
    } finally {
      setLoadingNotifications(false);
    }
  };

  // 初始加载和定时刷新通知
  useEffect(() => {
    fetchNotifications();
    if (notifyInterval) {
      const interval = setInterval(() => fetchNotifications(), notifyInterval);
      return () => clearInterval(interval);
    }
  }, [notifyInterval]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleProfile = () => {
    setShowUserMenu(false);
    navigate('/profile');
  };

  const handleMarkAsRead = async (id: string | number) => {
    try {
      await notificationsApi.markAsRead(String(id));
      setNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, read: true } : n
      ));
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  };

  // 全部已读：请求成功后本地乐观置为已读，并给出结果反馈
  const handleMarkAllAsRead = async () => {
    if (markingAll) return;
    try {
      setMarkingAll(true);
      const res = await notificationsApi.markAllAsRead();
      if (res && res.success === false) {
        showToast(res.error || '操作失败，请重试', 'error');
        return;
      }
      setNotifications(prev => prev.map(n => (n.read ? n : { ...n, read: true })));
      showToast('已全部标记为已读');
    } catch (error: any) {
      console.error('全部标记已读失败:', error);
      showToast(error?.message || '操作失败，请重试', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  // 处理审批操作
  const handleApproval = async (approvalId: string, approved: boolean) => {
    try {
      await notificationsApi.processApproval(approvalId, approved);
      showToast(approved ? '审批已批准' : '审批已拒绝');
      // 刷新通知
      fetchNotifications();
    } catch (error) {
      console.error('审批操作失败:', error);
      showToast('审批操作失败，请重试', 'error');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ||
             document.documentElement.getAttribute('data-theme') === 'dark' ||
             !document.documentElement.classList.contains('light');
    }
    return true;
  });
  const [searchQuery, setSearchQuery] = useState('');

  const [parentTitle, currentPageTitle] =
    flatPageTitles[location.pathname]
    || (extraPageTitles[location.pathname]
      ? (['', extraPageTitles[location.pathname]] as [string, string])
      : (['', '仪表盘'] as [string, string]));

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newTheme ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', newTheme ? 'dark' : 'light');
      try {
        localStorage.setItem('usop-theme', newTheme ? 'dark' : 'light');
      } catch {
        /* 隐私模式下忽略 */
      }
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertTriangle className="w-4 h-4 text-danger" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-success" />;
      case 'approval_request': return <Shield className="w-4 h-4 text-warning" />;
      case 'approval_result': return <CheckCircle className="w-4 h-4 text-success" />;
      default: return <Info className="w-4 h-4 text-info" />;
    }
  };

  return (
    <header className="sticky top-0 z-topbar flex h-[56px] shrink-0 items-center justify-between gap-4 border-b border-border-color bg-card-bg/80 px-4 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="折叠或展开侧边栏"
          title="折叠或展开侧边栏"
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary lg:hidden"
        >
          <Menu size={17} />
        </button>

        <nav aria-label="当前位置" className="flex min-w-0 items-center gap-2 text-[12px]">
          <span className="font-semibold text-primary">USOP</span>
          {parentTitle && (
            <>
              <span className="text-text-muted">/</span>
              <span className="truncate-1 text-text-muted">{parentTitle}</span>
            </>
          )}
          <span className="text-text-muted">/</span>
          <span className="truncate-1 font-medium text-text-primary">{currentPageTitle}</span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative hidden md:block">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            aria-label="全局搜索"
            placeholder="全局搜索…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="app-input w-56 pl-8 lg:w-64"
          />
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? '切换到浅色主题' : '切换到深色主题'}
          aria-label={isDark ? '切换到浅色主题' : '切换到深色主题'}
          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
        >
          {isDark ? <Moon size={17} /> : <Sun size={17} />}
        </button>

        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="通知中心"
            className="relative rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 top-full z-dropdown mt-2 w-[340px] overflow-hidden rounded-card border border-border-color bg-card-bg shadow-panel"
              >
                <div className="flex items-center justify-between border-b border-border-color bg-surface-2 px-4 py-2.5">
                  <span className="text-[13px] font-semibold text-text-primary">通知中心</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      disabled={markingAll}
                      className="text-[11px] text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                    >
                      {markingAll ? '处理中…' : '全部已读'}
                    </button>
                  )}
                </div>
                <div className="scrollbar-thin max-h-96 overflow-y-auto">
                  {loadingNotifications ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-text-muted">暂无通知</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`cursor-pointer border-b border-border-color px-4 py-3 transition-colors last:border-0 hover:bg-surface-2 ${
                          !n.read ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3" onClick={() => handleMarkAsRead(n.id)}>
                          {getNotificationIcon(n.type)}
                          <div className="min-w-0 flex-1">
                            <p className="truncate-1 text-[13px] text-text-primary">{n.title}</p>
                            <p className="mt-0.5 truncate-2 text-[11px] text-text-muted">{n.message}</p>
                          </div>
                          {!n.read && <span className="status-dot primary mt-1.5" />}
                        </div>
                        {/* 审批操作按钮 */}
                        {n.type === 'approval_request' && n.data && n.data.approval_id && (
                          <div className="ml-7 mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleApproval(String(n.data!.approval_id), true); }}
                              className="app-btn app-btn-sm app-btn-primary"
                            >
                              <Check size={12} /> 批准
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleApproval(String(n.data!.approval_id), false); }}
                              className="app-btn app-btn-sm app-btn-danger-ghost"
                            >
                              <X size={12} /> 拒绝
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-surface-3"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
              <User className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="hidden text-[12.5px] text-text-primary lg:block">管理员</span>
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.16 }}
                className="absolute right-0 top-full z-dropdown mt-2 w-48 overflow-hidden rounded-card border border-border-color bg-card-bg p-1.5 shadow-panel"
              >
                <button
                  type="button"
                  onClick={handleProfile}
                  className="sidebar-item !py-2"
                >
                  <User size={15} />
                  <span>个人中心</span>
                </button>
                <div className="my-1 h-px bg-border-color" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="sidebar-item !py-2 text-danger hover:!bg-danger/10 hover:!text-danger"
                >
                  <LogOut size={15} />
                  <span>退出登录</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Toast 提示 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`fixed right-4 top-16 z-toast flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px] shadow-panel ${
              toast.type === 'success'
                ? 'border-success/30 bg-card-bg text-success'
                : 'border-danger/30 bg-card-bg text-danger'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
