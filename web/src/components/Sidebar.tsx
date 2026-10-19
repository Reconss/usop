import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import BrandMark from './BrandMark';
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
  Plug,
  FileText,
  List,
  Scan,
  Users,
  UserCog,
  ClipboardList,
  Sliders,
  Database,
  Filter,
  Scroll,
  ShieldAlert,
  AppWindow,
  Star
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path?: string;
  /** 访问所需权限点（缺省=登录即可见） */
  perm?: string;
  children?: MenuItem[];
}

/** 侧边栏菜单（单一事实来源：Header 面包屑与 PageHeader 均从这里派生语义）。perm 与角色权限点体系对齐 */
export const menuItems: MenuItem[] = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard, path: '/', perm: 'dashboard.view' },
  {
    id: 'detection',
    label: '检测与分析',
    icon: Shield,
    children: [
      { id: 'events', label: '工作台', icon: AlertTriangle, path: '/detection/events', perm: 'events.view' },
      { id: 'investigation', label: '安全告警', icon: FileSearch, path: '/detection/investigation', perm: 'alerts.view' },
      { id: 'hunting', label: '威胁狩猎', icon: Target, path: '/detection/hunting', perm: 'hunting.view' },
      { id: 'ai', label: 'AI中心', icon: Brain, path: '/detection/ai', perm: 'ai.view' },
    ]
  },
  {
    id: 'vulnerabilities',
    label: '漏洞管理',
    icon: ShieldAlert,
    children: [
      { id: 'host', label: '主机漏洞', icon: Server, path: '/vulnerabilities/host', perm: 'vulns.view' },
      { id: 'application', label: '应用漏洞', icon: AppWindow, path: '/vulnerabilities/application', perm: 'vulns.view' },
      { id: 'assessment', label: '评级配置', icon: Star, path: '/vulnerabilities/assessment', perm: 'vulns.manage' }
    ]
  },
  {
    id: 'response',
    label: '响应与自动化',
    icon: Zap,
    children: [
      { id: 'playbooks', label: '剧本编排', icon: Workflow, path: '/response/playbooks', perm: 'playbooks.view' },
      { id: 'integrations', label: '集成应用', icon: Plug, path: '/response/integrations', perm: 'playbooks.view' },
      { id: 'rules', label: '规则管理', icon: ScrollText, path: '/response/rules', perm: 'rules.view' }
    ]
  },
  {
    id: 'assets',
    label: '资产与攻击面',
    icon: Server,
    children: [
      { id: 'inventory', label: '资产清单', icon: List, path: '/assets/inventory', perm: 'assets.view' },
      { id: 'scans', label: '扫描任务', icon: Scan, path: '/assets/scans', perm: 'scans.view' }
    ]
  },
  {
    id: 'data',
    label: '数据管理',
    icon: Database,
    children: [
      { id: 'ingestion', label: '数据采集', icon: Scroll, path: '/data/ingestion', perm: 'data.view' },
      { id: 'alert-filters', label: '告警过滤', icon: Filter, path: '/data/alert-filters', perm: 'data.view' },
      { id: 'templates', label: '资源管理', icon: FileText, path: '/data/resources', perm: 'data.view' }
    ]
  },
  {
    id: 'system',
    label: '系统管理',
    icon: Settings,
    children: [
      { id: 'users', label: '用户管理', icon: Users, path: '/system/users', perm: 'users.view' },
      { id: 'roles', label: '角色权限', icon: UserCog, path: '/system/roles', perm: 'roles.view' },
      { id: 'audit', label: '审计日志', icon: ClipboardList, path: '/system/audit', perm: 'audit.view' },
      { id: 'config', label: '全局配置', icon: Sliders, path: '/system/config', perm: 'config.view' },
      { id: 'backup', label: '备份与还原', icon: Database, path: '/system/backup', perm: 'config.manage' }
    ]
  }
];

/** 按权限点过滤菜单：permissions 未加载/缺失时显示全部（兼容旧登录态） */
export const filterMenuByPermissions = (items: MenuItem[], permissions?: string[]): MenuItem[] => {
  if (!permissions) return items;
  const has = (perm?: string) => !perm || permissions.includes(perm);
  return items
    .map((item) => {
      if (item.children) {
        const children = item.children.filter((c) => has(c.perm));
        return children.length > 0 ? { ...item, children } : null;
      }
      return has(item.perm) ? item : null;
    })
    .filter((item): item is MenuItem => item !== null);
};

/** 角色标识 → 展示名（与用户管理角色体系对齐的常见值，未匹配到时原样展示） */
const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  analyst: '安全分析师',
  auditor: '审计员',
  viewer: '只读用户',
  operator: '运营人员',
};

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}

