import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Download, Upload, Loader2, CheckCircle2, AlertTriangle, X, FileJson, Info, ShieldCheck
} from 'lucide-react';
import { backupApi } from '../services/api';
import {
  Button,
  ContentContainer,
  PageHeader,
  SectionCard,
} from '../components/ui';

const Toast: React.FC<{ msg: string; type: 'success' | 'error' | 'info'; onClose: () => void }> = ({ msg, type, onClose }) => {
  const tone =
    type === 'success'
      ? 'border-success/30 text-success'
      : type === 'error'
        ? 'border-danger/30 text-danger'
        : 'border-info/30 text-info';
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertTriangle : Info;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`fixed right-4 top-16 z-toast flex max-w-sm items-center gap-2 rounded-lg border bg-card-bg px-4 py-2.5 shadow-panel ${tone}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-[13px]">{msg}</span>
      <button onClick={onClose} aria-label="关闭" className="opacity-60 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
};

const SystemBackup: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const res: any = await backupApi.exportBackup();
      if (res?.success) {
        const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usop_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('备份导出成功', 'success');
      } else showToast(res?.error || '导出失败', 'error');
    } catch (e: any) { showToast('导出失败: ' + e.message, 'error'); }
    finally { setExporting(false); }
  };

  const doImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res: any = await backupApi.importBackup(payload);
      if (res?.success) {
        const s = res.data?.summary || {};
        const total = Object.values(s).reduce((a: number, b: any) => a + (b || 0), 0);
        showToast(`还原完成，共写入/更新 ${total} 条记录`, 'success');
      } else showToast(res?.error || '还原失败', 'error');
    } catch (e: any) { showToast('还原失败: ' + e.message, 'error'); }
    finally { setImporting(false); }
  };

  return (
    <ContentContainer width="form">
      <AnimatePresence>{toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}</AnimatePresence>

      <PageHeader
        title="系统备份与还原"
        icon={Database}      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard
          title="导出配置"
          icon={Download}
          description="生成带版本号的 JSON 配置包"
          footer={
            <Button
              variant="primary"
              icon={exporting ? Loader2 : FileJson}
              loading={exporting}
              onClick={doExport}
            >
              {exporting ? '正在导出…' : '导出备份'}
            </Button>
          }
        >
          <p className="text-[12.5px] leading-relaxed text-text-secondary">
            将核心 SOC 配置（角色、日志类型、格式模板、管道、数据源、规则、告警字段、IP 名单、STE 经验等）导出为带版本号的 JSON 包。
          </p>
          <div className="callout callout-warning mt-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>出于安全考虑，备份不包含 users 表（含密码哈希）与海量时序告警。</span>
          </div>
        </SectionCard>

        <SectionCard
          title="还原配置"
          icon={Upload}
          description="上传备份包，按主键合并写入"
          footer={
            <label
              className={`app-btn app-btn-secondary cursor-pointer ${
                importing ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? '正在还原…' : '选择备份文件 (.json)'}
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                disabled={importing}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }}
              />
            </label>
          }
        >
          <p className="text-[12.5px] leading-relaxed text-text-secondary">
            上传此前导出的 JSON 备份包。按主键 merge：已存在则更新、不存在则插入，按依赖顺序导入，兼容字段级增量。
          </p>
          <div className="callout callout-info mt-3">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>还原会覆盖同名配置的主键记录，但不影响时序告警数据与用户账户。建议还原前先导出当前配置作为快照。</span>
          </div>
        </SectionCard>
      </div>

      <div className="callout">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
        <span>
          备份包中的表结构与当前版本字段兼容时才会写入；缺少的字段按默认值补齐，不会中断导入流程。
        </span>
      </div>
    </ContentContainer>
  );
};

export default SystemBackup;
