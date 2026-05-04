import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, Key, Check, X, Plus, Search, Edit2, Trash2,
  ChevronRight, ChevronDown, Lock, Eye, Edit, Trash, Settings,
  FileText, Bell, Database, Server, Activity, UserCheck, UserX
} from 'lucide-react';

interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
  actions: ('view' | 'create' | 'edit' | 'delete' | 'execute')[];
}

interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
  permissions: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  isSystem?: boolean;
}

const modules = [
  { id: 'dashboard', name: '仪表盘', icon: Activity },
  { id: 'detection', name: '检测与分析', icon: Shield },
  { id: 'response', name: '响应与自动化', icon: Bell },
  { id: 'assets', name: '资产与攻击面', icon: Server },
  { id: 'data', name: '日志配置', icon: Database },
  { id: 'system', name: '系统管理', icon: Settings }
];

const allPermissions: Permission[] = [
  { id: 'dashboard.view', name: '查看仪表盘', description: '查看安全态势概览', module: 'dashboard', actions: ['view'] },
  { id: 'events.view', name: '查看事件', description: '查看安全事件列表和详情', module: 'detection', actions: ['view'] },
  { id: 'events.create', name: '创建事件', description: '手动创建安全事件', module: 'detection', actions: ['create'] },
  { id: 'events.edit', name: '编辑事件', description: '修改事件信息和状态', module: 'detection', actions: ['edit'] },
  { id: 'events.delete', name: '删除事件', description: '删除安全事件', module: 'detection', actions: ['delete'] },
  { id: 'alerts.view', name: '查看告警', description: '查看安全告警', module: 'detection', actions: ['view'] },
  { id: 'alerts.manage', name: '管理告警', description: '确认、关闭、标记误报', module: 'detection', actions: ['edit'] },
  { id: 'hunting.view', name: '威胁狩猎', description: '执行威胁狩猎查询', module: 'detection', actions: ['view', 'execute'] },
  { id: 'ai.view', name: 'AI中心', description: '使用AI分析功能', module: 'detection', actions: ['view', 'execute'] },
  { id: 'playbooks.view', name: '查看剧本', description: '查看剧本编排', module: 'response', actions: ['view'] },
  { id: 'playbooks.manage', name: '管理剧本', description: '创建、编辑、删除剧本', module: 'response', actions: ['create', 'edit', 'delete'] },
  { id: 'playbooks.execute', name: '执行剧本', description: '手动触发剧本执行', module: 'response', actions: ['execute'] },
  { id: 'rules.view', name: '查看规则', description: '查看检测规则', module: 'response', actions: ['view'] },
  { id: 'rules.manage', name: '管理规则', description: '创建、编辑、删除规则', module: 'response', actions: ['create', 'edit', 'delete'] },
  { id: 'assets.view', name: '查看资产', description: '查看资产清单', module: 'assets', actions: ['view'] },
  { id: 'assets.manage', name: '管理资产', description: '添加、编辑、删除资产', module: 'assets', actions: ['create', 'edit', 'delete'] },
  { id: 'scans.view', name: '查看扫描', description: '查看扫描任务', module: 'assets', actions: ['view'] },
  { id: 'scans.manage', name: '管理扫描', description: '创建、编辑扫描任务', module: 'assets', actions: ['create', 'edit', 'delete', 'execute'] },
  { id: 'data.view', name: '查看数据源', description: '查看数据接入配置', module: 'data', actions: ['view'] },
  { id: 'data.manage', name: '管理数据源', description: '配置数据源', module: 'data', actions: ['create', 'edit', 'delete'] },
  { id: 'users.view', name: '查看用户', description: '查看用户列表', module: 'system', actions: ['view'] },
  { id: 'users.manage', name: '管理用户', description: '创建、编辑、删除用户', module: 'system', actions: ['create', 'edit', 'delete'] },
  { id: 'roles.view', name: '查看角色', description: '查看角色权限', module: 'system', actions: ['view'] },
  { id: 'roles.manage', name: '管理角色', description: '创建、编辑角色', module: 'system', actions: ['create', 'edit', 'delete'] },
  { id: 'audit.view', name: '查看审计', description: '查看审计日志', module: 'system', actions: ['view'] },
  { id: 'config.view', name: '查看配置', description: '查看系统配置', module: 'system', actions: ['view'] },
  { id: 'config.manage', name: '管理配置', description: '修改系统配置', module: 'system', actions: ['edit'] }
];

