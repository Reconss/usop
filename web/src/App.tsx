import React, { useState, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary from './components/ErrorBoundary';

// 懒加载所有页面 — 代码分割，减小首屏 bundle
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EventWorkspace = lazy(() => import('./pages/EventWorkspace'));
const SecurityAlerts = lazy(() => import('./pages/SecurityAlerts'));
const AssetInventory = lazy(() => import('./pages/AssetInventory'));
const ScanConsole = lazy(() => import('./pages/ScanConsole'));
const DetectionRules = lazy(() => import('./pages/DetectionRules'));
const Playbooks = lazy(() => import('./pages/Playbooks'));
const BlockedIps = lazy(() => import('./pages/BlockedIps'));
const Integrations = lazy(() => import('./pages/Integrations'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const ThreatHunting = lazy(() => import('./pages/ThreatHunting'));
const AICenter = lazy(() => import('./pages/AICenter'));
const DataIngestion = lazy(() => import('./pages/DataIngestion'));
const AlertFilters = lazy(() => import('./pages/AlertFilters'));
const ResourceCenter = lazy(() => import('./pages/ResourceCenter'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const GlobalConfig = lazy(() => import('./pages/GlobalConfig'));
const VulnerabilityManagement = lazy(() => import('./pages/VulnerabilityManagement'));
const VulnerabilityAssessment = lazy(() => import('./pages/VulnerabilityAssessment'));
const SystemBackup = lazy(() => import('./pages/SystemBackup'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));

// 加载占位
function PageLoader() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="spinner spinner-lg" />
        <span className="text-label text-text-muted">加载中…</span>
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page-bg">
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
        {/* 页面内边距由各页面的 .app-page 容器统一提供，这里不再叠加 */}
        <main className="scrollbar-thin flex-1 overflow-auto">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
              <Route path="/detection/events" element={<EventWorkspace />} />
              <Route path="/detection/investigation" element={<SecurityAlerts />} />
              <Route path="/detection/alerts" element={<Navigate to="/detection/investigation" replace />} />
              <Route path="/assets/inventory" element={<AssetInventory />} />
              <Route path="/assets/scans" element={<ScanConsole />} />
              <Route path="/response/rules" element={<DetectionRules />} />
              <Route path="/response/playbooks" element={<Playbooks />} />
              <Route path="/response/blocked-ips" element={<BlockedIps />} />
              <Route path="/response/integrations" element={<Integrations />} />
              <Route path="/system/users" element={<UserManagement />} />
              <Route path="/system/audit" element={<AuditLogs />} />
              <Route path="/detection/hunting" element={<ThreatHunting />} />
              <Route path="/detection/ai" element={<AICenter />} />
              <Route path="/data/ingestion" element={<DataIngestion />} />
              <Route path="/data/alert-filters" element={<AlertFilters />} />
              <Route path="/data/resources" element={<ResourceCenter />} />
              <Route path="/data/templates" element={<ResourceCenter />} />
              <Route path="/system/roles" element={<RoleManagement />} />
              <Route path="/system/config" element={<GlobalConfig />} />
              <Route path="/vulnerabilities/host" element={<VulnerabilityManagement type="host" />} />
              <Route path="/vulnerabilities/application" element={<VulnerabilityManagement type="application" />} />
              <Route path="/vulnerabilities/assessment" element={<VulnerabilityAssessment />} />
              <Route path="/vulnerabilities" element={<Navigate to="/vulnerabilities/host" replace />} />
              {/* IP 黑白名单已并入资源管理（旧路径兼容跳转） */}
              <Route path="/response/ip-lists" element={<Navigate to="/data/resources" replace />} />
              {/* AI 研判 / 告警协作已并入安全告警工作台（旧路径兼容跳转） */}
              <Route path="/detection/ai-judgment" element={<Navigate to="/detection/investigation" replace />} />
              <Route path="/detection/collaboration" element={<Navigate to="/detection/investigation" replace />} />
              {/* 运营总览已下线（旧路径兼容跳转到仪表盘） */}
              <Route path="/operations/kpi" element={<Navigate to="/" replace />} />
              <Route path="/operations/*" element={<Navigate to="/" replace />} />
              <Route path="/system/backup" element={<SystemBackup />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </HashRouter>
  );
}

export default App;
