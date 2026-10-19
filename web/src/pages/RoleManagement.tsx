import React, { useState, useEffect } from 'react';
import {
  Shield, Users, Key, Check, Plus, Edit2, Trash2, ChevronDown,
  Settings, Bell, Database, Server, Activity, RefreshCw, Lock,
} from 'lucide-react';
import { rolesApi, request as apiRequest } from '../services/api';
import {
  Button,
  ContentContainer,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  SectionCard,
  StatusBadge,
} from '../components/ui';

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
  createdAt: string;
  isSystem?: boolean;
}

const modules = [
  { id: 'dashboard', name: '仪表盘', icon: Activity },
  { id: 'detection', name: '检测与分析', icon: Shield },
  { id: 'response', name: '响应与自动化', icon: Bell },
  { id: 'assets', name: '资产与攻击面', icon: Server },
  { id: 'data', name: '日志配置', icon: Database },
  { id: 'system', name: '系统管理', icon: Settings },
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
  { id: 'config.manage', name: '管理配置', description: '修改系统配置', module: 'system', actions: ['edit'] },
];

const actionLabels: Record<string, string> = {
  view: '查看',
  create: '创建',
  edit: '编辑',
  delete: '删除',
  execute: '执行',
};

export default function RoleManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [expandedModules, setExpandedModules] = useState<string[]>(['detection', 'response', 'assets']);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
  });

  const addToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRoles = async () => {
    setLoading(true);
    try {
      // 角色列表 + 用户列表并行拉取，用户数按 role 字段真实统计（不再恒为 0）
      const [res, usersRes]: any[] = await Promise.all([
        rolesApi.getRoles(),
        apiRequest('/users-api/users?page_size=200').catch(() => ({ success: false })),
      ]);
      const countByRole: Record<string, number> = {};
      if (usersRes?.success) {
        const items = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.items || [];
        items.forEach((u: any) => {
          const key = String(u.role ?? '');
          countByRole[key] = (countByRole[key] || 0) + 1;
        });
      }
      if (res.success && res.data) {
        const rolesData = Array.isArray(res.data) ? res.data : [];
        setRoles(rolesData.map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          userCount: countByRole[String(r.id)] || 0,
          permissions: r.permissions || [],
          createdAt: r.created_at || new Date().toISOString(),
          isSystem: r.is_system,
        })));
      } else {
        setRoles([]);
      }
    } catch (error) {
      console.error('获取角色列表失败:', error);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const filteredRoles = roles.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) =>
      prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]
    );
  };

  const togglePermission = (permissionId: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter((id) => id !== permissionId)
        : [...prev.permissions, permissionId],
    }));
  };

  const toggleAllInModule = (moduleId: string, checked: boolean) => {
    const modulePermissions = allPermissions.filter((p) => p.module === moduleId).map((p) => p.id);
    setFormData((prev) => ({
      ...prev,
      permissions: checked
        ? [...new Set([...prev.permissions, ...modulePermissions])]
        : prev.permissions.filter((id) => !modulePermissions.includes(id)),
    }));
  };

  const handleAdd = () => {
    setEditingRole(null);
    setFormData({ name: '', description: '', permissions: [] });
    setFormError('');
    setShowForm(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setFormError('角色名称不能为空');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        permissions: formData.permissions,
      };
      const res: any = editingRole
        ? await rolesApi.updateRole(editingRole.id, payload)
        : await rolesApi.createRole({
            ...payload,
            id: payload.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || `role-${Date.now()}`,
          });
      if (res.success) {
        addToast('success', editingRole ? '角色已更新' : '角色已创建');
        setShowForm(false);
        await fetchRoles();
      } else {
        setFormError(res.error || '保存失败');
      }
    } catch (e: any) {
      setFormError(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res: any = await rolesApi.deleteRole(deleteTarget.id);
      if (res.success) addToast('success', `已删除角色 ${deleteTarget.name}`);
      else addToast('error', res.error || '删除失败');
    } catch (e: any) {
      addToast('error', e?.message || '删除失败');
    }
    if (selectedRole?.id === deleteTarget.id) setSelectedRole(null);
    setDeleteTarget(null);
    await fetchRoles();
  };

  const getPermissionCount = (moduleId: string, rolePermissions: string[]) => {
    const modulePerms = allPermissions.filter((p) => p.module === moduleId);
    const granted = modulePerms.filter((p) => rolePermissions.includes(p.id)).length;
    return { granted, total: modulePerms.length };
  };

  return (
    <ContentContainer>
      <PageHeader
        icon={Shield}
        title="角色权限"        meta={
          roles.length > 0 ? (
            <span className="text-[11px] text-text-muted num">共 {roles.length} 个角色</span>
          ) : undefined
        }
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={fetchRoles}>
              刷新
            </Button>
            <Button variant="primary" icon={Plus} onClick={handleAdd}>
              新建角色
            </Button>
          </>
        }
      />

      {loading ? (
        <SectionCard>
          <LoadingState label="正在加载角色…" />
        </SectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
          {/* ── 左：角色列表 ─────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SearchInput value={searchTerm} onChange={setSearchTerm} width="full" placeholder="搜索角色…" />

            {filteredRoles.length === 0 ? (
              <SectionCard padding="none">
                <EmptyState
                  compact
                  icon={Shield}
                  title={searchTerm ? '没有匹配的角色' : '暂无角色'}
                  description={searchTerm ? undefined : '创建角色后可为其分配权限组合'}
                />
              </SectionCard>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredRoles.map((role) => {
                  const active = selectedRole?.id === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={[
                        'w-full rounded-card border px-3.5 py-3 text-left transition-colors',
                        active
                          ? 'border-primary/40 bg-primary/10'
                          : 'border-border-color bg-card-bg hover:border-border-strong hover:bg-surface-2',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-text-primary truncate-1">{role.name}</span>
                            {role.isSystem && (
                              <StatusBadge tone="primary">
                                <Lock size={9} /> 系统
                              </StatusBadge>
                            )}
                          </div>
                          {role.description && (
                            <p className="mt-0.5 text-[11.5px] text-text-muted truncate-2">{role.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-text-muted num">
                        <span className="inline-flex items-center gap-1">
                          <Users size={11} /> {role.userCount} 用户
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Key size={11} /> {role.permissions.length} 权限
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 右：权限详情 ─────────────────────────── */}
          <div className="min-w-0">
            {selectedRole ? (
              <SectionCard
                icon={Shield}
                title={selectedRole.name}
                description={selectedRole.description || '未填写角色说明'}
                actions={
                  selectedRole.isSystem ? (
                    <StatusBadge tone="primary">
                      <Lock size={10} /> 系统内置角色
                    </StatusBadge>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" icon={Edit2} onClick={() => handleEdit(selectedRole)}>
                        编辑
                      </Button>
                      <Button variant="danger-ghost" size="sm" icon={Trash2} onClick={() => setDeleteTarget(selectedRole)}>
                        删除
                      </Button>
                    </>
                  )
                }
              >
                <div className="flex flex-col gap-2.5">
                  {modules.map((module) => {
                    const Icon = module.icon;
                    const { granted, total } = getPermissionCount(module.id, selectedRole.permissions);
                    const isExpanded = expandedModules.includes(module.id);
                    const modulePermissions = allPermissions.filter((p) => p.module === module.id);

                    return (
                      <div key={module.id} className="rounded-card border border-border-color overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleModule(module.id)}
                          className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input bg-primary/12 text-primary">
                              <Icon size={14} />
                            </span>
                            <span className="text-[13px] font-medium text-text-primary truncate-1">{module.name}</span>
                            <span
                              className={`text-[11px] num ${granted === 0 ? 'text-text-muted' : 'text-primary'}`}
                            >
                              {granted}/{total}
                            </span>
                          </div>
                          <ChevronDown
                            size={15}
                            className={`shrink-0 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border-color divide-y divide-border-color">
                            {modulePermissions.map((perm) => {
                              const has = selectedRole.permissions.includes(perm.id);
                              return (
                                <div
                                  key={perm.id}
                                  className="flex items-center justify-between gap-3 px-3.5 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-[12.5px] text-text-primary truncate-1">{perm.name}</div>
                                    <div className="text-[11px] text-text-muted truncate-1">{perm.description}</div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {perm.actions.map((action) => (
                                      <span
                                        key={action}
                                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                                          has
                                            ? 'bg-primary/14 text-primary'
                                            : 'bg-surface-3 text-text-muted'
                                        }`}
                                      >
                                        {actionLabels[action]}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            ) : (
              <SectionCard>
                <EmptyState
                  icon={Shield}
                  title="选择角色查看权限详情"
                  description="从左侧列表选择一个角色，右侧会展示它在该模块下拥有的权限。"
                />
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {/* ── 新建 / 编辑角色 ─────────────────────────── */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        width={860}
        title={editingRole ? '编辑角色' : '新建角色'}
        description={editingRole ? `角色 ${editingRole.name}` : '角色 ID 依据名称自动生成，创建后按模块勾选权限'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>取消</Button>
            <Button variant="primary" icon={editingRole ? Edit2 : Plus} loading={saving} disabled={!formData.name} onClick={handleSave}>
              {editingRole ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="app-form-grid">
            <Field label="角色名称" required>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入角色名称"
                className="app-input"
              />
            </Field>
            <Field label="描述">
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="输入角色描述"
                className="app-input"
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="app-label mb-0">权限配置</span>
              <span className="text-[11px] text-text-muted num">已选 {formData.permissions.length} 项</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {modules.map((module) => {
                const Icon = module.icon;
                const modulePermissions = allPermissions.filter((p) => p.module === module.id);
                const grantedCount = modulePermissions.filter((p) => formData.permissions.includes(p.id)).length;
                const allGranted = grantedCount === modulePermissions.length && modulePermissions.length > 0;

                return (
                  <div key={module.id} className="rounded-card border border-border-color overflow-hidden">
                    <div className="flex items-center justify-between gap-3 bg-surface-2 px-3.5 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon size={14} className="text-primary shrink-0" />
                        <span className="text-[12.5px] font-medium text-text-primary truncate-1">{module.name}</span>
                        <span className="text-[11px] text-text-muted num">
                          {grantedCount}/{modulePermissions.length}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllInModule(module.id, !allGranted)}
                      >
                        {allGranted ? '取消全选' : '全选'}
                      </Button>
                    </div>

                    <div className="grid gap-1.5 p-2.5 sm:grid-cols-2">
                      {modulePermissions.map((perm) => {
                        const checked = formData.permissions.includes(perm.id);
                        return (
                          <button
                            key={perm.id}
                            type="button"
                            onClick={() => togglePermission(perm.id)}
                            className={`flex items-start gap-2 rounded-input border p-2 text-left transition-colors ${
                              checked
                                ? 'border-primary/35 bg-primary/10'
                                : 'border-border-color bg-card-bg hover:border-border-strong'
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                                checked ? 'border-primary bg-primary text-white' : 'border-border-strong'
                              }`}
                            >
                              {checked && <Check size={9} />}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[12px] text-text-primary truncate-1">{perm.name}</span>
                              <span className="block text-[10.5px] text-text-muted truncate-1">{perm.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {formError && <div className="callout callout-danger">{formError}</div>}
        </div>
      </Modal>

      {/* ── 删除确认 ───────────────────────────────── */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        width={420}
        title="删除角色"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="danger" icon={Trash2} onClick={handleDelete}>确认删除</Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">
          确定要删除角色 <strong className="text-text-primary">{deleteTarget?.name}</strong> 吗？
          已绑定该角色的用户将失去对应权限，操作不可撤销。
        </p>
      </Modal>

      {/* ── Toast ─────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed right-4 top-16 z-toast max-w-xs rounded-card border px-3.5 py-2.5 text-[12.5px] shadow-panel ${
            toast.type === 'error'
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-success/30 bg-success/10 text-success'
          }`}
        >
          {toast.message}
        </div>
      )}
    </ContentContainer>
  );
}
