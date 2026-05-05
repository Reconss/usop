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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // 启动时用原生 fetch 验证 token（不经过 request 函数，避免触发 auth:expired 事件）
  useEffect(() => {
    let cancelled = false;
    const verifyToken = async () => {
      const token = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      if (!token || !userData) {
        if (!cancelled) setAuthChecked(true);
        return;
      }
      try {
        // 直接用 fetch，不经过 request 函数
        const res = await fetch('/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          if (!cancelled) {
            setUser(JSON.parse(userData));
            setIsAuthenticated(true);
          }
        } else {
          // token 无效，清除
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        }
      } catch {
        // 网络错误也清除
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      if (!cancelled) setAuthChecked(true);
    };
    verifyToken();
    return () => { cancelled = true; };
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
