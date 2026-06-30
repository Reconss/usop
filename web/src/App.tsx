import React, { useState, Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// 懒加载所有页面 — 代码分割，减小首屏 bundle
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EventWorkspace = lazy(() => import('./pages/EventWorkspace'));
const SecurityAlerts = lazy(() => import('./pages/SecurityAlerts'));
const AssetInventory = lazy(() => import('./pages/AssetInventory'));
const ScanConsole = lazy(() => import('./pages/ScanConsole'));
const DetectionRules = lazy(() => import('./pages/DetectionRules'));
const Playbooks = lazy(() => import('./pages/Playbooks'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const ThreatHunting = lazy(() => import('./pages/ThreatHunting'));
const AICenter = lazy(() => import('./pages/AICenter'));
const DataIngestion = lazy(() => import('./pages/DataIngestion'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const GlobalConfig = lazy(() => import('./pages/GlobalConfig'));
const VulnerabilityManagement = lazy(() => import('./pages/VulnerabilityManagement'));
const VulnerabilityAssessment = lazy(() => import('./pages/VulnerabilityAssessment'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));

// 加载占位
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-sm text-text-muted">加载中...</span>
      </div>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
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
    <div className="flex h-screen bg-page-bg overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className="flex-1 overflow-auto p-6 scrollbar-thin">
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
              <Route path="/system/users" element={<UserManagement />} />
              <Route path="/system/audit" element={<AuditLogs />} />
              <Route path="/detection/hunting" element={<ThreatHunting />} />
              <Route path="/detection/ai" element={<AICenter />} />
              <Route path="/data/ingestion" element={<DataIngestion />} />
              <Route path="/system/roles" element={<RoleManagement />} />
              <Route path="/system/config" element={<GlobalConfig />} />
              <Route path="/vulnerabilities/host" element={<VulnerabilityManagement type="host" />} />
              <Route path="/vulnerabilities/application" element={<VulnerabilityManagement type="application" />} />
              <Route path="/vulnerabilities/assessment" element={<VulnerabilityAssessment />} />
              <Route path="/vulnerabilities" element={<Navigate to="/vulnerabilities/host" replace />} />
              <Route path="/system/notifications" element={<NotificationSettings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
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
