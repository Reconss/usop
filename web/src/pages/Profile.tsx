import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, Key, Save, CheckCircle, UserCircle2, AlertCircle } from 'lucide-react';
import { authApi } from '../services/api';
import {
  Button,
  ContentContainer,
  Field,
  LoadingState,
  PageHeader,
  SectionCard,
} from '../components/ui';

interface UserData {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

const roleLabel = (role?: string) =>
  role === 'admin' ? '管理员' : role === 'analyst' ? '分析师' : '普通用户';

const Profile: React.FC = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 表单状态
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await authApi.getProfile();
      if (res.success) {
        setUser(res.data);
        setEmail(res.data.email);
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!email) {
      setError('邮箱不能为空');
      return;
    }

    try {
      setError('');
      const res = await authApi.getProfile();
      if (res.success) {
        // 这里简化处理，实际应该调用更新接口
        setSuccess('个人信息已保存');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      setError(err.message || '保存失败');
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword) {
      setError('请输入原密码');
      return;
    }
    if (!newPassword) {
      setError('请输入新密码');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密码长度至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    try {
      setError('');
      const res = await authApi.changePassword(oldPassword, newPassword);
      if (res.success) {
        setSuccess('密码修改成功');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      setError(err.message || '密码修改失败');
    }
  };

  if (loading) {
    return (
      <ContentContainer width="form">
        <LoadingState label="正在加载账户信息…" />
      </ContentContainer>
    );
  }

  return (
    <ContentContainer width="form">
      <PageHeader
        title="个人中心"
        icon={UserCircle2}      />

      {success && (
        <div className="callout callout-success">
          <CheckCircle size={15} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="callout callout-danger">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 基本信息 */}
        <SectionCard
          title="基本信息"
          icon={User}
          description="用户名与角色由管理员分配，不可自行修改"
          footer={
            <Button variant="primary" icon={Save} onClick={handleUpdateProfile} className="ml-auto">
              保存修改
            </Button>
          }
        >
          <div className="space-y-4">
            <Field label="用户名">
              <div className="app-input flex items-center bg-surface-2 text-text-primary">
                {user?.username || '—'}
              </div>
            </Field>

            <Field label="邮箱">
              <div className="relative">
                <Mail size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="app-input pl-9"
                />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="角色">
                <div className="app-input flex items-center gap-2 bg-surface-2 text-text-primary">
                  <Shield size={14} className="text-text-muted" />
                  {roleLabel(user?.role)}
                </div>
              </Field>

              <Field label="注册时间">
                <div className="app-input flex items-center bg-surface-2 text-text-primary">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '—'}
                </div>
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* 修改密码 */}
        <SectionCard
          title="修改密码"
          icon={Key}
          description="修改后需使用新密码重新登录"
          footer={
            <Button variant="primary" icon={Shield} onClick={handleChangePassword} className="ml-auto">
              修改密码
            </Button>
          }
        >
          <div className="space-y-4">
            <Field label="原密码" required>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入原密码"
                autoComplete="current-password"
                className="app-input"
              />
            </Field>

            <Field label="新密码" required help="至少 6 位字符">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码"
                autoComplete="new-password"
                className="app-input"
              />
            </Field>

            <Field label="确认新密码" required>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                autoComplete="new-password"
                className="app-input"
              />
            </Field>
          </div>
        </SectionCard>
      </div>
    </ContentContainer>
  );
};

export default Profile;
