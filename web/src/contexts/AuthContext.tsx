import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: any;
  login: (token: string, userData: any) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

/** 判断当前用户是否拥有权限点（user.permissions 缺失时放行，兼容旧登录态；admin 恒通过） */
export const usePermission = () => {
  const { user } = useAuth();
  return (perm?: string): boolean => {
    if (!perm) return true;
    if (user?.role === 'admin') return true;
    const perms: string[] | undefined = user?.permissions;
    if (!perms) return true;
    return perms.includes(perm);
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // 启动时用原生 fetch 验证 token（不经过 request 函数，避免触发 auth:expired 事件）
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const verifyToken = async () => {
      const token = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      if (!token || !userData) {
        if (!cancelled) setAuthChecked(true);
        return;
      }
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            // /me 响应为 {success, data:{...user, permissions}}：先解包一层再与 localStorage 合并
            const payload = data.data || data;
            const stored = (() => { try { return JSON.parse(userData); } catch { return {}; } })();
            const base = { ...stored, ...payload };
            setUser({ ...base, permissions: payload.permissions || stored.permissions || [] });
            setIsAuthenticated(true);
          }
        } else if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.warn('Auth verification timed out');
        }
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      if (!cancelled) setAuthChecked(true);
    };
    verifyToken();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const login = useCallback((token: string, userData: any) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  // 监听 API 401 事件，平滑切换到登录页
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  // 未完成验证前不渲染任何内容，避免 Header 等组件发起带过期 token 的请求
  if (!authChecked) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
