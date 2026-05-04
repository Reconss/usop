import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Monitor, AppWindow, Network, FileText, Plus, Edit3, Trash2, X, Save, AlertCircle, Eye, Link2, Database, GitBranch, CheckCircle } from 'lucide-react';

interface LogType {
  id: string;
  name: string;
  description: string;
  icon: string;
  sourceCount: number;
  pipelineCount: number;
  color: string;
  pipelineId?: string;
  pipelineName?: string;
}

interface ParsePipeline {
  id: string;
  name: string;
  parser: string;
}

const iconMap: Record<string, React.ElementType> = { Shield, Monitor, AppWindow, Network, FileText };
const colorOptions = [
  { name: '红色', value: 'text-rose-600 bg-rose-50 border-rose-200' },
  { name: '蓝色', value: 'text-blue-600 bg-blue-50 border-blue-200' },
  { name: '绿色', value: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { name: '橙色', value: 'text-amber-600 bg-amber-50 border-amber-200' },
  { name: '紫色', value: 'text-purple-600 bg-purple-50 border-purple-200' },
  { name: '灰色', value: 'text-slate-600 bg-slate-50 border-slate-200' }
];

const mockLogTypes: LogType[] = [
  { id: 'lt-001', name: '安全日志', description: '防火墙、IDS/IPS、WAF等安全设备日志', icon: 'Shield', sourceCount: 12, pipelineCount: 5, color: 'text-rose-600 bg-rose-50 border-rose-200', pipelineId: 'p3', pipelineName: 'CEF安全事件' },
  { id: 'lt-002', name: '系统日志', description: '操作系统、服务器系统日志', icon: 'Monitor', sourceCount: 8, pipelineCount: 3, color: 'text-blue-600 bg-blue-50 border-blue-200', pipelineId: 'p2', pipelineName: 'Syslog RFC5424' },
  { id: 'lt-003', name: '应用日志', description: '业务应用、中间件日志', icon: 'AppWindow', sourceCount: 15, pipelineCount: 7, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', pipelineId: 'p1', pipelineName: 'JSON标准解析' },
  { id: 'lt-004', name: '网络日志', description: '路由器、交换机、DNS日志', icon: 'Network', sourceCount: 6, pipelineCount: 2, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'lt-005', name: '审计日志', description: '用户操作、权限变更审计日志', icon: 'FileText', sourceCount: 4, pipelineCount: 2, color: 'text-purple-600 bg-purple-50 border-purple-200' }
];

const mockPipelines: ParsePipeline[] = [
  { id: 'p1', name: 'JSON标准解析', parser: 'json' },
  { id: 'p2', name: 'Syslog RFC5424', parser: 'syslog' },
  { id: 'p3', name: 'CEF安全事件', parser: 'cef' },
  { id: 'p4', name: 'Grok自定义', parser: 'grok' },
  { id: 'p5', name: '智能识别', parser: 'auto' }
];

const mockSources = ['Kafka-安全日志', 'Syslog-网络设备', 'S3-审计日志'];

export default function LogTypeManager() {
  const [logTypes, setLogTypes] = useState<LogType[]>(mockLogTypes);
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [editingType, setEditingType] = useState<LogType | null>(null);
  const [selectedType, setSelectedType] = useState<LogType | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    description: '', 
    icon: 'FileText', 
    color: colorOptions[0].value,
    pipelineId: ''
  });

  const handleSave = () => {
    if (!formData.name.trim()) return;
    const pipeline = mockPipelines.find(p => p.id === formData.pipelineId);
    if (editingType) {
      setLogTypes(prev => prev.map(lt => lt.id === editingType.id ? { 
        ...lt, 
        ...formData,
        pipelineName: pipeline?.name
      } : lt));
    } else {
      setLogTypes(prev => [...prev, { 
        ...formData, 
        id: `lt-${Date.now()}`, 
        sourceCount: 0, 
        pipelineCount: 0,
        pipelineName: pipeline?.name
      }]);
    }
    closeModal();
  };

  const handleDelete = () => {
    if (selectedType) {
      setLogTypes(prev => prev.filter(lt => lt.id !== selectedType.id));
      setShowDelete(false);
      setSelectedType(null);
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
      pipelineId: type.pipelineId || ''
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
      pipelineId: type.pipelineId || ''
    });
    setShowPipelineModal(true);
  };

  const savePipeline = () => {
    if (selectedType) {
      const pipeline = mockPipelines.find(p => p.id === formData.pipelineId);
      setLogTypes(prev => prev.map(lt => lt.id === selectedType.id ? {
        ...lt,
        pipelineId: formData.pipelineId,
        pipelineName: pipeline?.name
      } : lt));
      setShowPipelineModal(false);
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
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus size={16} /> 添加类型
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {logTypes.map((type, index) => {
          const Icon = iconMap[type.icon] || FileText;
          const colorClass = type.color.split(' ')[0];
          const bgClass = type.color.split(' ')[1];
          const borderClass = type.color.split(' ')[2];
          return (
            <motion.div
              key={type.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -2 }}
              onClick={() => openDetail(type)}
              className="bg-card-bg border border-border-color rounded-xl p-5 hover:border-blue-300 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${bgClass} ${borderClass} ${colorClass}`}>
                  <Icon size={24} />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => openEdit(type, e)} 
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button 
                    onClick={(e) => confirmDelete(type, e)} 
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 className="font-medium text-text-primary mb-1">{type.name}</h3>
              <p className="text-sm text-text-muted mb-4">{type.description}</p>
              
              {type.pipelineName ? (
                <div className="flex items-center gap-2 mb-3 p-2 bg-page-bg/50 rounded-lg">
                  <GitBranch size={14} className="text-blue-600" />
                  <span className="text-xs text-text-secondary">{type.pipelineName}</span>
                </div>
              ) : (
                <button
                  onClick={(e) => openPipelineModal(type, e)}
                  className="flex items-center gap-2 mb-3 px-3 py-2 text-xs text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors w-full"
                >
                  <Link2 size={12} /> 绑定解析管道
                </button>
              )}
              
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span className="flex items-center gap-1"><Database size={12} /> {type.sourceCount} 数据源</span>
                <span className="flex items-center gap-1"><GitBranch size={12} /> {type.pipelineCount} 管道</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
            onClick={closeModal}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[450px] shadow-xl" 
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-text-primary">{editingType ? '编辑日志类型' : '添加日志类型'}</h2>
                <button onClick={closeModal} className="p-2 text-gray-400 hover:text-text-secondary rounded-lg hover:bg-page-bg">
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
                    className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                    placeholder="输入类型名称" 
                  />
                </div>
                <div>
                  <label className="block text-text-secondary text-sm font-medium mb-2">描述</label>
                  <textarea 
                    value={formData.description} 
                    onChange={e => setFormData({ ...formData, description: e.target.value })} 
                    className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary h-20 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
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
                              ? 'bg-blue-100 text-blue-600 border border-blue-300' 
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
                <div>
                  <label className="block text-text-secondary text-sm font-medium mb-2 flex items-center gap-2">
                    <GitBranch size={14} /> 绑定解析管道
                  </label>
                  <select 
                    value={formData.pipelineId} 
                    onChange={e => setFormData({ ...formData, pipelineId: e.target.value })} 
                    className="w-full px-3 py-2 bg-card-bg border border-border-color rounded-lg text-text-primary focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">不绑定</option>
                    {mockPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-border-color mt-6">
                <button onClick={closeModal} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm">取消</button>
                <button 
                  onClick={handleSave} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium"
                >
                  <Save size={16} /> 保存
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
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
            onClick={() => setShowPipelineModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[400px] shadow-xl" 
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">绑定解析管道</h2>
                  <p className="text-sm text-text-muted mt-1">为 {selectedType.name} 选择解析管道</p>
                </div>
                <button onClick={() => setShowPipelineModal(false)} className="p-2 text-gray-400 hover:text-text-secondary rounded-lg hover:bg-page-bg">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-2">
                {mockPipelines.map(pipeline => (
                  <button
                    key={pipeline.id}
                    onClick={() => setFormData({ ...formData, pipelineId: pipeline.id })}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      formData.pipelineId === pipeline.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-border-color hover:border-border-color'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      formData.pipelineId === pipeline.id ? 'bg-blue-600 border-blue-600' : 'border-border-color'
                    }`}>
                      {formData.pipelineId === pipeline.id && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-text-primary">{pipeline.name}</div>
                      <div className="text-xs text-text-muted">{pipeline.parser}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-border-color mt-6">
                <button onClick={() => setShowPipelineModal(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm">取消</button>
                <button 
                  onClick={savePipeline} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
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
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
            onClick={() => setShowDetail(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[500px] shadow-xl" 
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
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
                <button onClick={() => setShowDetail(false)} className="p-2 text-gray-400 hover:text-text-secondary rounded-lg hover:bg-page-bg">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                {selectedType.pipelineName && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-xs text-blue-600 mb-1 flex items-center gap-1">
                      <GitBranch size={12} /> 绑定解析管道
                    </div>
                    <div className="font-medium text-text-primary">{selectedType.pipelineName}</div>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                    <Database size={16} /> 关联数据源 ({selectedType.sourceCount})
                  </h3>
                  <div className="space-y-1">
                    {mockSources.slice(0, selectedType.sourceCount).map((s, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-page-bg/50 rounded-lg text-sm text-text-secondary">
                        <Link2 size={14} /> {s}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                    <GitBranch size={16} /> 关联解析管道 ({selectedType.pipelineCount})
                  </h3>
                  <div className="space-y-1">
                    {mockPipelines.slice(0, selectedType.pipelineCount).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-page-bg/50 rounded-lg text-sm text-text-secondary">
                        <Link2 size={14} /> {p.name}
                      </div>
                    ))}
                  </div>
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
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
            onClick={() => setShowDelete(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }} 
              className="bg-card-bg border border-border-color rounded-xl p-6 w-[400px] shadow-xl" 
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle size={24} className="text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-text-primary">确认删除</h2>
              </div>
              <p className="text-text-secondary mb-6">
                确定要删除日志类型 <span className="font-medium text-text-primary">{selectedType.name}</span> 吗？
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm">取消</button>
                <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">确认删除</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
