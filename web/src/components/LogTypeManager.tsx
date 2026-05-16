import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Monitor, AppWindow, Network, FileText, Plus, Edit3, Trash2, X, Save, AlertCircle, Eye, Link2, Database, GitBranch, CheckCircle, Loader2 } from 'lucide-react';
import { logTypesApi, dataSourcesApi } from '../services/api';

interface LogType {
  id: number | string;
  name: string;
  description: string;
  category: string;
  sourceCount: number;
  pipelineCount: number;
  color: string;
  pipelineId?: number | string;
  pipelineName?: string;
}

interface ParsePipeline {
  id: number;
  name: string;
  parser: string;
}

const iconMap: Record<string, React.ElementType> = { Shield, Monitor, AppWindow, Network, FileText };
const colorOptions = [
  { name: '主色', value: 'text-primary bg-primary/10 border-primary/20' },
  { name: '红色', value: 'text-red-600 bg-red-50 border-red-200' },
  { name: '绿色', value: 'text-green-600 bg-green-50 border-green-200' },
  { name: '橙色', value: 'text-amber-600 bg-amber-50 border-amber-200' },
  { name: '紫色', value: 'text-purple-600 bg-purple-50 border-purple-200' },
  { name: '灰色', value: 'text-text-secondary bg-page-bg border-border-color' }
];

