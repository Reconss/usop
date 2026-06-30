/**
 * StreamManager — 流管理组件
 *
 * 功能：
 *  - 创建 / 编辑 / 删除 Stream（匹配规则 → 指定 ES 索引）
 *  - Stream 作为告警页面 Tab 或侧栏
 *  - 点击 Stream 切换过滤
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers, Plus, Edit3, Trash2, Play, Pause, ChevronRight,
  X, Save, AlertTriangle, Loader2, Filter
} from 'lucide-react';
import { alertsApi } from '../services/api';

interface StreamRule {
  field: string;
  value: string;
  type?: 'include' | 'exclude';
}

interface Stream {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
  rules: StreamRule[];
  disabled: boolean;
  index_prefix?: string;
  created_at?: string;
}

interface StreamManagerProps {
  activeStreamId?: string | null;
  onStreamSelect?: (stream: Stream | null) => void;
  className?: string;
}

export const StreamManager: React.FC<StreamManagerProps> = ({
  activeStreamId, onStreamSelect, className = '',
}) => {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingStream, setEditingStream] = useState<Stream | null>(null);
  const [form, setForm] = useState<Partial<Stream>>({ name: '', description: '', rules: [], disabled: false });
  const [saving, setSaving] = useState(false);

  const loadStreams = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await alertsApi.getStreams();
      setStreams(resp?.data || []);
    } catch {
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStreams(); }, [loadStreams]);

  const handleCreate = () => {
    setEditingStream(null);
    setForm({ name: '', description: '', rules: [{ field: 'severity', value: '', type: 'include' }], disabled: false });
    setShowForm(true);
  };

  const handleEdit = (stream: Stream) => {
    setEditingStream(stream);
    setForm({
      name: stream.name,
      description: stream.description,
      rules: stream.rules?.length > 0 ? stream.rules : [{ field: 'severity', value: '', type: 'include' }],
      disabled: stream.disabled,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      if (editingStream?._id || editingStream?.id) {
        await alertsApi.updateStream(editingStream._id || editingStream.id!, form);
      } else {
        await alertsApi.createStream(form);
      }
      setShowForm(false);
      loadStreams();
    } catch (e) {
      console.error('Stream 保存失败:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stream: Stream) => {
    if (!confirm(`确定删除 Stream "${stream.name}"？`)) return;
    try {
      await alertsApi.deleteStream(stream._id || stream.id!);
      if (activeStreamId === (stream._id || stream.id)) {
        onStreamSelect?.(null);
      }
      loadStreams();
    } catch (e) {
      console.error('Stream 删除失败:', e);
    }
  };

  const handleToggle = async (stream: Stream) => {
    try {
      await alertsApi.updateStream(stream._id || stream.id!, { disabled: !stream.disabled });
      loadStreams();
    } catch (e) {
      console.error('Stream 切换失败:', e);
    }
  };

  const addRule = () => {
    setForm(prev => ({
      ...prev,
      rules: [...(prev.rules || []), { field: 'severity', value: '', type: 'include' }],
    }));
  };

  const updateRule = (index: number, patch: Partial<StreamRule>) => {
    setForm(prev => ({
      ...prev,
      rules: (prev.rules || []).map((r, i) => i === index ? { ...r, ...patch } : r),
    }));
  };

  const removeRule = (index: number) => {
    setForm(prev => ({
      ...prev,
      rules: (prev.rules || []).filter((_, i) => i !== index),
    }));
  };

  return (
    <div className={`flex flex-col bg-card-bg border border-border-color rounded-xl overflow-hidden ${className}`}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-text-primary">Streams</span>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-primary/10 text-primary rounded-lg
                     hover:bg-primary/20 transition-colors"
        >
          <Plus className="w-3 h-3" />
          新建
        </button>
      </div>

      {/* "全部" 选项 */}
      <div
        onClick={() => onStreamSelect?.(null)}
        className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors border-b border-border-color/50
          ${!activeStreamId
            ? 'bg-primary/10 text-primary'
            : 'text-text-secondary hover:bg-white/[0.03]'
          }`}
      >
        <Filter className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">全部告警</span>
      </div>

      {/* Stream 列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-text-muted animate-spin" />
          </div>
        ) : streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted text-xs">
            <Layers className="w-6 h-6 mb-2 opacity-30" />
            <span>暂无 Stream</span>
            <span className="text-[10px] mt-1">点击上方"新建"创建</span>
          </div>
        ) : (
          streams.map((stream) => {
            const sid = stream._id || stream.id || '';
            const isActive = activeStreamId === sid;

            return (
              <div
                key={sid}
                className={`group flex items-center gap-2 px-4 py-2.5 border-b border-border-color/30
                  cursor-pointer transition-colors
                  ${isActive ? 'bg-primary/8' : 'hover:bg-white/[0.03]'}`}
              >
                <div
                  className="flex-1 min-w-0 flex items-center gap-2"
                  onClick={() => onStreamSelect?.(stream)}
                >
                  <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-transform
                    ${isActive ? 'text-primary rotate-90' : 'text-text-muted'}`} />
                  <div className="min-w-0">
                    <div className={`text-xs font-medium truncate
                      ${isActive ? 'text-primary' : 'text-text-primary'}`}>
                      {stream.name}
                    </div>
                    {stream.rules && stream.rules.length > 0 && (
                      <div className="text-[10px] text-text-muted truncate mt-0.5">
                        {stream.rules.map(r => `${r.field}:${r.value}`).join(' + ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggle(stream); }}
                    className={`p-1 rounded transition-colors
                      ${stream.disabled ? 'text-text-muted hover:text-amber-400' : 'text-emerald-400 hover:text-emerald-300'}`}
                    title={stream.disabled ? '启用' : '禁用'}
                  >
                    {stream.disabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(stream); }}
                    className="p-1 text-text-muted hover:text-primary rounded transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(stream); }}
                    className="p-1 text-text-muted hover:text-rose-400 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 创建/编辑表单弹窗 */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card-bg rounded-2xl p-6 w-full max-w-lg border border-border-color"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-text-primary">
                  {editingStream ? '编辑 Stream' : '新建 Stream'}
                </h3>
                <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-secondary">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* 名称 */}
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">名称 <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    value={form.name || ''}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2.5 bg-page-bg border border-border-color rounded-xl text-sm text-text-primary
                               focus:border-primary focus:outline-none"
                    placeholder="Stream 名称"
                  />
                </div>

                {/* 描述 */}
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">描述</label>
                  <input
                    type="text"
                    value={form.description || ''}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2.5 bg-page-bg border border-border-color rounded-xl text-sm text-text-primary
                               focus:border-primary focus:outline-none"
                    placeholder="可选描述"
                  />
                </div>

                {/* 匹配规则 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-text-muted">匹配规则</label>
                    <button onClick={addRule} className="text-xs text-primary hover:text-primary/80">+ 添加规则</button>
                  </div>
                  <div className="space-y-2">
                    {(form.rules || []).map((rule, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          value={rule.type || 'include'}
                          onChange={e => updateRule(i, { type: e.target.value as any })}
                          className="bg-page-bg border border-border-color rounded-lg px-2 py-2 text-xs text-text-secondary focus:outline-none"
                        >
                          <option value="include">包含</option>
                          <option value="exclude">排除</option>
                        </select>
                        <input
                          type="text"
                          value={rule.field}
                          onChange={e => updateRule(i, { field: e.target.value })}
                          className="w-28 bg-page-bg border border-border-color rounded-lg px-2 py-2 text-xs text-text-primary font-mono focus:outline-none"
                          placeholder="字段"
                        />
                        <span className="text-xs text-text-muted">:</span>
                        <input
                          type="text"
                          value={rule.value}
                          onChange={e => updateRule(i, { value: e.target.value })}
                          className="flex-1 bg-page-bg border border-border-color rounded-lg px-2 py-2 text-xs text-text-primary font-mono focus:outline-none"
                          placeholder="值"
                        />
                        <button onClick={() => removeRule(i)} className="p-1 text-text-muted hover:text-rose-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 bg-page-bg text-text-secondary rounded-xl hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name?.trim() || saving}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50
                             transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StreamManager;