/** 当前路径所属的一级分组 id（用于自动展开） */
const groupOfPath = (pathname: string): string | null => {
  for (const group of menuItems) {
    if (group.path && (pathname === group.path || pathname.startsWith(group.path + '/'))) return group.id;
    for (const child of group.children || []) {
      if (child.path && (pathname === child.path || pathname.startsWith(child.path + '/'))) {
        return group.id;
      }
    }
  }
  return null;
};

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onCollapse }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const displayName = user?.username || user?.name || '未登录';
  const displayEmail = user?.email || '—';
  const roleLabel = ROLE_LABELS[user?.role] || user?.role || '用户';
  const avatarInitial = (displayName || 'U').charAt(0).toUpperCase();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['detection']);
  // 按角色权限点过滤菜单（user.permissions 缺失时显示全部，兼容旧登录态）
  const visibleMenuItems = useMemo(
    () => filterMenuByPermissions(menuItems, user?.permissions),
    [user?.permissions]
  );
  // 当前路径若无权访问（菜单被过滤），回落到第一个可见页面。
  // 注意豁免不在侧边栏菜单里的合法页面（/profile 个人中心）——否则从 Header/侧边栏
  // 用户区进入个人中心时，会被本守卫误判为「不可达路径」重定向回仪表盘。
  useEffect(() => {
    if (!user?.permissions) return;
    if (location.pathname === '/profile' || location.pathname.startsWith('/profile/')) return;
    const accessible = visibleMenuItems.some((g) =>
      g.path
        ? location.pathname === g.path || location.pathname.startsWith(g.path + '/')
        : (g.children || []).some(
            (c) => c.path && (location.pathname === c.path || location.pathname.startsWith(c.path + '/'))
          )
    );
    if (!accessible && visibleMenuItems.length > 0) {
      const first = visibleMenuItems[0];
      navigate(first.children?.[0]?.path || first.path || '/');
    }
  }, [location.pathname, user?.permissions, visibleMenuItems, navigate]);

  // 进入某页面时自动展开其所属分组（不收起用户已展开的其它分组）
  useEffect(() => {
    const gid = groupOfPath(location.pathname);
    if (gid) {
      setExpandedMenus((prev) => (prev.includes(gid) ? prev : [...prev, gid]));
    }
  }, [location.pathname]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus((prev) =>
      prev.includes(menuId) ? prev.filter((id) => id !== menuId) : [...prev, menuId]
    );
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const hasChildren = !!item.children && item.children.length > 0;
    const isExpanded = expandedMenus.includes(item.id);
    const active = isActive(item.path);
    const groupHasActiveChild =
      hasChildren && (item.children || []).some((c) => isActive(c.path));

    // 折叠态：一级分组以浮层弹出子项
    if (collapsed && level === 0 && hasChildren) {
      return (
        <div key={item.id} className="relative group">
          <button
            type="button"
            aria-label={item.label}
            title={item.label}
            className={`sidebar-item justify-center px-0 ${groupHasActiveChild ? 'active' : ''}`}
          >
            <item.icon size={18} />
          </button>
          <div className="invisible absolute left-full top-0 z-dropdown ml-3 min-w-[180px] rounded-card border border-border-color bg-card-bg p-1.5 opacity-0 shadow-panel transition-all duration-150 group-hover:visible group-hover:opacity-100">
            <div className="nav-group-label !px-3 !py-1.5">{item.label}</div>
            {item.children?.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => child.path && navigate(child.path)}
                className={`sidebar-item !gap-2.5 ${isActive(child.path) ? 'active' : ''}`}
              >
                <child.icon size={15} />
                <span className="truncate-1">{child.label}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={item.id}>
        <button
          type="button"
          onClick={() => {
            if (hasChildren) toggleMenu(item.id);
            else if (item.path) navigate(item.path);
          }}
          className={[
            'sidebar-item',
            active && !hasChildren ? 'active' : '',
            groupHasActiveChild && !isExpanded ? 'text-text-primary' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <item.icon size={17} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 truncate-1 text-left">{item.label}</span>
              {hasChildren && (
                <motion.span
                  animate={{ rotate: isExpanded ? 90 : 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center text-text-muted"
                >
                  <ChevronRight size={14} />
                </motion.span>
              )}
            </>
          )}
        </button>
        <AnimatePresence initial={false}>
          {hasChildren && isExpanded && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-0.5 space-y-0.5 border-l border-border-color pl-2 ml-4">
                {item.children?.map((child) => renderMenuItem(child, level + 1))}
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
      transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
      className="flex h-full shrink-0 flex-col border-r border-border-color bg-card-bg"
    >
      {/* 品牌区：高度与顶栏对齐 */}
      <div className="flex h-[56px] shrink-0 items-center gap-2 border-b border-border-color px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          <BrandMark size={27} variant="mark" />
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-w-0 flex-1"
          >
            <div className="truncate-1 text-[15px] font-semibold tracking-wide text-text-primary">
              USOP
            </div>
            <div className="truncate-1 text-[10px] leading-none text-text-muted">
              统一安全运营平台
            </div>
          </motion.div>
        )}
        <button
          type="button"
          onClick={() => onCollapse(!collapsed)}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className={`shrink-0 rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary ${
            collapsed ? 'mx-auto' : ''
          }`}
        >
          <Menu size={17} />
        </button>
      </div>

      {/* 导航 */}
      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {visibleMenuItems.map((item) => renderMenuItem(item))}
      </nav>

      {/* 当前用户：真实登录身份，点击进入个人中心 */}
      <div className="shrink-0 border-t border-border-color p-2.5">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          title={collapsed ? `${displayName} · ${displayEmail}` : '个人中心'}
          className={`flex w-full items-center gap-2.5 rounded-lg border border-border-color bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-border-color-hover hover:bg-card-bg-hover ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <span className="text-[12px] font-semibold text-white">{avatarInitial}</span>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2 bg-success" />
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate-1 text-[12.5px] font-medium text-text-primary">{displayName}</p>
                <span className="shrink-0 rounded bg-primary/15 px-1 py-px text-[9.5px] font-medium leading-none text-primary">
                  {roleLabel}
                </span>
              </div>
              <p className="truncate-1 text-[10.5px] text-text-muted">{displayEmail}</p>
            </div>
          )}
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
