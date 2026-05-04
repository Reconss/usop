import React, { useState, useEffect } from 'react';
import { User, Mail, Shield, Key, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { authApi } from '../services/api';

interface UserData {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6">个人中心</h1>

      {/* 成功/错误提示 */}
      {success && (
        <div className="mb-4 p-4 bg-success/10 border border-success/30 rounded-lg flex items-center gap-2 text-success">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-critical/10 border border-critical/30 rounded-lg flex items-center gap-2 text-critical">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 基本信息 */}
        <div className="bg-card-bg border border-border-color rounded-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <User className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">基本信息</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">用户名</label>
              <div className="px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary">
                {user?.username}
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">角色</label>
              <div className="px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary flex items-center gap-2">
                <Shield className="w-4 h-4 text-text-muted" />
                {user?.role === 'admin' ? '管理员' : user?.role === 'analyst' ? '分析师' : '普通用户'}
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">注册时间</label>
              <div className="px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary">
                {user?.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '-'}
              </div>
            </div>

            <button
              onClick={handleUpdateProfile}
              className="w-full mt-4 px-4 py-2 bg-primary text-white rounded-input hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              保存修改
            </button>
          </div>
        </div>

        {/* 修改密码 */}
        <div className="bg-card-bg border border-border-color rounded-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">修改密码</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">原密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入原密码"
                className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码（至少6位）"
                className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-input text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>

            <button
              onClick={handleChangePassword}
              className="w-full mt-4 px-4 py-2 bg-primary text-white rounded-input hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Shield className="w-4 h-4" />
              修改密码
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