const mockRoles: Role[] = [
  { id: '1', name: '超级管理员', description: '拥有系统所有权限', userCount: 2, permissions: allPermissions.map(p => p.id), status: 'active', createdAt: '2026-01-01T00:00:00Z', isSystem: true },
  { id: '2', name: '安全分析师', description: '负责安全事件分析和处置', userCount: 8, permissions: ['dashboard.view', 'events.view', 'events.edit', 'alerts.view', 'alerts.manage', 'hunting.view', 'ai.view', 'playbooks.view', 'playbooks.execute', 'rules.view', 'assets.view', 'scans.view', 'data.view'], status: 'active', createdAt: '2026-01-15T00:00:00Z' },
  { id: '3', name: '安全运营', description: '负责日常安全运营和监控', userCount: 5, permissions: ['dashboard.view', 'events.view', 'events.create', 'alerts.view', 'alerts.manage', 'assets.view', 'scans.view', 'scans.manage', 'data.view'], status: 'active', createdAt: '2026-02-01T00:00:00Z' },
  { id: '4', name: '审计员', description: '负责安全审计和合规检查', userCount: 3, permissions: ['dashboard.view', 'events.view', 'alerts.view', 'audit.view', 'config.view'], status: 'active', createdAt: '2026-02-15T00:00:00Z' },
  { id: '5', name: '访客', description: '只读权限，用于演示和培训', userCount: 1, permissions: ['dashboard.view', 'events.view', 'alerts.view'], status: 'inactive', createdAt: '2026-03-01T00:00:00Z' }
];

const actionLabels: Record<string, string> = {
  view: '查看',
  create: '创建',
  edit: '编辑',
  delete: '删除',
  execute: '执行'
};

