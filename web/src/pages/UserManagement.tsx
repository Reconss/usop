import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, UserCheck, UserX, X, Mail, Shield, Key, Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { User } from '../types';
import { userApi, request as apiRequest } from '../services/api';



export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetPwdModal, setResetPwdModal] = useState<{open:boolean;userId:string;username:string}>({open:false,userId:'',username:''});
  const [resetPwdValue, setResetPwdValue] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    role: '',
    password: '',
    confirmPassword: ''
  });

  const [roleOptions, setRoleOptions] = useState<{id:string;name:string}[]>([]);
  const [toast, setToast] = useState<{type:string;message:string} | null>(null);
  const addToast = (type: string, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };
  
  useEffect(() => {
    apiRequest('/roles-api/roles').then((r:any) => {
      if (r.success && r.data) {
        setRoleOptions(r.data.map((role:any) => ({id: role.id, name: role.name})));
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

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleStatus = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u));
  };

  const handleAdd = () => {
    setEditingUser(null);
    setFormData({ username: '', email: '', role: '运营人员', password: '', confirmPassword: '' });
    setShowPassword(false);
    setShowForm(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      role: user.role,
      password: '',
      confirmPassword: ''
    });
    setShowPassword(false);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formData.username || !formData.email) return;

    if (editingUser) {
      setUsers(prev => prev.map(u =>
        u.id === editingUser.id
          ? { ...u, username: formData.username, email: formData.email, role: formData.role }
          : u
      ));
    } else {
      if (formData.password !== formData.confirmPassword) {
        alert('两次输入的密码不一致');
        return;
      }
      const newUser: User = {
        id: String(users.length + 1),
        username: formData.username,
        role: formData.role,
        email: formData.email,
        lastLogin: new Date().toISOString(),
        status: 'active'
      };
      setUsers(prev => [...prev, newUser]);
    }
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">用户管理</h1>
          <p className="text-text-secondary mt-1">管理系统用户和权限</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" />新建用户
        </motion.button>
      </div>

      <div className="glass-card rounded-xl p-4 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="搜索用户名或邮箱..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-card-bg border-b border-border-color">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">用户名</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">角色</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">邮箱</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">最后登录</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">状态</th>
              <th className="px-6 py-4 text-left text-sm font-medium text-text-secondary">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user, index) => (
              <motion.tr
                key={user.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="table-row border-b border-border-color/50 last:border-0"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-primary text-sm font-medium">{user.username[0].toUpperCase()}</span>
                    </div>
                    <span className="text-sm font-medium text-text-primary">{user.username}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-text-secondary">{roleOptions.find(r=>r.id===user.role)?.name||user.role||'-'}</td>
                <td className="px-6 py-4 text-sm text-text-secondary">{user.email}</td>
                <td className="px-6 py-4 text-sm text-text-secondary">{user.lastLogin ? new Date(user.lastLogin).toLocaleString('zh-CN') : '-'}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleStatus(user.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      user.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {user.status === 'active' ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                    {user.status === 'active' ? '启用' : '禁用'}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleEdit(user)}
                      className="p-2 text-text-secondary hover:text-primary transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setResetPwdModal({open:true, userId:user.id, username:user.username})}
                      className="p-2 text-text-secondary hover:text-amber-400 transition-colors"
                      title="重置密码"
                    >
                      <Key className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDelete(user.id)}
                      className="p-2 text-text-secondary hover:text-critical transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
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
                className="glass-card rounded-xl p-6 w-[500px] pointer-events-auto max-h-[80vh] overflow-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-text-primary">
                    {editingUser ? '编辑用户' : '新建用户'}
                  </h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="p-2 text-text-secondary hover:text-text-primary"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-text-secondary text-sm mb-2">用户名</label>
                    <div className="relative">
                      <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        placeholder="输入用户名"
                        className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">邮箱</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="输入邮箱地址"
                        className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-text-secondary text-sm mb-2">角色</label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                      >
                        {roleOptions.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!editingUser && (
                    <>
                      <div>
                        <label className="block text-text-secondary text-sm mb-2">密码</label>
                        <div className="relative">
                          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            placeholder="输入密码"
                            className="w-full pl-10 pr-12 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                          />
                          <button
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-text-secondary text-sm mb-2">确认密码</label>
                        <div className="relative">
                          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            placeholder="再次输入密码"
                            className="w-full pl-10 pr-4 py-2 bg-page-bg border border-border-color rounded-lg text-text-primary focus:border-primary focus:outline-none"
                          />
                        </div>
                      </div>
                    </>
                  )}
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
                    disabled={!formData.username || !formData.email || (!editingUser && (!formData.password || formData.password !== formData.confirmPassword))}
                    className="px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white rounded-lg"
                  >
                    {editingUser ? '保存' : '创建'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* 密码重置弹窗 */}
      <AnimatePresence>{resetPwdModal.open&&(
        <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.95}}
            className="bg-card-bg border border-border-color rounded-2xl p-5 w-full max-w-sm mx-4 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"><Key className="w-4 h-4 text-amber-400"/>重置密码</h3>
            <p className="text-xs text-text-muted mb-4">为用户 <strong>{resetPwdModal.username}</strong> 设置新密码</p>
            <input value={resetPwdValue} onChange={e=>setResetPwdValue(e.target.value)} type="text"
              placeholder="输入新密码（至少6位）"
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-xl text-sm text-text-primary placeholder:text-text-muted/40 mb-4 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all outline-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={()=>{setResetPwdModal({open:false,userId:'',username:''});setResetPwdValue('');}}
                className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-card-bg-hover">取消</button>
              <button onClick={async()=>{
                if (!resetPwdValue || resetPwdValue.length < 6) return;
                try {
                  const r = await apiRequest('/users-api/users/'+resetPwdModal.userId+'/reset-password', {
                    method:'POST', body:{password: resetPwdValue}
                  });
                  if (r.success) addToast('success', '密码已重置');
                  else addToast('error', r.error||'重置失败');
                } catch(e:any) { addToast('error', e.message); }
                setResetPwdModal({open:false,userId:'',username:''});
                setResetPwdValue('');
              }}
                className="px-4 py-2 bg-gradient-to-br from-amber-600 to-orange-600 text-white rounded-lg text-xs font-medium hover:from-amber-500 hover:to-orange-500 transition-all disabled:opacity-40"
                disabled={!resetPwdValue||resetPwdValue.length<6}>
                确认重置
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}
