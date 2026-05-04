import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import {
  Search,
  Bell,
  User,
  Settings,
  LogOut,
  Menu,
  Moon,
  Sun,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import { notifications } from '../data/mockData';

interface HeaderProps {
  onMenuClick: () => void;
}

const pageTitles: Record<string, string> = {
  '/': '仪表盘',
  '/detection/events': '事件工作台',
  '/detection/investigation': '安全告警',
  '/assets/inventory': '资产清单',
  '/assets/scans': '扫描任务',
  '/response/rules': '检测规则',
  '/response/playbooks': '响应剧本',
  '/system/users': '用户管理',
  '/system/audit': '审计日志',
  '/detection/hunting': '威胁狩猎',
  '/detection/ai': 'AI 分析中心',
  '/data/ingestion': '日志配置',
  '/data/formats': '数据格式',
  '/data/parsing': '解析规则'
};

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notificationRef = React.useRef<HTMLDivElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

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

  const currentPageTitle = pageTitles[location.pathname] || '仪表盘';

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newTheme ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', newTheme ? 'dark' : 'light');
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertTriangle className="w-4 h-4 text-critical" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-success" />;
      default: return <Info className="w-4 h-4 text-medium" />;
    }
  };

  return (
    <header className="h-14 bg-card-bg/80 backdrop-blur-md border-b border-border-color flex items-center justify-between px-4 shrink-0 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="text-primary font-semibold">USOP</span>
          <span>/</span>
          <span>{currentPageTitle}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="全局搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 pl-9 pr-4 py-2 bg-page-bg border border-border-color rounded-input text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-primary/10 transition-colors text-text-secondary hover:text-text-primary"
        >
          {isDark ? <Moon className="w-5 h-5 text-text-secondary" /> : <Sun className="w-5 h-5 text-text-secondary" />}
        </button>

        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-lg hover:bg-primary/10 transition-colors relative text-text-secondary hover:text-text-primary"
          >
            <Bell className="w-5 h-5 text-text-secondary" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-critical rounded-full text-xs flex items-center justify-center text-white">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 top-full mt-2 w-80 bg-card-bg border border-border-color rounded-card shadow-card-hover z-50"
              >
                <div className="p-3 border-b border-border-color bg-card-bg/50">
                  <span className="text-sm font-medium text-text-primary">通知中心</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.map((n) => (
                    <div key={n.id} className="p-3 hover:bg-primary/5 cursor-pointer border-b border-border-color/50 last:border-0 transition-colors">
                      <div className="flex items-start gap-3">
                        {getNotificationIcon(n.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">{n.title}</p>
                          <p className="text-xs text-text-muted mt-1">{n.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-primary/10 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-text-primary hidden lg:block">管理员</span>
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 top-full mt-2 w-48 bg-card-bg border border-border-color rounded-card shadow-card-hover z-50"
              >
                <div className="p-2">
                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary/5 text-sm text-text-primary transition-colors">
                    <User className="w-4 h-4" />
                    个人中心
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary/5 text-sm text-text-primary transition-colors">
                    <Settings className="w-4 h-4" />
                    系统设置
                  </button>
                  <div className="border-t border-border-color my-2" />
                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-critical/10 text-sm text-critical transition-colors">
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};

export default Header;