export default function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>(mockRoles);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [expandedModules, setExpandedModules] = useState<string[]>(['detection', 'response', 'assets']);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [] as string[]
  });

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev =>
      prev.includes(moduleId) ? prev.filter(id => id !== moduleId) : [...prev, moduleId]
    );
  };

  const togglePermission = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(id => id !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  const toggleAllInModule = (moduleId: string, checked: boolean) => {
    const modulePermissions = allPermissions.filter(p => p.module === moduleId).map(p => p.id);
    setFormData(prev => ({
      ...prev,
      permissions: checked
        ? [...new Set([...prev.permissions, ...modulePermissions])]
        : prev.permissions.filter(id => !modulePermissions.includes(id))
    }));
  };

  const handleAdd = () => {
    setEditingRole(null);
    setFormData({ name: '', description: '', permissions: [] });
    setShowForm(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description,
      permissions: role.permissions
    });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formData.name) return;

    if (editingRole) {
      setRoles(prev => prev.map(r =>
        r.id === editingRole.id
          ? { ...r, ...formData }
          : r
      ));
    } else {
      const newRole: Role = {
        id: String(roles.length + 1),
        name: formData.name,
        description: formData.description,
        userCount: 0,
        permissions: formData.permissions,
        status: 'active',
        createdAt: new Date().toISOString()
      };
      setRoles(prev => [...prev, newRole]);
    }
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setRoles(prev => prev.filter(r => r.id !== id));
    if (selectedRole?.id === id) setSelectedRole(null);
  };

  const toggleStatus = (id: string) => {
    setRoles(prev => prev.map(r =>
      r.id === id ? { ...r, status: r.status === 'active' ? 'inactive' : 'active' } : r
    ));
  };

  const getPermissionCount = (moduleId: string, rolePermissions: string[]) => {
    const modulePerms = allPermissions.filter(p => p.module === moduleId);
    const granted = modulePerms.filter(p => rolePermissions.includes(p.id)).length;
    return { granted, total: modulePerms.length };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">角色权限</h1>
          <p className="text-text-secondary mt-1">管理角色和权限配置</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建角色
        </motion.button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="搜索角色..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredRoles.map((role) => (
              <motion.div
                key={role.id}
                whileHover={{ scale: 1.01 }}
                onClick={() => setSelectedRole(role)}
                className={`p-4 rounded-xl cursor-pointer transition-all ${
                  selectedRole?.id === role.id
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-card-bg border border-border-color hover:border-primary/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-text-primary">{role.name}</h3>
                      {role.isSystem && (
                        <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded">系统</span>
                      )}
                    </div>
                    <p className="text-text-secondary text-sm mt-1">{role.description}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    role.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {role.status === 'active' ? '启用' : '禁用'}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {role.userCount} 用户
                  </span>
                  <span className="flex items-center gap-1">
                    <Key className="w-3.5 h-3.5" />
                    {role.permissions.length} 权限
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          {selectedRole ? (
            <div className="glass-card rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">{selectedRole.name}</h2>
                  <p className="text-text-secondary">{selectedRole.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedRole.isSystem && (
                    <>
                      <button
                        onClick={() => handleEdit(selectedRole)}
                        className="p-2 text-text-secondary hover:text-primary rounded-lg hover:bg-primary/10"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleStatus(selectedRole.id)}
                        className="p-2 text-text-secondary hover:text-primary rounded-lg hover:bg-primary/10"
                      >
                        {selectedRole.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(selectedRole.id)}
                        className="p-2 text-text-secondary hover:text-critical rounded-lg hover:bg-critical/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {modules.map((module) => {
                  const Icon = module.icon;
                  const { granted, total } = getPermissionCount(module.id, selectedRole.permissions);
                  const isExpanded = expandedModules.includes(module.id);
                  const modulePermissions = allPermissions.filter(p => p.module === module.id);

                  return (
                    <div key={module.id} className="border border-border-color rounded-lg">
                      <button
                        onClick={() => toggleModule(module.id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-page-bg/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium text-text-primary">{module.name}</h3>
                            <p className="text-text-secondary text-sm">{granted}/{total} 权限</p>
                          </div>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 border-t border-border-color space-y-2">
                              {modulePermissions.map((perm) => (
                                <div
                                  key={perm.id}
                                  className="flex items-center justify-between p-3 bg-page-bg rounded-lg"
                                >
                                  <div>
                                    <p className="text-text-primary font-medium">{perm.name}</p>
                                    <p className="text-text-secondary text-sm">{perm.description}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {perm.actions.map(action => (
                                      <span
                                        key={action}
                                        className={`px-2 py-1 text-xs rounded ${
                                          selectedRole.permissions.includes(perm.id)
                                            ? 'bg-primary/20 text-primary'
                                            : 'bg-border-color text-text-muted'
                                        }`}
                                      >
                                        {actionLabels[action]}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-xl p-12 text-center">
              <Shield className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h3 className="text-text-primary font-medium mb-2">选择角色查看详情</h3>
              <p className="text-text-secondary">从左侧列表选择一个角色查看权限配置</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => setShowForm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            >
              <div
                className="glass-card rounded-xl p-6 w-[800px] pointer-events-auto max-h-[85vh] overflow-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-text-primary">
                    {editingRole ? '编辑角色' : '新建角色'}
                  </h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="p-2 text-text-secondary hover:text-text-primary"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">角色名称</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="输入角色名称"
                        className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-text-secondary text-sm mb-2">描述</label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="输入角色描述"
                        className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-4">权限配置</label>
                    <div className="space-y-3">
                      {modules.map((module) => {
                        const Icon = module.icon;
                        const modulePermissions = allPermissions.filter(p => p.module === module.id);
                        const grantedCount = modulePermissions.filter(p => formData.permissions.includes(p.id)).length;
                        const allGranted = grantedCount === modulePermissions.length && modulePermissions.length > 0;

                        return (
                          <div key={module.id} className="border border-border-color rounded-lg">
                            <div className="flex items-center justify-between p-3 bg-page-bg/50">
                              <div className="flex items-center gap-3">
                                <Icon className="w-4 h-4 text-primary" />
                                <span className="font-medium text-text-primary">{module.name}</span>
                                <span className="text-text-secondary text-sm">({grantedCount}/{modulePermissions.length})</span>
                              </div>
                              <button
                                onClick={() => toggleAllInModule(module.id, !allGranted)}
                                className={`text-xs px-2 py-1 rounded ${
                                  allGranted ? 'bg-primary text-white' : 'bg-border-color text-text-secondary'
                                }`}
                              >
                                {allGranted ? '取消全选' : '全选'}
                              </button>
                            </div>
                            <div className="p-3 grid grid-cols-2 gap-2">
                              {modulePermissions.map((perm) => (
                                <button
                                  key={perm.id}
                                  onClick={() => togglePermission(perm.id)}
                                  className={`flex items-start gap-2 p-2 rounded-lg text-left transition-colors ${
                                    formData.permissions.includes(perm.id)
                                      ? 'bg-primary/10 border border-primary/30'
                                      : 'bg-page-bg border border-border-color hover:border-primary/50'
                                  }`}
                                >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 ${
                                    formData.permissions.includes(perm.id) ? 'bg-primary border-primary' : 'border-text-muted'
                                  }`}>
                                    {formData.permissions.includes(perm.id) && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <div>
                                    <p className="text-sm text-text-primary">{perm.name}</p>
                                    <p className="text-xs text-text-muted">{perm.description}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-color">
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-text-secondary hover:text-text-primary"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!formData.name}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg"
                  >
                    {editingRole ? '保存' : '创建'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
