import React, { useCallback, useEffect, useState } from 'react';
import {
  Plug, Download, Trash2, KeyRound, Play, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, Globe, Layers, FileJson, Loader2, Link2
} from 'lucide-react';
import {
  ContentContainer, PageHeader, SectionCard, Button, StatCard, Modal, EmptyState, LoadingState, Switch
} from '../components/ui';
import { integrationsApi } from '../services/api';

interface AppParam {
  name: string; in: string; type: string; required: boolean; desc: string; default?: any;
}
interface AppAction {
  id: string; name: string; description: string; method: string; path: string;
  params: AppParam[]; body: any;
}
interface IntegrationApp {
  id: number; app_key: string; name: string; description: string; version: string;
  categories: string[]; base_url: string; auth_type: string; auth_config: any;
  has_credential: boolean; credential_masked: string; action_count: number;
  source: string; spec_format: string; enabled: boolean;
  created_at: string; updated_at: string; actions?: AppAction[];
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-primary/15 text-primary',
  POST: 'bg-success/15 text-success',
  PUT: 'bg-warning/15 text-warning',
  DELETE: 'bg-danger/15 text-danger',
  PATCH: 'bg-warning/15 text-warning',
};

const AUTH_LABELS: Record<string, string> = {
  none: '无需认证', apiKey: 'API Key', bearer: 'Bearer Token', basic: 'Basic 认证',
};