export default function LogTypeManager() {
  const [logTypes, setLogTypes] = useState<LogType[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [editingType, setEditingType] = useState<LogType | null>(null);
  const [selectedType, setSelectedType] = useState<LogType | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pipelines, setPipelines] = useState<ParsePipeline[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'FileText',
    color: colorOptions[0].value,
    pipelineId: ''
  });

  // 从API获取数据
  const fetchData = async () => {
    try {
      setLoading(true);
      const [logTypesRes, dataSourcesRes, pipelinesRes] = await Promise.allSettled([
        logTypesApi.getLogTypes({ page_size: 100 }),
        dataSourcesApi.getDataSources({ page_size: 100 }),
        fetch('/api/pipelines?page_size=100').then(r => r.json()).catch(() => ({})),
      ]);

      if (logTypesRes.status === 'fulfilled' && logTypesRes.value.success) {
        const items = Array.isArray(logTypesRes.value.data) ? logTypesRes.value.data : logTypesRes.value.data?.items || [];
        const sourcesItems = dataSourcesRes.status === 'fulfilled' && dataSourcesRes.value.success
          ? (Array.isArray(dataSourcesRes.value.data) ? dataSourcesRes.value.data : dataSourcesRes.value.data?.items || [])
          : [];
        const pipelinesItems = pipelinesRes.status === 'fulfilled' && pipelinesRes.value?.data
          ? (Array.isArray(pipelinesRes.value.data) ? pipelinesRes.value.data : pipelinesRes.value.data?.items || [])
          : [];

        setPipelines(pipelinesItems.map((p: any) => ({ id: p.id, name: p.name, parser: p.input_format || 'json' })));
        setSources(sourcesItems.map((item: any) => `${item.source_type || 'Unknown'}-${item.name || '未命名'}`));

        setLogTypes(items.map((item: any, index: number) => {
          const sourceCount = sourcesItems.filter((s: any) => s.log_type_id === item.id).length;
          const pipeCount = pipelinesItems.filter((p: any) => p.log_type_id === item.id || p.log_type_id === String(item.id)).length;
          return {
            id: item.id,
            name: item.name || item.type_name,
            description: item.description || '',
            category: item.category || 'other',
            sourceCount,
            pipelineCount: pipeCount,
            color: colorOptions[index % colorOptions.length].value,
            pipelineId: item.pipeline_id,
            pipelineName: item.pipeline_name
          };
        }));
      }
    } catch (error) {
      console.error('获取日志类型失败:', error);
      setLogTypes([]);
      setSources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        category: editingType?.category || 'other',
      };
      if (editingType) {
        await logTypesApi.updateLogType(editingType.id, payload);
        setLogTypes(prev => prev.map(lt => lt.id === editingType.id ? { ...lt, ...payload } : lt));
      } else {
        const res = await logTypesApi.createLogType(payload);
        if (res.success && res.data) {
          const item = res.data;
          setLogTypes(prev => [...prev, {
            id: item.id,
            name: item.name || '',
            description: item.description || '',
            category: item.category || 'other',
            sourceCount: 0,
            pipelineCount: 0,
            color: colorOptions[0].value,
            pipelineId: item.pipeline_id,
            pipelineName: item.pipeline_name
          }]);
        }
      }
      closeModal();
    } catch (error) {
      console.error('保存日志类型失败:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedType) return;
    setDeleting(true);
    try {
      await logTypesApi.deleteLogType(selectedType.id);
      setLogTypes(prev => prev.filter(lt => lt.id !== selectedType.id));
      setShowDelete(false);
      setSelectedType(null);
    } catch (error) {
      console.error('删除日志类型失败:', error);
    } finally {
      setDeleting(false);
    }
  };

  const openAdd = () => {
    setEditingType(null);
    setFormData({ name: '', description: '', icon: 'FileText', color: colorOptions[0].value, pipelineId: '' });
    setShowModal(true);
  };

  const openEdit = (type: LogType, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingType(type);
    setFormData({ 
      name: type.name, 
      description: type.description, 
      icon: type.icon, 
      color: type.color,
      pipelineId: type.pipelineId ? String(type.pipelineId) : ''
    });
    setShowModal(true);
  };

  const openDetail = (type: LogType) => {
    setSelectedType(type);
    setShowDetail(true);
  };

  const openPipelineModal = (type: LogType, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedType(type);
    setFormData({
      name: type.name,
      description: type.description,
      icon: type.icon,
      color: type.color,
      pipelineId: type.pipelineId ? String(type.pipelineId) : ''
    });
    setShowPipelineModal(true);
  };

  const savePipeline = async () => {
    if (!selectedType || !formData.pipelineId) return;
    try {
      const pipelineId = Number(formData.pipelineId);
      const pipeline = pipelines.find(p => p.id === pipelineId);
      await logTypesApi.updateLogType(selectedType.id, { pipeline_id: pipelineId });
      setLogTypes(prev => prev.map(lt => lt.id === selectedType.id ? {
        ...lt,
        pipelineId,
        pipelineName: pipeline?.name || ''
      } : lt));
      setShowPipelineModal(false);
    } catch (error) {
      console.error('绑定管道失败:', error);
    }
  };

  const confirmDelete = (type: LogType, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedType(type);
    setShowDelete(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingType(null);
    setFormData({ name: '', description: '', icon: 'FileText', color: colorOptions[0].value, pipelineId: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">日志类型</h2>
          <p className="text-sm text-text-muted mt-1">管理日志分类，关联数据源和解析管道</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium"
        >
          <Plus size={16} /> 添加类型
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {logTypes.map((type, index) => {
            const Icon = iconMap[type.icon] || FileText;
            return (
              <motion.div
                key={type.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ x: 4 }}
                onClick={() => openDetail(type)}
                className="flex items-center gap-4 p-4 bg-card-bg border border-border-color rounded-xl hover:border-primary/30 transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 flex-shrink-0">
                  <Icon size={24} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text-primary">{type.name}</h3>
                    {type.pipelineName ? (
                      <span className="px-2 py-0.5 text-xs rounded font-medium bg-primary/10 text-primary flex items-center gap-1">
                        <GitBranch size={10} /> {type.pipelineName}
                      </span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); openPipelineModal(type, e); }}
                        className="px-2 py-0.5 text-xs rounded font-medium text-text-muted hover:text-primary border border-dashed border-border-color hover:border-primary/30 transition-colors"
                      >
                        + 绑定管道
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{type.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
                    <span className="flex items-center gap-1"><Database size={11} /> {type.sourceCount} 数据源</span>
                    <span className="flex items-center gap-1"><GitBranch size={11} /> {type.pipelineCount} 管道</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={(e) => openEdit(type, e)}
                    className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={(e) => confirmDelete(type, e)}
                    className="p-1.5 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-lg shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border-color pb-6 mb-6">
                <h2 className="text-lg font-semibold text-text-primary">{editingType ? '编辑日志类型' : '添加日志类型'}</h2>
                <button onClick={closeModal} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-text-secondary text-sm font-medium mb-2">类型名称</label>
                  <input 
                    type="text" 
                    value={formData.name} 
                    onChange={e => setFormData({ ...formData, name: e.target.value })} 
                    className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                    placeholder="输入类型名称"
                  />
                </div>
                <div>
                  <label className="block text-text-secondary text-sm font-medium mb-2">描述</label>
                  <textarea 
                    value={formData.description} 
                    onChange={e => setFormData({ ...formData, description: e.target.value })} 
                    className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary h-20 resize-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
                    placeholder="输入描述"
                  />
                </div>
                <div>
                  <label className="block text-text-secondary text-sm font-medium mb-2">图标</label>
                  <div className="flex gap-2">
                    {Object.keys(iconMap).map(icon => {
                      const Icon = iconMap[icon];
                      return (
                        <button 
                          key={icon} 
                          onClick={() => setFormData({ ...formData, icon })} 
                          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                            formData.icon === icon
                              ? 'bg-primary/10 text-primary border border-primary/30'
                              : 'bg-page-bg/50 text-text-muted border border-border-color hover:border-border-color'
                          }`}
                        >
                          <Icon size={20} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-text-secondary text-sm font-medium mb-2">颜色</label>
                  <div className="flex gap-2">
                    {colorOptions.map(c => (
                      <button 
                        key={c.name} 
                        onClick={() => setFormData({ ...formData, color: c.value })} 
                        className={`w-8 h-8 rounded-lg ${c.value.split(' ')[1]} ${
                          formData.color === c.value ? 'ring-2 ring-gray-900 ring-offset-2' : ''
                        }`} 
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-border-color mt-6">
                <button onClick={closeModal} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium">取消</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showPipelineModal && selectedType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowPipelineModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-md shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border-color pb-6 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">绑定解析管道</h2>
                  <p className="text-sm text-text-muted mt-1">为 {selectedType.name} 选择解析管道</p>
                </div>
                <button onClick={() => setShowPipelineModal(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-text-secondary mb-4">为 {selectedType.name} 选择解析管道</p>
              {pipelines.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {pipelines.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setFormData({ ...formData, pipelineId: String(p.id) })}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        formData.pipelineId === String(p.id)
                          ? 'border-primary bg-primary/10'
                          : 'border-border-color hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          formData.pipelineId === String(p.id) ? 'bg-primary border-primary' : 'border-border-color'
                        }`}>
                          {formData.pipelineId === String(p.id) && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="px-1.5 py-0.5 text-xs bg-page-bg rounded font-medium">{p.parser}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted mb-4">暂无可用解析管道</p>
              )}
              <div className="flex justify-end gap-3 pt-4 border-t border-border-color mt-4">
                <button onClick={() => setShowPipelineModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium">取消</button>
                <button
                  onClick={savePipeline}
                  disabled={!formData.pipelineId}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium disabled:opacity-50"
                >
                  保存绑定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDetail && selectedType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-lg shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border-color pb-6 mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${selectedType.color}`}>
                    {(() => {
                      const Icon = iconMap[selectedType.icon] || FileText;
                      return <Icon size={24} />;
                    })()}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">{selectedType.name}</h2>
                    <p className="text-sm text-text-muted">{selectedType.description}</p>
                  </div>
                </div>
                <button onClick={() => setShowDetail(false)} className="p-2 text-text-muted hover:text-text-secondary rounded-lg hover:bg-page-bg transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                {selectedType.pipelineName && (
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <div className="text-xs text-primary mb-1 flex items-center gap-1">
                      <GitBranch size={12} /> 绑定解析管道
                    </div>
                    <div className="font-medium text-text-primary">{selectedType.pipelineName}</div>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                    <Database size={16} /> 关联数据源 ({selectedType.sourceCount})
                  </h3>
                  <p className="text-sm text-text-muted">暂无关联数据源</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                    <GitBranch size={16} /> 关联解析管道 ({selectedType.pipelineCount})
                  </h3>
                  <p className="text-sm text-text-muted">暂无关联解析管道</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showDelete && selectedType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowDelete(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card-bg border border-border-color rounded-xl p-6 w-full max-w-md shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 pb-6 mb-6 border-b border-border-color">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <AlertCircle size={24} className="text-rose-600" />
                </div>
                <h2 className="text-lg font-semibold text-text-primary">确认删除</h2>
              </div>
              <p className="text-text-secondary mb-6">
                确定要删除日志类型 <span className="font-medium text-text-primary">{selectedType.name}</span> 吗？
              </p>
              <div className="flex justify-end gap-3 pt-4 border-t border-border-color">
                <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium">取消</button>
                <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-sm font-medium disabled:opacity-50">
                  {deleting ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
