import React, { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, UserCheck, UserX, Mail, Shield, Key, Eye, EyeOff, RefreshCw, Users, Search,
  Network, KeyRound,
} from 'lucide-react';
import type { User } from '../types';
import { userApi, request as apiRequest } from '../services/api';
import {
  Button,
  ContentContainer,
  EmptyState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  SectionCard,
  Segmented,
  StateBadge,
  TableWrap,
} from '../components/ui';

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [resetPwdModal, setResetPwdModal] = useState<{ open: boolean; userId: string; username: string }>({
    open: false, userId: '', username: '',
  });
  const [resetPwdValue, setResetPwdValue] = useState('');
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    role: '',
    password: '',
    confirmPassword: '',
    authType: 'local' as 'local' | 'ad',
  });

  const [roleOptions, setRoleOptions] = useState<{ id: string; name: string }[]>([]);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);
  const addToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    apiRequest('/roles-api/roles').then((r: any) => {
      if (r.success && r.data) {
        setRoleOptions(r.data.map((role: any) => ({ id: role.id, name: role.name })));
      }
    }).catch(() => {});
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await userApi.getUsers({ page_size: 100 });
      if (res.success && res.data) {
        const items = Array.isArray(res.data) ? res.data : res.data.items || [];
        setUsers(items);
      } else {
        setUsers([]);
      }
    } catch (error) {
      console.error('获取用户列表失败:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  /** 启停：真实调用 toggle-status，管理员账户后端会拒绝 */
  const toggleStatus = async (user: User) => {
    try {
      const r: any = await apiRequest(`/users-api/users/${user.id}/toggle-status`, { method: 'POST' });
      if (r.success) {
        addToast('success', `已${user.status === 'active' ? '禁用' : '启用'} ${user.username}`);
      } else {
        addToast('error', r.error || '操作失败');
      }
    } catch (e: any) {
      addToast('error', e?.message || '操作失败');
    }
    await fetchUsers();
  };

  const handleAdd = () => {
    setEditingUser(null);
    setFormData({ username: '', email: '', role: roleOptions[0]?.id || '运营人员', password: '', confirmPassword: '', authType: 'local' });
    setShowPassword(false);
    setFormError('');
    setShowForm(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      role: user.role,
      password: '',
      confirmPassword: '',
      authType: user.authType === 'ad' ? 'ad' : 'local',
    });
    setShowPassword(false);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.username.trim() || !formData.email.trim()) {
      setFormError('用户名与邮箱不能为空');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      // 平台用户名即 AD 域登录名（后端自动回填 ad_upn），无需单独字段
      const base = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        role: formData.role,
        auth_type: formData.authType,
      };
      let r: any;
      if (editingUser) {
        // 本地 → AD 转换无需密码；AD → 本地必须带新密码
        r = await apiRequest(`/users-api/users/${editingUser.id}`, {
          method: 'PUT',
          body: { ...base, ...(formData.authType === 'local' && formData.password ? { password: formData.password } : {}) },
        });
      } else {
        if (formData.authType === 'local') {
          if (formData.password !== formData.confirmPassword) {
            setFormError('两次输入的密码不一致');
            setSaving(false);
            return;
          }
          if (!formData.password) {
            setFormError('请设置初始密码');
            setSaving(false);
            return;
          }
        }
        r = await apiRequest('/users-api/users', {
          method: 'POST',
          body: { ...base, password: formData.password },
        });
      }
      if (r.success) {
        addToast('success', editingUser ? '用户已更新' : '用户已创建');
        setShowForm(false);
        await fetchUsers();
      } else {
        setFormError(r.error || '保存失败');
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
      const r: any = await apiRequest(`/users-api/users/${deleteTarget.id}`, { method: 'DELETE' });
      if (r.success) addToast('success', `已删除 ${deleteTarget.username}`);
      else addToast('error', r.error || '删除失败');
    } catch (e: any) {
      addToast('error', e?.message || '删除失败');
    }
    setDeleteTarget(null);
    await fetchUsers();
  };

  const submitResetPwd = async () => {
    if (!resetPwdValue || resetPwdValue.length < 6) return;
    setResetting(true);
    try {
      const r: any = await apiRequest(`/users-api/users/${resetPwdModal.userId}/reset-password`, {
        method: 'POST', body: { password: resetPwdValue },
      });
      if (r.success) addToast('success', '密码已重置');
      else addToast('error', r.error || '重置失败');
    } catch (e: any) {
      addToast('error', e.message);
    } finally {
      setResetting(false);
      setResetPwdModal({ open: false, userId: '', username: '' });
      setResetPwdValue('');
    }
  };

  const activeCount = users.filter((u) => u.status === 'active').length;
  const canSubmit = Boolean(
    formData.username && formData.email && (
      formData.authType === 'ad' ||
      (formData.authType === 'local' &&
        (editingUser || (formData.password && formData.password === formData.confirmPassword)))
    )
  );
  const isAdUser = (u: User) => u.authType === 'ad';

  return (
    <ContentContainer>
      <PageHeader
        icon={Users}
        title="用户管理"        meta={
          users.length > 0 ? (
            <span className="text-[11px] text-text-muted num">共 {users.length} 个用户 · 启用 {activeCount}</span>
          ) : undefined
        }
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={fetchUsers}>
              刷新
            </Button>
            <Button variant="primary" icon={Plus} onClick={handleAdd}>
              新建用户
            </Button>
          </>
        }
        toolbar={
          <>
            <div className="relative w-[260px] max-w-full">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="搜索用户名或邮箱…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="app-input pl-8"
              />
            </div>
            {searchTerm && (
              <span className="text-[11px] text-text-muted num">命中 {filteredUsers.length} 条</span>
            )}
          </>
        }
      />

      <SectionCard flush>
        {loading ? (
          <LoadingState label="正在加载用户列表…" />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={searchTerm ? '没有匹配的用户' : '暂无用户'}
            description={searchTerm ? '尝试更换关键词，或清空搜索条件。' : '创建第一个平台用户后即可分配角色与权限。'}
            action={
              searchTerm ? (
                <Button variant="soft" onClick={() => setSearchTerm('')}>清空搜索</Button>
              ) : (
                <Button variant="soft" icon={Plus} onClick={handleAdd}>新建用户</Button>
              )
            }
          />
        ) : (
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>用户名</th>
                  <th style={{ width: 110 }}>账号类型</th>
                  <th style={{ minWidth: 120 }}>角色</th>
                  <th style={{ minWidth: 180 }}>邮箱</th>
                  <th style={{ minWidth: 170 }}>最后登录</th>
                  <th style={{ width: 110 }}>状态</th>
                  <th style={{ width: 140 }} className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary">
                          {(user.username || '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="text-text-primary font-medium truncate-1">{user.username}</span>
                      </div>
                    </td>
                    <td>
                      {isAdUser(user) ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-pill bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary"
                          title={user.adUpn || undefined}
                        >
                          <Network size={11} />
                          AD 域
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-text-muted">
                          本地账号
                        </span>
                      )}
                    </td>
                    <td>{roleOptions.find((r) => r.id === user.role)?.name || user.role || '—'}</td>
                    <td className="font-mono text-[12px] truncate-1">{user.email || '—'}</td>
                    <td className="num">{user.lastLogin ? new Date(user.lastLogin).toLocaleString('zh-CN') : '—'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => toggleStatus(user)}
                        title={user.status === 'active' ? '点击禁用' : '点击启用'}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-transparent px-1 py-0.5 transition-colors hover:border-border-color"
                      >
                        <StateBadge
                          state={user.status}
                          label={user.status === 'active' ? '启用' : '禁用'}
                        />
                        {user.status === 'active'
                          ? <UserCheck size={13} className="text-success" />
                          : <UserX size={13} className="text-text-muted" />}
                      </button>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" icon={Edit2} className="w-8 px-0"
                          title="编辑" onClick={() => handleEdit(user)} />
                        <Button variant="ghost" size="sm" icon={Key} className="w-8 px-0 text-warning"
                          title={isAdUser(user) ? 'AD 域账号密码由域控制器管理' : '重置密码'}
                          disabled={isAdUser(user)}
                          onClick={() => setResetPwdModal({ open: true, userId: user.id, username: user.username })} />
                        <Button variant="danger-ghost" size="sm" icon={Trash2} className="w-8 px-0"
                          title="删除" onClick={() => setDeleteTarget(user)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>

      {/* ── 新建 / 编辑用户 ─────────────────────────── */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        width={520}
        title={editingUser ? '编辑用户' : '新建用户'}
        description={editingUser ? `用户 #${editingUser.id}` : '新用户创建后立即可登录，初始密码请通过安全渠道传达'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>取消</Button>
            <Button
              variant="primary"
              icon={editingUser ? Edit2 : Plus}
              loading={saving}
              disabled={!canSubmit}
              onClick={handleSave}
            >
              {editingUser ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="账号类型" help={formData.authType === 'ad' ? '登录时由 AD 域控制器校验口令，平台不存储密码' : undefined}>
            <Segmented
              items={[
                { value: 'local', label: '本地账号' },
                { value: 'ad', label: 'AD 域账号' },
              ]}
              value={formData.authType}
              onChange={(v) => setFormData({ ...formData, authType: v as 'local' | 'ad' })}
            />
          </Field>

          <Field
            label="用户名"
            required
            help={formData.authType === 'ad' ? '即 AD 域登录名（sAMAccountName 或 UPN），登录时由域控校验' : undefined}
          >
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder={formData.authType === 'ad' ? '如 zhangwei 或 zhangwei@corp.com' : '输入用户名'}
              className="app-input"
            />
          </Field>

          <Field label="邮箱" required>
            <div className="relative">
              <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="输入邮箱地址"
                className="app-input pl-8"
              />
            </div>
          </Field>

          <Field label="角色">
            <div className="relative">
              <Shield size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="app-select pl-8"
              >
                {roleOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </Field>

          {formData.authType === 'local' && editingUser && (
            <Field label="重设登录密码" help="仅转换账号类型时必填；留空表示不修改">
              <div className="relative">
                <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="留空则不修改密码"
                  className="app-input pl-8"
                />
              </div>
            </Field>
          )}

          {formData.authType === 'local' && !editingUser && (
            <>
              <Field label="密码" required>
                <div className="relative">
                  <Key size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="输入初始密码"
                    className="app-input pl-8 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>

              <Field
                label="确认密码"
                required
                error={
                  formData.confirmPassword && formData.password !== formData.confirmPassword
                    ? '两次输入的密码不一致'
                    : undefined
                }
              >
                <div className="relative">
                  <Key size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="再次输入密码"
                    className="app-input pl-8"
                  />
                </div>
              </Field>
            </>
          )}

          {formError && <div className="callout callout-danger">{formError}</div>}
        </div>
      </Modal>

      {/* ── 重置密码 ───────────────────────────────── */}
      <Modal
        open={resetPwdModal.open}
        onClose={() => { setResetPwdModal({ open: false, userId: '', username: '' }); setResetPwdValue(''); }}
        width={420}
        title="重置密码"
        description={`为用户 ${resetPwdModal.username} 设置新密码`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => { setResetPwdModal({ open: false, userId: '', username: '' }); setResetPwdValue(''); }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              icon={Key}
              loading={resetting}
              disabled={!resetPwdValue || resetPwdValue.length < 6}
              onClick={submitResetPwd}
            >
              确认重置
            </Button>
          </>
        }
      >
        <Field label="新密码" required help="至少 6 位">
          <input
            value={resetPwdValue}
            onChange={(e) => setResetPwdValue(e.target.value)}
            type="text"
            placeholder="输入新密码"
            className="app-input"
          />
        </Field>
      </Modal>

      {/* ── 删除确认 ───────────────────────────────── */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        width={420}
        title="删除用户"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="danger" icon={Trash2} onClick={handleDelete}>确认删除</Button>
          </>
        }
      >
        <p className="text-body text-text-secondary">
          确定要删除用户 <strong className="text-text-primary">{deleteTarget?.username}</strong> 吗？该操作不可撤销，用户将立即失去登录权限。
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