const Integrations: React.FC = () => {
  const [apps, setApps] = useState<IntegrationApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 导入弹窗
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'url'>('text');
  const [importText, setImportText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  // 动作详情弹窗
  const [detailApp, setDetailApp] = useState<IntegrationApp | null>(null);

  // 凭证配置弹窗
  const [credApp, setCredApp] = useState<IntegrationApp | null>(null);
  const [credForm, setCredForm] = useState({ auth_type: 'none', auth_in: 'header', auth_name: '', credential: '', base_url: '' });
  const [savingCred, setSavingCred] = useState(false);

  // 试运行弹窗
  const [testApp, setTestApp] = useState<IntegrationApp | null>(null);
  const [testAction, setTestAction] = useState<AppAction | null>(null);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await integrationsApi.getApps();
      if (res.success) setApps(res.data.items || []);
    } catch (e) {
      showToast('加载集成应用失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleImport = async () => {
    if (importMode === 'text' && !importText.trim()) {
      showToast('请粘贴规范内容', 'error'); return;
    }
    if (importMode === 'url' && !importUrl.trim()) {
      showToast('请填写规范地址', 'error'); return;
    }
    setImporting(true);
    try {
      const res = await integrationsApi.importApp(
        importMode === 'text' ? { text: importText } : { url: importUrl }
      );
      if (res.success) {
        showToast(res.message || '导入成功');
        setShowImport(false); setImportText(''); setImportUrl('');
        fetchApps();
      } else {
        showToast(res.error || '导入失败', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || '导入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  const openDetail = async (app: IntegrationApp) => {
    setDetailApp(app);
    try {
      const res = await integrationsApi.getApp(app.id);
      if (res.success) setDetailApp(res.data);
    } catch (e) {
      showToast('加载动作列表失败', 'error');
    }
  };

  const handleDelete = async (app: IntegrationApp) => {
    if (!window.confirm(`确定删除集成应用「${app.name}」？该应用下的动作节点将失效。`)) return;
    try {
      const res = await integrationsApi.deleteApp(app.id);
      if (res.success) { showToast('已删除'); fetchApps(); }
      else showToast(res.error || '删除失败', 'error');
    } catch (e: any) { showToast(e?.message || '删除失败', 'error'); }
  };

  const openCred = (app: IntegrationApp) => {
    setCredApp(app);
    setCredForm({
      auth_type: app.auth_type || 'none',
      auth_in: app.auth_config?.in || 'header',
      auth_name: app.auth_config?.name || '',
      credential: '',
      base_url: app.base_url || '',
    });
  };

  const handleSaveCred = async () => {
    if (!credApp) return;
    setSavingCred(true);
    try {
      const payload: any = { auth_type: credForm.auth_type, base_url: credForm.base_url };
      if (credForm.auth_type === 'apiKey') {
        payload.auth_config = { in: credForm.auth_in, name: credForm.auth_name || 'X-Api-Key' };
      } else if (credForm.auth_type === 'bearer') {
        payload.auth_config = { prefix: 'Bearer' };
      } else {
        payload.auth_config = {};
      }
      if (credForm.credential.trim()) payload.credential = credForm.credential.trim();
      const res = await integrationsApi.updateApp(credApp.id, payload);
      if (res.success) { showToast('认证配置已保存'); setCredApp(null); fetchApps(); }
      else showToast(res.error || '保存失败', 'error');
    } catch (e: any) { showToast(e?.message || '保存失败', 'error'); }
    finally { setSavingCred(false); }
  };

  const handleToggle = async (app: IntegrationApp, enabled: boolean) => {
    try {
      const res = await integrationsApi.updateApp(app.id, { enabled });
      if (res.success) {
        setApps(prev => prev.map(a => a.id === app.id ? { ...a, enabled } : a));
        showToast(enabled ? '已启用' : '已停用');
      } else showToast(res.error || '操作失败', 'error');
    } catch (e: any) { showToast(e?.message || '操作失败', 'error'); }
  };

  const openTest = (app: IntegrationApp, action: AppAction) => {
    setTestApp(app); setTestAction(action);
    setTestValues({}); setTestResult(null);
  };

  const runTest = async () => {
    if (!testApp || !testAction) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await integrationsApi.testAction(testApp.id, testAction.id, testValues);
      setTestResult(res);
      if (!res.success && res.error) showToast(res.error, 'error');
    } catch (e: any) { showToast(e?.message || '请求失败', 'error'); }
    finally { setTesting(false); }
  };

  const totalActions = apps.reduce((s, a) => s + (a.action_count || 0), 0);
  const withCred = apps.filter(a => a.has_credential).length;
  const enabledCount = apps.filter(a => a.enabled).length;

  return (
    <ContentContainer>
      <PageHeader
        title="集成应用"
        icon={Plug}
        actions={
          <Button variant="primary" size="sm" icon={Download} onClick={() => setShowImport(true)}>
            导入规范
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="集成应用" value={apps.length} unit="个" icon={Layers} tone="primary" />
        <StatCard label="可用动作" value={totalActions} unit="个" icon={Plug} tone="success" />
        <StatCard label="已配凭证" value={withCred} unit="个" icon={KeyRound} tone="warning" />
        <StatCard label="已启用" value={enabledCount} unit="个" icon={CheckCircle2} tone="neutral" />
      </div>

      <SectionCard
        title="应用列表"
        description="从 Shuffle / OpenAPI 规范导入第三方安全工具，其动作可直接编排进剧本"
      >
        {loading ? (
          <LoadingState />
        ) : apps.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="还没有集成应用"
            description="导入 Shuffle 或标准 OpenAPI 规范，即可获得该工具的全部可编排动作"
            action={<Button variant="primary" size="sm" icon={Download} onClick={() => setShowImport(true)}>导入规范</Button>}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {apps.map(app => (
              <div key={app.id}
                className={`rounded-card border bg-card-bg p-4 transition-colors ${app.enabled ? 'border-border-color' : 'border-border-color/50 opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[13px] font-medium text-text-primary">{app.name}</h3>
                      <span className="shrink-0 rounded bg-page-bg px-1.5 py-0.5 text-[10px] text-text-muted">
                        v{app.version}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-text-muted">
                      {app.description || '暂无描述'}
                    </p>
                  </div>
                  <Switch checked={app.enabled} onChange={v => handleToggle(app, v)} />
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {(app.categories || []).slice(0, 3).map(c => (
                    <span key={c} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{c}</span>
                  ))}
                  <span className="rounded bg-page-bg px-1.5 py-0.5 text-[10px] text-text-muted">
                    {app.action_count} 个动作
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                    app.has_credential ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                  }`}>
                    {AUTH_LABELS[app.auth_type] || app.auth_type}
                    {app.has_credential ? ' · 已配置' : ' · 未配置'}
                  </span>
                </div>

                {app.base_url && (
                  <div className="mt-2 flex items-center gap-1 truncate text-[10.5px] text-text-muted">
                    <Globe size={11} className="shrink-0" />
                    <span className="truncate font-mono">{app.base_url}</span>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 border-t border-border-color pt-3">
                  <Button variant="secondary" size="sm" onClick={() => openDetail(app)}>
                    查看动作
                  </Button>
                  <Button variant="secondary" size="sm" icon={KeyRound} onClick={() => openCred(app)}>
                    凭证
                  </Button>
                  <Button variant="ghost" size="sm" icon={Trash2} className="ml-auto text-danger"
                    onClick={() => handleDelete(app)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* 导入规范弹窗 */}
      <Modal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="导入集成规范"
        width="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(false)}>取消</Button>
            <Button variant="primary" size="sm" icon={importing ? Loader2 : Download}
              disabled={importing} onClick={handleImport}>
              {importing ? '导入中…' : '导入'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant={importMode === 'text' ? 'primary' : 'secondary'} size="sm"
              icon={FileJson} onClick={() => setImportMode('text')}>粘贴规范</Button>
            <Button variant={importMode === 'url' ? 'primary' : 'secondary'} size="sm"
              icon={Link2} onClick={() => setImportMode('url')}>从地址拉取</Button>
          </div>
          {importMode === 'text' ? (
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={'粘贴 Shuffle / OpenAPI 规范（YAML 或 JSON）…\n\n规范来源：github.com/Shuffle/openapi-apps（MIT）'}
              className="h-64 w-full resize-y rounded-md border border-border-color bg-page-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-text-primary focus:border-primary focus:outline-none"
            />
          ) : (
            <input
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="https://example.com/app/api.yaml"
              className="w-full rounded-md border border-border-color bg-page-bg px-3 py-2 text-xs text-text-primary focus:border-primary focus:outline-none"
            />
          )}
          <p className="text-[11px] leading-relaxed text-text-muted">
            支持标准 OpenAPI 2/3 规范（含 Shuffle 的 x-categories / securityDefinitions 扩展）。
            导入后自动解析出全部动作、参数与请求体结构，认证方式按规范推断、可在「凭证」中覆盖。
          </p>
        </div>
      </Modal>

      {/* 动作详情弹窗 */}
      <Modal
        open={!!detailApp}
        onClose={() => setDetailApp(null)}
        title={`${detailApp?.name || ''} · 动作列表`}
        width="xl"
      >
        <div className="max-h-[60vh] space-y-1.5 overflow-auto">
          {(detailApp?.actions || []).map(action => (
            <div key={action.id}
              className="flex items-center gap-3 rounded-md border border-border-color bg-page-bg px-3 py-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${METHOD_COLORS[action.method] || 'bg-page-bg text-text-muted'}`}>
                {action.method}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-primary">{action.path}</span>
              <span className="hidden max-w-[35%] truncate text-[11px] text-text-muted sm:block">{action.name}</span>
              {action.params?.length > 0 && (
                <span className="shrink-0 text-[10px] text-text-muted">{action.params.length} 参数</span>
              )}
              <Button variant="secondary" size="sm" icon={Play} onClick={() => {
                setDetailApp(null);
                if (detailApp) openTest(detailApp, action);
              }}>
                试运行
              </Button>
            </div>
          ))}
        </div>
      </Modal>

      {/* 凭证配置弹窗 */}
      <Modal
        open={!!credApp}
        onClose={() => setCredApp(null)}
        title={`${credApp?.name || ''} · 认证配置`}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCredApp(null)}>取消</Button>
            <Button variant="primary" size="sm" disabled={savingCred} onClick={handleSaveCred}>
              {savingCred ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-text-muted">认证方式</label>
            <select value={credForm.auth_type}
              onChange={e => setCredForm(f => ({ ...f, auth_type: e.target.value }))}
              className="w-full rounded-md border border-border-color bg-card-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-primary focus:outline-none">
              <option value="none">无需认证</option>
              <option value="apiKey">API Key</option>
              <option value="bearer">Bearer Token</option>
              <option value="basic">Basic 认证（用户名:密码）</option>
            </select>
          </div>
          {credForm.auth_type === 'apiKey' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-text-muted">携带位置</label>
                <select value={credForm.auth_in}
                  onChange={e => setCredForm(f => ({ ...f, auth_in: e.target.value }))}
                  className="w-full rounded-md border border-border-color bg-card-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-primary focus:outline-none">
                  <option value="header">请求头 Header</option>
                  <option value="query">查询参数 Query</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">参数名</label>
                <input value={credForm.auth_name}
                  onChange={e => setCredForm(f => ({ ...f, auth_name: e.target.value }))}
                  placeholder="X-Api-Key"
                  className="w-full rounded-md border border-border-color bg-card-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-primary focus:outline-none" />
              </div>
            </div>
          )}
          {credForm.auth_type !== 'none' && (
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                密钥{credApp?.has_credential ? `（当前：${credApp.credential_masked}，留空保持不变）` : ''}
              </label>
              <input type="password" value={credForm.credential}
                onChange={e => setCredForm(f => ({ ...f, credential: e.target.value }))}
                placeholder={credForm.auth_type === 'basic' ? '用户名:密码' : 'API Key / Token'}
                className="w-full rounded-md border border-border-color bg-card-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-primary focus:outline-none" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-text-muted">服务地址（base URL）</label>
            <input value={credForm.base_url}
              onChange={e => setCredForm(f => ({ ...f, base_url: e.target.value }))}
              placeholder="https://api.example.com"
              className="w-full rounded-md border border-border-color bg-card-bg px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-primary focus:outline-none" />
          </div>
        </div>
      </Modal>

      {/* 试运行弹窗 */}
      <Modal
        open={!!testAction}
        onClose={() => { setTestAction(null); setTestResult(null); }}
        title={`试运行 · ${testAction?.name || ''}`}
        width="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setTestAction(null); setTestResult(null); }}>关闭</Button>
            <Button variant="primary" size="sm" icon={testing ? Loader2 : Play} disabled={testing} onClick={runTest}>
              {testing ? '请求中…' : '发送请求'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md bg-page-bg px-3 py-2">
            <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${METHOD_COLORS[testAction?.method || ''] || ''}`}>
              {testAction?.method}
            </span>
            <span className="truncate font-mono text-[11px] text-text-muted">{testAction?.path}</span>
          </div>
          {testAction?.description && (
            <p className="text-[11px] leading-relaxed text-text-muted">{testAction.description}</p>
          )}

          {/* 动态参数表单 */}
          {(testAction?.params || []).map(p => (
            <div key={p.name}>
              <label className="mb-1 block text-xs text-text-muted">
                {p.name}
                <span className="ml-1 text-[10px] text-text-muted/70">({p.in})</span>
                {p.required && <span className="ml-0.5 text-danger">*</span>}
              </label>
              {p.desc && <p className="mb-1 text-[10.5px] text-text-muted/80">{p.desc}</p>}
              {p.type === 'boolean' ? (
                <select value={testValues[p.name] || ''}
                  onChange={e => setTestValues(v => ({ ...v, [p.name]: e.target.value }))}
                  className="w-full rounded-md border border-border-color bg-card-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-primary focus:outline-none">
                  <option value="">请选择</option><option value="true">是</option><option value="false">否</option>
                </select>
              ) : (
                <input value={testValues[p.name] || ''}
                  onChange={e => setTestValues(v => ({ ...v, [p.name]: e.target.value }))}
                  type={p.type === 'number' ? 'number' : 'text'}
                  placeholder={p.default != null ? `默认 ${p.default}` : ''}
                  className="w-full rounded-md border border-border-color bg-card-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-primary focus:outline-none" />
              )}
            </div>
          ))}

          {/* 请求体字段 */}
          {testAction?.body?.properties && Object.entries(testAction.body.properties).map(([name, def]: [string, any]) => (
            <div key={name}>
              <label className="mb-1 block text-xs text-text-muted">
                {name}
                <span className="ml-1 text-[10px] text-text-muted/70">(body)</span>
                {(testAction.body.required || []).includes(name) && <span className="ml-0.5 text-danger">*</span>}
              </label>
              {def.desc && <p className="mb-1 text-[10.5px] text-text-muted/80">{def.desc}</p>}
              {def.type === 'object' || def.type === 'array' ? (
                <textarea value={testValues[name] || ''}
                  onChange={e => setTestValues(v => ({ ...v, [name]: e.target.value }))}
                  placeholder={def.type === 'array' ? '["a", "b"]' : '{"k": "v"}'}
                  className="h-16 w-full resize-y rounded-md border border-border-color bg-page-bg px-3 py-2 font-mono text-[11px] text-text-primary focus:border-primary focus:outline-none" />
              ) : (
                <input value={testValues[name] || ''}
                  onChange={e => setTestValues(v => ({ ...v, [name]: e.target.value }))}
                  type={def.type === 'number' ? 'number' : 'text'}
                  className="w-full rounded-md border border-border-color bg-card-bg px-2.5 py-1.5 text-xs text-text-primary focus:border-primary focus:outline-none" />
              )}
            </div>
          ))}

          {/* 响应结果 */}
          {testResult && (
            <div className={`rounded-md border p-3 ${
              testResult.success ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'
            }`}>
              <div className="mb-1.5 flex items-center gap-2">
                {testResult.success
                  ? <CheckCircle2 size={13} className="text-success" />
                  : <AlertCircle size={13} className="text-danger" />}
                <span className="text-[12px] font-medium text-text-primary">
                  {testResult.message || (testResult.success ? '请求成功' : '请求失败')}
                </span>
                {testResult.data?.status_code && (
                  <span className="rounded bg-page-bg px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                    HTTP {testResult.data.status_code}
                  </span>
                )}
              </div>
              {testResult.data?.response != null && (
                <pre className="max-h-48 overflow-auto rounded bg-page-bg p-2 font-mono text-[10.5px] leading-relaxed text-text-secondary">
                  {JSON.stringify(testResult.data.response, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </Modal>

      {toast && (
        <div className={`fixed right-4 top-16 z-toast max-w-xs rounded-card border px-3.5 py-2.5 text-[12.5px] shadow-panel ${
          toast.type === 'success' ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'
        }`}>
          {toast.message}
        </div>
      )}
    </ContentContainer>
  );
};

export default Integrations;
