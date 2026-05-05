import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Server, Workflow, FileText, Code, Database,
  ArrowRight, Layers, GitBranch, FileJson, HardDrive
} from 'lucide-react';
import { request } from '../services/api';

interface LogConfigSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  dataSourceCount?: number;
}

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  count: number;
  desc: string;
}

const menuItems: MenuItem[] = [
  { id: 'sources', label: '数据源管理', icon: Server, count: 0, desc: '配置接入方式和解析规则' },
  { id: 'parsing', label: '智能解析', icon: Workflow, count: 0, desc: '定义解析规则和字段映射' },
  { id: 'logtypes', label: '日志类型', icon: FileText, count: 0, desc: '定义日志分类标准' },
  { id: 'templates', label: '格式模板', icon: Code, count: 0, desc: '定义解析格式规则' },
  { id: 'storage', label: '存储配置', icon: Database, count: 0, desc: '配置日志存储设置' },
];

const flowNodes = [
  { id: 'sources', label: '数据源', icon: Layers },
  { id: 'parsing', label: '解析', icon: GitBranch },
  { id: 'logtypes', label: '日志类型', icon: FileText },
  { id: 'templates', label: '格式模板', icon: FileJson },
  { id: 'storage', label: '存储配置', icon: HardDrive },
];

export default function LogConfigSidebar({ activeSection, onSectionChange, dataSourceCount = 0 }: LogConfigSidebarProps) {
  const [counts, setCounts] = useState<Record<string, number>>({
    sources: dataSourceCount,
    parsing: 0,
    logtypes: 0,
    templates: 0,
    storage: 0,
  });

  // 从API获取各配置项数量
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        // 并行请求所有配置项数量
        const [
          dataSourcesRes,
          pipelinesRes,
          logTypesRes,
          formatsRes,
          storageRes,
        ] = await Promise.all([
          fetch('/api/datasources-api/datasources?page_size=1', { headers }).then(r => r.json()).catch(() => ({ success: false, data: { total: 0 } })),
          fetch('/api/pipelines?page_size=1', { headers }).then(r => r.json()).catch(() => ({ success: false, data: { total: 0 } })),
          fetch('/api/log-types-api/log-types?page_size=1', { headers }).then(r => r.json()).catch(() => ({ success: false, data: { total: 0 } })),
          fetch('/api/ingestion/formats?page_size=1', { headers }).then(r => r.json()).catch(() => ({ success: false, data: [] })),
          fetch('/api/storage-tables?page_size=1', { headers }).then(r => r.json()).catch(() => ({ code: 200, data: [] })),
        ]);

        // 处理不同API的返回格式
        const getCount = (res: any): number => {
          if (res?.data?.total !== undefined) return res.data.total;
          if (Array.isArray(res?.data)) return res.data.length;
          return 0;
        };

        setCounts({
          sources: dataSourcesRes?.data?.total ?? dataSourceCount ?? 0,
          parsing: pipelinesRes?.data?.total ?? 0,
          logtypes: logTypesRes?.data?.total ?? 0,
          templates: getCount(formatsRes),
          storage: getCount(storageRes),
        });
      } catch (error) {
        console.error('获取配置项数量失败:', error);
      }
    };

    fetchCounts();
  }, [dataSourceCount]);

  return (
    <div className="w-72 bg-card-bg rounded-2xl shadow-sm border border-border-color flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border-color">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Workflow className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">日志配置架构</h2>
            <p className="text-xs text-gray-400">接入 · 解析 · 存储</p>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          // 使用从API获取的数量
          const displayCount = counts[item.id] ?? item.count;
          return (
            <motion.button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              whileHover={{ x: 2 }}
              className={`w-full flex flex-col p-3 rounded-xl text-left transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 shadow-sm'
                  : 'hover:bg-gray-50 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  isActive ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`font-medium text-sm ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                      {item.label}
                    </span>
                    <span className={`text-xs ${isActive ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                      {displayCount} 个
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="w-1.5 h-1.5 rounded-full bg-orange-500"
                  />
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Data Flow Visualization */}
      <div className="p-4 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
          {flowNodes.map((node, index) => (
            <React.Fragment key={node.id}>
              <div className={`flex items-center gap-1 ${activeSection === node.id ? 'text-orange-500 font-medium' : ''}`}>
                <node.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{node.label}</span>
              </div>
              {index < flowNodes.length - 1 && (
                <ArrowRight className="w-3 h-3 text-gray-300 mx-0.5" />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="text-center text-xs text-gray-400 mt-2">数据流向</div>
      </div>
    </div>
  );
}
