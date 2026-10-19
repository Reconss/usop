import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { useAuth } from '../contexts/AuthContext';
import { Button, Field } from '../components/ui';

const API_BASE = '/api';
const BACKEND_FALLBACK = 'http://localhost:5001';

/** 能力要点（编辑式编号列表，纯展示） */
const CAPABILITIES = [
  { no: '01', title: '统一数据接入', desc: '多源日志纳管 · 解析映射 · 分层过滤' },
  { no: '02', title: '实时检测分析', desc: '检测规则 · 关联分析 · 威胁狩猎' },
  { no: '03', title: '闭环响应协同', desc: '智能研判 · 剧本编排 · 运营度量' },
];

/** 运营闭环（mono 状态行） */
const PIPELINE_TEXT = '数据接入 → 解析标准化 → 检测关联 → AI 研判 → 处置闭环';

const EASE = [0.16, 1, 0.3, 1] as const;

/** 雷达扫描视觉（纯装饰背景，CSS 动画独立驱动，不经 framer） */
function RadarVisual() {
  return (
    <div aria-hidden className="absolute pointer-events-none select-none"
      style={{ right: -150, bottom: -190, width: 560, height: 560 }}>
      {/* 圆环 + 准线 */}
      <svg viewBox="0 0 580 580" className="absolute inset-0 h-full w-full">
        {[270, 200, 130, 60].map((r) => (
          <circle key={r} cx="290" cy="290" r={r}
            fill="none" stroke="rgb(var(--c-primary) / 0.15)" strokeWidth="1" />
        ))}
        <line x1="290" y1="12" x2="290" y2="568" stroke="rgb(var(--c-primary) / 0.09)" strokeWidth="1" />
        <line x1="12" y1="290" x2="568" y2="290" stroke="rgb(var(--c-primary) / 0.09)" strokeWidth="1" />
        <line x1="75" y1="75" x2="505" y2="505" stroke="rgb(var(--c-primary) / 0.055)" strokeWidth="1" />
        <line x1="505" y1="75" x2="75" y2="505" stroke="rgb(var(--c-primary) / 0.055)" strokeWidth="1" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const x = 290 + 270 * Math.cos(a);
          const y = 290 + 270 * Math.sin(a);
          return <circle key={i} cx={x} cy={y} r="2" fill="rgb(var(--c-primary) / 0.32)" />;
        })}
      </svg>

      {/* 扫描扇形（余辉渐变） */}
      <div
        className="radar-sweep absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, rgb(var(--c-primary) / 0.22), rgb(var(--c-primary) / 0.05) 52deg, transparent 68deg)',
          maskImage: 'radial-gradient(circle, black 0%, black 98%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, black 98%, transparent 100%)',
        }}
      />

      {/* 中心点 */}
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/70" />

      {/* 脉冲目标点（错峰闪烁） */}
      {[
        { x: '62%', y: '30%', d: '0s' },
        { x: '35%', y: '62%', d: '1.5s' },
        { x: '58%', y: '74%', d: '3s' },
      ].map((b, i) => (
        <div key={i} className="absolute" style={{ left: b.x, top: b.y }}>
          <div className="radar-blip h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: b.d }} />
          <div className="radar-blip absolute -inset-2 rounded-full border border-primary/40" style={{ animationDelay: b.d }} />
        </div>
      ))}
    </div>
  );
}

