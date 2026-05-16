import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Shield,
  Zap,
  Server,
  Settings,
  ChevronRight,
  Menu,
  AlertTriangle,
  FileSearch,
  Target,
  Brain,
  Workflow,
  ScrollText,
  List,
  Scan,
  Cpu,
  Users,
  UserCog,
  ClipboardList,
  Sliders,
  Database,
  FileJson,
  Scroll,
  Bug,
  ShieldAlert,
  AppWindow,
  Star
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  children?: MenuItem[];
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard, path: '/' },
  {
    id: 'detection',
    label: '检测与分析',
    icon: Shield,
    children: [
      { id: 'events', label: '工作台', icon: AlertTriangle, path: '/detection/events' },
      { id: 'investigation', label: '安全告警', icon: FileSearch, path: '/detection/investigation' },
      { id: 'hunting', label: '威胁狩猎', icon: Target, path: '/detection/hunting' },
      { id: 'ai', label: 'AI中心', icon: Brain, path: '/detection/ai' }
    ]
  },
  {
    id: 'vulnerabilities',
    label: '漏洞管理',
    icon: ShieldAlert,
    children: [
      { id: 'host', label: '主机漏洞', icon: Server, path: '/vulnerabilities/host' },
      { id: 'application', label: '应用漏洞', icon: AppWindow, path: '/vulnerabilities/application' },
      { id: 'assessment', label: '评级配置', icon: Star, path: '/vulnerabilities/assessment' }
    ]
  },
  {
    id: 'response',
    label: '响应与自动化',
    icon: Zap,
    children: [
      { id: 'playbooks', label: '剧本编排', icon: Workflow, path: '/response/playbooks' },
      { id: 'rules', label: '规则管理', icon: ScrollText, path: '/response/rules' }
    ]
  },
  {
    id: 'assets',
    label: '资产与攻击面',
    icon: Server,
    children: [
      { id: 'inventory', label: '资产清单', icon: List, path: '/assets/inventory' },
      { id: 'scans', label: '扫描任务', icon: Scan, path: '/assets/scans' }
    ]
  },
  {
    id: 'data',
    label: '数据管理',
    icon: Database,
    children: [
      { id: 'ingestion', label: '日志配置', icon: Scroll, path: '/data/ingestion' }
    ]
  },
  {
    id: 'system',
    label: '系统管理',
    icon: Settings,
    children: [
      { id: 'users', label: '用户管理', icon: Users, path: '/system/users' },
      { id: 'roles', label: '角色权限', icon: UserCog, path: '/system/roles' },
      { id: 'audit', label: '审计日志', icon: ClipboardList, path: '/system/audit' },
      { id: 'config', label: '全局配置', icon: Sliders, path: '/system/config' }
    ]
  }
];

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onCollapse }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['detection']);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev =>
      prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]
    );
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.includes(item.id);
    const active = isActive(item.path);

    if (collapsed && level === 0 && hasChildren) {
      return (
        <div key={item.id} className="relative group">
          <button
            className={`w-full flex items-center justify-center p-3 rounded-lg transition-all duration-200 ${
              active ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:bg-primary/5 hover:text-text-primary'
            }`}
          >
            <item.icon size={20} />
          </button>
          <div className="absolute left-full top-0 ml-2 bg-card-bg border border-border-color rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 min-w-[160px]">
            <div className="p-2">
              <div className="px-3 py-2 text-text-secondary text-xs font-medium border-b border-border-color mb-1">
                {item.label}
              </div>
              {item.children?.map(child => (
                <button
                  key={child.id}
                  onClick={() => child.path && navigate(child.path)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive(child.path) ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:bg-primary/5 hover:text-text-primary'
                  }`}
                >
                  <child.icon size={14} />
                  {child.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleMenu(item.id);
            } else if (item.path) {
              navigate(item.path);
            }
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
            active ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:bg-primary/5 hover:text-text-primary'
          } ${level > 0 ? 'ml-4' : ''}`}
        >
          <item.icon size={18} />
          {!collapsed && (
            <>
              <span className="flex-1 text-sm font-medium text-left">{item.label}</span>
              {hasChildren && (
                <motion.div
                  animate={{ rotate: isExpanded ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight size={14} />
                </motion.div>
              )}
            </>
          )}
        </button>
        <AnimatePresence>
          {hasChildren && isExpanded && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-1 space-y-0.5">
                {item.children?.map(child => renderMenuItem(child, level + 1))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="bg-card-bg border-r border-border-color flex flex-col h-full"
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-border-color">
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center shadow-glow">
              <Shield className="text-white" size={18} />
            </div>
            <span className="text-lg font-semibold text-text-primary">USOP</span>
          </motion.div>
        )}
        <button
          onClick={() => onCollapse(!collapsed)}
          className="p-2 rounded-lg text-text-secondary hover:bg-card-bg hover:text-text-primary transition-colors"
        >
          <Menu size={18} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
        {menuItems.map(item => renderMenuItem(item))}
      </nav>
      <div className="p-3 border-t border-border-color">
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-card-bg/50 border border-border-color/50 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-white text-sm font-medium">A</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">Admin</p>
              <p className="text-xs text-text-muted truncate">admin@usop.com</p>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
