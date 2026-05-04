import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import EventWorkspace from './pages/EventWorkspace';
import SecurityAlerts from './pages/SecurityAlerts';
import AssetInventory from './pages/AssetInventory';
import ScanTasks from './pages/ScanTasks';
import DetectionRules from './pages/DetectionRules';
import Playbooks from './pages/Playbooks';
import UserManagement from './pages/UserManagement';
import AuditLogs from './pages/AuditLogs';
import ThreatHunting from './pages/ThreatHunting';
import AICenter from './pages/AICenter';
import DataIngestion from './pages/DataIngestion';
import RoleManagement from './pages/RoleManagement';
import GlobalConfig from './pages/GlobalConfig';
import VulnerabilityManagement from './pages/VulnerabilityManagement';
import VulnerabilityAssessment from './pages/VulnerabilityAssessment';
import Login from './pages/Login';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login onLogin={() => setIsAuthenticated(true)} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <div className="flex h-screen bg-page-bg overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />
          <main className="flex-1 overflow-auto p-6 scrollbar-thin">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/detection/events" element={<EventWorkspace />} />
              <Route path="/detection/investigation" element={<SecurityAlerts />} />
              <Route path="/assets/inventory" element={<AssetInventory />} />
              <Route path="/assets/scans" element={<ScanTasks />} />
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
              <Route path="/login" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
}

export default App;