export default function Login() {
  const { login: authLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('请输入用户名'); return; }
    if (!password.trim()) { setError('请输入密码'); return; }

    setIsLoading(true);
    try {
      // 登录请求：优先走 webpack 代理，失败时直连后端
      const fetchOpts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      };
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/auth/login`, fetchOpts);
      } catch {
        res = await fetch(`${BACKEND_FALLBACK}${API_BASE}/auth/login`, fetchOpts);
      }
      const data = await res.json();
      if (data.success && data.data?.token) {
        // userData 附带角色权限点（登录响应 data.permissions），供侧边栏菜单过滤
        authLogin(data.data.token, { ...data.data.user, permissions: data.data.permissions || [] });
      } else {
        setError(data.error || '用户名或密码错误');
      }
    } catch (err: any) {
      setError('连接后端失败，请检查服务是否运行');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-page-bg text-text-primary p-6">
      {/* ── 全页背景：光晕 + 网格 + 雷达 ─────────────────── */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(1000px 540px at 24% 8%, rgb(var(--c-primary) / 0.11), transparent 62%),' +
            'radial-gradient(760px 440px at 88% 100%, rgb(var(--c-accent) / 0.07), transparent 58%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(rgb(var(--c-text) / 0.05) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgb(var(--c-text) / 0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(1100px 680px at 50% 46%, black, transparent 82%)',
          WebkitMaskImage: 'radial-gradient(1100px 680px at 50% 46%, black, transparent 82%)',
        }}
      />
      <RadarVisual />

      {/* ── 中央内容组：品牌排版 + 登录卡片 ──────────────── */}
      <div className="relative z-10 w-full max-w-[1080px] flex flex-col items-center justify-center gap-10 lg:flex-row lg:gap-20">
        {/* 左列：编辑式品牌排版（小屏隐藏） */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="hidden lg:block flex-1 min-w-0 max-w-[520px]"
        >
          {/* 品牌 */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-card bg-primary/12 border border-primary/25 text-primary"
              style={{ boxShadow: '0 0 26px rgb(var(--c-primary) / 0.26)' }}
            >
              <BrandMark size={22} />
            </div>
            <div className="leading-tight">
              <div className="text-card-title text-text-primary tracking-wide">USOP</div>
              <div className="text-[10px] font-mono text-text-muted tracking-[0.08em] uppercase">
                Unified Security Operations
              </div>
            </div>
          </div>

          {/* 标语 */}
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
            className="mt-9 font-mono text-[11px] tracking-[0.22em] text-primary uppercase"
          >
            {'// Security Operations Platform'}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.55, ease: EASE }}
            className="mt-4 text-[clamp(36px,3.4vw,48px)] font-bold leading-[1.14] tracking-[-0.02em] text-text-primary"
          >
            统一安全
            <br />
            <span className="text-primary">运营平台</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.5, ease: EASE }}
            className="mt-4 max-w-[430px] text-[14px] leading-relaxed text-text-secondary"
          >
            从日志接入到研判处置，<br />把安全运营的每一环收敛到同一个工作面。
          </motion.p>

          {/* 编号能力列表 */}
          <div className="mt-8 flex flex-col">
            {CAPABILITIES.map((c, i) => (
              <motion.div
                key={c.no}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.45, ease: EASE }}
                className="group flex items-baseline gap-4 py-2.5 border-t border-border-color/70 last:border-b transition-colors"
              >
                <span className="font-mono text-[11px] text-primary/70">{c.no}</span>
                <span className="w-28 shrink-0 text-[13px] font-medium text-text-primary">{c.title}</span>
                <span className="text-[12px] text-text-muted group-hover:text-text-secondary transition-colors">{c.desc}</span>
              </motion.div>
            ))}
          </div>

          {/* 底部状态行 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="mt-7 flex items-center gap-3 font-mono text-[10px] tracking-[0.06em] text-text-muted"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span>{PIPELINE_TEXT}</span>
          </motion.div>
        </motion.div>

        {/* 右列：登录卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: EASE }}
          className="relative w-full max-w-[400px] shrink-0"
        >
          {/* 小屏品牌标识 */}
          <div className="lg:hidden mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-card bg-primary/12 border border-primary/25 text-primary">
              <BrandMark size={21} />
            </div>
            <div className="leading-tight">
              <div className="text-card-title text-text-primary">USOP 安全平台</div>
              <div className="text-[11px] text-text-muted">统一安全运营平台</div>
            </div>
          </div>

          {/* 渐变描边卡片 */}
          <div
            className="rounded-[18px] p-px"
            style={{
              background:
                'linear-gradient(165deg, rgb(var(--c-primary) / 0.45), rgb(var(--c-border)) 38%, rgb(var(--c-primary) / 0.12))',
            }}
          >
            <div className="rounded-[17px] bg-surface-1 shadow-panel overflow-hidden">
              {/* 卡头 */}
              <div className="px-8 pt-8 pb-6 border-b border-border-color">
                <div className="flex items-center justify-between">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-card bg-primary/12 border border-primary/25 text-primary"
                    style={{ boxShadow: '0 0 22px rgb(var(--c-primary) / 0.22)' }}
                  >
                    <BrandMark size={23} />
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.14em] text-text-muted">USOP · ACCESS</span>
                </div>
                <h2 className="mt-5 text-[24px] font-semibold tracking-[-0.01em] text-text-primary">欢迎回来</h2>
                <p className="mt-1 text-[13px] text-text-muted">
                  使用平台账号或 AD 域账号登录，继续安全运营工作。
                </p>
              </div>

              {/* 表单 */}
              <form onSubmit={handleSubmit} className="px-8 py-6 flex flex-col gap-4">
                <Field label="用户名">
                  <div className="relative group">
                    <User
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors group-focus-within:text-primary"
                    />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="app-input pl-9"
                      placeholder="请输入用户名"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </Field>

                <Field label="密码">
                  <div className="relative group">
                    <Lock
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors group-focus-within:text-primary"
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="app-input pl-9 pr-10"
                      placeholder="请输入密码"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>

                {error && (
                  <div className="callout callout-danger" role="alert">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" block loading={isLoading} className="group mt-1">
                  {isLoading ? '登录中…' : '登录'}
                  {!isLoading && (
                    <ArrowRight size={15} className="ml-1.5 transition-transform group-hover:translate-x-0.5" />
                  )}
                </Button>
              </form>

              {/* 卡脚 */}
              <div className="px-8 py-4 border-t border-border-color flex items-center justify-between text-[11px] text-text-muted">
                <span className="flex items-center gap-1.5">
                  <Lock size={11} />
                  内部系统 · 仅限授权人员访问
                </span>
                <span className="font-mono text-[10px] tracking-[0.08em]">USOP</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
