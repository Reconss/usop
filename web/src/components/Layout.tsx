import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
  sidebarCollapsed: boolean;
  onSidebarCollapse: (collapsed: boolean) => void;
  onLogout: () => void;
}

export default function Layout({ children, sidebarCollapsed, onSidebarCollapse, onLogout }: LayoutProps) {
  return (
    <div className="flex h-screen bg-page-bg overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onCollapse={onSidebarCollapse} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => onSidebarCollapse(!sidebarCollapsed)} onLogout={onLogout} />
        <main className="flex-1 overflow-auto p-6 scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
