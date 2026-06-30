// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, MessageSquare, Zap, Shield, Sparkles, Bot, Cpu,
  Search, Target, Activity, ThumbsUp, ThumbsDown, Server,
  AlertTriangle, Loader2, X, Plus, Save, Play,
  Clock, FileText, Trash2, Edit3, Copy, BarChart3, GitBranch,
  Terminal, User, Users, Send, List, MessageCircle, Filter, Check,
  Star, AlertCircle, Settings, PanelLeftClose, PanelLeft,
  RefreshCw, Layers, Lightbulb,
  ShieldCheck, Blocks, BookOpen, Radar, Gauge, Combine,
  AtSign, Wrench, Upload, FileJson, Flag, Link2, Wifi, CheckCircle, ChevronRight, Database
} from 'lucide-react';
import { aiApi, request as apiRequest } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface LlmProvider { id: string; name: string; type: string; base_url: string; api_key: string; model: string; temperature?: number; max_tokens?: number; timeout?: number; enabled?: boolean; }
interface AgentProvider { id: string; name: string; type: string; endpoint: string; api_key: string; description: string; skills: Skill[]; enabled?: boolean; }
interface Skill { name: string; description: string; }
interface ChatSession { id: string; title: string; created_at: string; message_count?: number; }
interface ToastItem { id: string; type: 'success' | 'error' | 'info'; message: string; duration?: number; }

// ==================== 子组件 ====================
const highlightMentions = (text: string, users: any[]) => {
  if (!text) return text;
  let result = text;
  users.forEach(u => {
    const escaped = u.name.replace(/[.*+?^{}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("@" + escaped, "g");
    result = result.replace(pattern, (match) => {
      return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500\/15 text-indigo-400 text-xs font-medium border border-indigo-500\/20">${match}<\/span>`;
    });
  });
  return result;
};

const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const r = content
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre class="bg-page-bg border border-border-color rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono"><code>${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code class="bg-page-bg px-1 py-0.5 rounded text-[13px] font-mono text-blue-400">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1.5">$1</h3>').replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
    .replace(/^- (.+)$/gm, '<li class="flex items-start gap-1.5 ml-4"><span class="text-blue-400 mt-1">•</span><span>$1</span></li>')
    .replace(/\n\n/g, '</p><p class="my-1.5">').replace(/\n/g, '<br />');
  return <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: `<p>${r}</p>` }} />;
};

const Skeleton: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`}>{Array.from({length:lines}).map((_,i)=><div key={i} className="h-4 bg-border-color rounded animate-pulse" style={{width:`${80-i*15}%`}} />)}</div>
);

const ToastContainer: React.FC<{toasts:ToastItem[];onDismiss:(id:string)=>void}> = ({toasts,onDismiss}) => (
  <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
    <AnimatePresence>{toasts.map(t=>(
      <motion.div key={t.id} initial={{opacity:0,y:-20,scale:0.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-10,scale:0.95}}
        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm ${t.type==='success'?'bg-emerald-900/80 border-emerald-700/50 text-emerald-200':t.type==='error'?'bg-red-900/80 border-red-700/50 text-red-200':'bg-blue-900/80 border-blue-700/50 text-blue-200'}`}>
        {t.type==='success'?<CheckCircle className="w-4 h-4"/>:t.type==='error'?<AlertTriangle className="w-4 h-4"/>:<AlertCircle className="w-4 h-4"/>}
        <span className="text-sm flex-1">{t.message}</span>
        <button onClick={()=>onDismiss(t.id)} className="opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5"/></button>
      </motion.div>
    ))}</AnimatePresence>
  </div>
);

const ConfirmDialog: React.FC<{open:boolean;title:string;message:string;onConfirm:()=>void;onCancel:()=>void;confirmLabel?:string;variant?:'danger'|'primary'}> = ({open,title,message,onConfirm,onCancel,confirmLabel='确认',variant='danger'}) => {
  if(!open)return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} className="bg-card-bg border border-border-color rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-base font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-border-color">取消</button>
          <button onClick={()=>{onConfirm();onCancel();}} className={`px-4 py-2 text-sm text-white rounded-lg transition-all ${variant==='danger'?'bg-red-600 hover:bg-red-500':'bg-blue-600 hover:bg-blue-500'}`}>{confirmLabel}</button>
        </div>
      </motion.div>
    </div>
  );
};

const SubTabBar: React.FC<{tabs:{id:string;label:string;icon:React.ElementType}[];active:string;onChange:(id:string)=>void;color?:string}> = ({tabs,active,onChange,color='#3b82f6'}) => (
  <div className="flex gap-1 bg-page-bg p-0.5 rounded-lg border border-border-color">
    {tabs.map(t=>(
      <button key={t.id} onClick={()=>onChange(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${active===t.id?'bg-card-bg text-text-primary shadow-sm border border-border-color':'text-text-muted hover:text-text-secondary'}`}>
        <t.icon className="w-3.5 h-3.5" style={active===t.id?{color}:undefined} />
        <span>{t.label}</span>
      </button>
    ))}
  </div>
);

// ==================== 主组件 ====================
const AICenter: React.FC = () => {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState(localStorage.getItem('ai_mainTab') || 'analysis');
  const [analysisSub, setAnalysisSub] = useState('chat');
  const [configSub, setConfigSub] = useState('models');
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineLastRun, setPipelineLastRun] = useState<string|null>(null);
  const [pipelineStats, setPipelineStats] = useState<any>({analyzed:0,events:0,high_risk:0});
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [cronResult, setCronResult] = useState<any>(null);
  const [cronLoading, setCronLoading] = useState(false);
  const [wlRules, setWlRules] = useState<any[]>([]);
  const [wlLoading, setWlLoading] = useState(false);
  const [wlNewRule, setWlNewRule] = useState<any>({name:'',reason:'',conditions:[{field:'src_ip',op:'eq',value:''}]});
  const [alertFields, setAlertFields] = useState<any[]>([]);
  const [wfLoading, setWfLoading] = useState(false);

  const [llmProviders, setLlmProviders] = useState<LlmProvider[]>([]);
  const [defaultLlmId, setDefaultLlmId] = useState<string|null>(null);
  const [agentProviders, setAgentProviders] = useState<AgentProvider[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<any>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{open:boolean;title:string;message:string;onConfirm:()=>void;variant?:'danger'|'primary';confirmLabel?:string;}>({open:false,title:'',message:'',onConfirm:()=>{}});
  const addToast = useCallback((type:ToastItem['type'],message:string,dur=4000)=>{const id=Date.now().toString();setToasts(p=>[...p,{id,type,message}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),dur);},[]);

  // ===== Chat states =====
  const [teamMessages, setTeamMessages] = useState<{id:string;user:{name:string;role:string;avatar:string;color:string;isAI?:boolean};content:string;time:string}[]>([]);
  const [teamMsg, setTeamMsg] = useState('');
  const teamEndRef = useRef<HTMLDivElement>(null);
  const [chatMode, setChatMode] = useState<'ai'|'team'>('ai');
  const [activeContact, setActiveContact] = useState<number>(0);
  const [showContacts, setShowContacts] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [messages, setMessages] = useState<{role:string;content:string;feedback?:'up'|'down'}[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [teamChatWith, setTeamChatWith] = useState<number|string|null>(null);
  const [teamChats, setTeamChats] = useState<{[key:string]:{id:string;user:any;content:string;time:string}[]}>({});
  const [teamGroups, setTeamGroups] = useState<{id:string;name:string;members:number[];color:string;avatar:string}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');


  const [streamingContent, setStreamingContent] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string|null>(null);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showNlInput, setShowNlInput] = useState(false);
  const [analysisNlQuery, setAnalysisNlQuery] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [nlReply, setNlReply] = useState('');

  // ===== Deep analysis states =====
  const [depthInsights, setDepthInsights] = useState<any>(null);
  const [depthLoading, setDepthLoading] = useState(false);
  const [depthTriageInput, setDepthTriageInput] = useState('');
  const [depthTriageResult, setDepthTriageResult] = useState<any>(null);
  const [depthInvestigateCode, setDepthInvestigateCode] = useState('');
  const [depthInvestigateResult, setDepthInvestigateResult] = useState<any>(null);
  const [depthActiveSubTab, setDepthActiveSubTab] = useState('insights');
  const [rulesText, setRulesText] = useState('');

  // ===== Automation states =====
  const [autoEventCode, setAutoEventCode] = useState('');
  const [autoResult, setAutoResult] = useState<any>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [skillInstruction, setSkillInstruction] = useState('');
  const [skillResult, setSkillResult] = useState<any>(null);
  const [skillLoading, setSkillLoading] = useState(false);
  const [autoActiveSubTab, setAutoActiveSubTab] = useState('respond');

  // ===== Config states =====
  const [editingLlm, setEditingLlm] = useState<any>(null);
  const [showAddLlm, setShowAddLlm] = useState(false);
  const [llmFormLoading, setLlmFormLoading] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [agentFormLoading, setAgentFormLoading] = useState(false);

  // Online team users (current platform user + AI)
  const teamUsers = [
    { id: 1, name: 'AI 分析助手', role: '智能分析引擎 · 7×24h', avatar: 'AI', color: 'from-indigo-500 to-purple-600', isAI: true, online: true, lastMsg: '随时为您分析告警', unread: 0 },
    { id: 2, name: user?.username||'管理员', role: user?.role||'安全管理员', avatar: (user?.username||'管').charAt(0), color: 'from-blue-500 to-cyan-500', isAI: false, online: true, lastMsg: '', unread: 0 },
    { id: 3, name: 'zhang', role: '安全主管', avatar: '张', color: 'from-emerald-500 to-teal-500', isAI: false, online: true, lastMsg: '好的，我来处理', unread: 2 },
    { id: 4, name: 'li', role: '安全分析师', avatar: '李', color: 'from-amber-500 to-orange-500', isAI: false, online: true, lastMsg: '已更新配置', unread: 0 },
    { id: 5, name: 'wang', role: '安全运维', avatar: '王', color: 'from-rose-500 to-pink-500', isAI: false, online: false, lastMsg: '日志已归档', unread: 0 },
  ];

  useEffect(()=>{
    Promise.all([
      aiApi.getLlmProviders().then(r=>r.success&&setLlmProviders(r.data)).catch(()=>{}),
      aiApi.getDefaultLlmProvider().then(r=>{if(r.success&&r.data?.id)setDefaultLlmId(r.data.id)}).catch(()=>{}),
      aiApi.getAgentProviders().then(r=>r.success&&setAgentProviders(r.data||[])).catch(()=>{}),
      aiApi.listSkills().then(r=>r.success&&setSkills(r.data?.skills||[])).catch(()=>{}),
      aiApi.getFeedbackStats().then(r=>r.success&&setFeedbackStats(r.data)).catch(()=>{}),
      aiApi.getSessions().then(r=>{if(r.success&&r.data&&r.data.length>0){setSessions(r.data);const savedId=localStorage.getItem('ai_activeSessionId');const target=r.data.find((s:any)=>s.id===savedId)||r.data[0];setActiveSessionId(target.id);loadSession(target.id);}}).catch(()=>{}),
    ]);
  },[]);

  useEffect(()=>{
    apiRequest('/ai-api/pipeline/status').then(r => {
      if(r.success){const d=r.data||{};setPipelineRunning(d.running);setPipelineLastRun(d.last_run);setPipelineStats({analyzed:d.total_analyzed||0,events:d.total_events||0,high_risk:d.high_risk||0});}
    }).catch(()=>{});
    apiRequest('/ai-api/approval/pending').then(r => {
      if(r.success) setPendingCount(r.data?.length||0);
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    localStorage.setItem('ai_mainTab', mainTab);
  },[mainTab]);

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:'smooth'});},[messages,streamingContent]);
  useEffect(()=>{teamEndRef.current?.scrollIntoView({behavior:'smooth'});},[teamMessages]);

  const loadSession = useCallback(async(id:string)=>{setActiveSessionId(id);localStorage.setItem('ai_activeSessionId',id);setChatLoading(true);try{const r=await aiApi.getSession(id);if(r.success)setMessages(r.data?.messages||[]);}catch{}setChatLoading(false);},[]);
  const createSession = useCallback(async()=>{try{const r=await aiApi.createSession({title:`新会话 ${new Date().toLocaleTimeString()}`});if(r.success){setSessions(p=>[r.data,...p]);setActiveSessionId(r.data.id);setMessages([]);setShowSessionPanel(false);addToast('success','新会话已创建');}}catch{addToast('error','创建失败');}},[addToast]);
  const deleteSession = useCallback(async(id:string)=>{try{await aiApi.deleteSession(id);localStorage.removeItem('ai_activeSessionId');setSessions(p=>p.filter(s=>s.id!==id));if(activeSessionId===id){setActiveSessionId(null);setMessages([]);}addToast('success','已删除');}catch{addToast('error','删除失败');}},[activeSessionId,addToast]);

  const handleSend = useCallback(async()=>{
    if(!inputMsg.trim()){addToast('info','请输入消息');return;}
    let sid=activeSessionId;
    if(!sid){try{const r=await aiApi.createSession({title:inputMsg.slice(0,30)});if(r.success){sid=r.data.id;setActiveSessionId(sid);setSessions(p=>[r.data,...p]);}}catch{addToast('error','创建会话失败');return;}}
    const userMsg={role:'user' as const,content:inputMsg};
    setMessages(p=>[...p,userMsg]);setInputMsg('');setChatLoading(true);setStreamingContent('');
    try{
      // LangGraph 编排
        const r=await aiApi.orchestrate({query:inputMsg,session_id:sid||undefined});
        if(r.success){const reply=r.data?.response||'无响应';let idx=0;const iv=setInterval(()=>{idx+=3;if(idx>=reply.length){clearInterval(iv);setStreamingContent('');setMessages(p=>[...p,{role:'assistant',content:reply}]);setChatLoading(false);}else setStreamingContent(reply.slice(0,idx));},20);}
        else{setChatLoading(false);addToast('error','编排失败');}
    }catch(e:any){setChatLoading(false);setMessages(p=>[...p,{role:'assistant',content:`请求失败: ${e.message}`}]);addToast('error',e.message);}
  },[inputMsg,selectedProvider,activeSessionId,messages,addToast]);

  const handleFeedback = useCallback(async(i:number,t:'up'|'down')=>{setMessages(p=>p.map((m,j)=>j===i?{...m,feedback:t}:m));try{await aiApi.recordFeedback({message_index:i,feedback:t});addToast('success',t==='up'?'感谢反馈':'已记录');}catch{}},[addToast]);

  const handleTeamSend = (chatId: number|string) => {
    const msg = inputMsg.trim();
    if(!msg) return;
    const sender = teamUsers.find(u => !u.isAI && u.name === user?.username) || teamUsers.find(u => !u.isAI) || teamUsers[0];
    const isGroup = typeof chatId === 'string' && chatId.startsWith('group_');
    const key = String(chatId);
    const newMsg = {id:Date.now().toString(), user:sender, content:msg, time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
    setTeamChats(prev => ({
      ...prev,
      [key]: [...(prev[key]||[]), newMsg]
    }));
    setInputMsg('');
    setShowMentionMenu(false);
    if (isGroup) {
      const group = teamGroups.find(g => g.id === chatId);
      if (group) addToast('success', `消息已发送到群「${group.name}」`, 2000);
    } else {
      const target = teamUsers.find(u => u.id === chatId);
      if (target) addToast('success', `消息已发送给 ${target.name}`, 2000);
    }
  };

  const handleCopilot = async()=>{setAnalysisLoading(true);setAnalysisResult(null);try{const r=await aiApi.copilotAnalyzeEvent({event_code:analysisEventCode});setAnalysisResult(r.data?.analysis);if(r.success)addToast('success','分析完成');}catch(e:any){setAnalysisResult({error:e.message});addToast('error',e.message);}setAnalysisLoading(false);};
  const handleNlQuery = async()=>{if(!analysisNlQuery)return;setAnalysisLoading(true);setNlReply('');try{const r=await aiApi.nlQuery({query:analysisNlQuery});if(r.success){setNlReply(r.data?.reply||'无结果');if(r.data?.result?.alerts)setAnalysisResult(r.data.result);}}catch(e:any){setNlReply('查询失败');addToast('error','查询失败');}setAnalysisLoading(false);};
  const [analysisEventCode, setAnalysisEventCode] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const handleDepthInsights = async()=>{setDepthLoading(true);setDepthInsights(null);try{const r=await aiApi.getInsights();setDepthInsights(r.data||r);if(r.success)addToast('success','洞察完成');}catch(e:any){setDepthInsights({error:e.message});addToast('error',e.message);}setDepthLoading(false);};
  const handleDepthTriage = async()=>{setDepthLoading(true);setDepthTriageResult(null);try{const parsed=JSON.parse(depthTriageInput);const r=await aiApi.alertsTriage({alerts:parsed});setDepthTriageResult(r.data);if(r.success)addToast('success',`分诊完成: ${r.data?.triage_results?.length||0} 条`);}catch(e:any){setDepthTriageResult({error:e.message});if(e instanceof SyntaxError)addToast('error','JSON 格式错误');else addToast('error',e.message);}setDepthLoading(false);};
  const handleDepthInvestigate = async()=>{setDepthLoading(true);setDepthInvestigateResult(null);try{const r=await aiApi.investigateEvent({event_code:depthInvestigateCode});setDepthInvestigateResult(r.data);if(r.success)addToast('success','调查完成');}catch(e:any){setDepthInvestigateResult({error:e.message});addToast('error',e.message);}setDepthLoading(false);};
  const handleAutoRespond = async()=>{setAutoLoading(true);setAutoResult(null);try{const r=await aiApi.autoRespond({event_code:autoEventCode});setAutoResult(r.data);if(r.success)addToast('success','分析完成');}catch(e:any){setAutoResult({error:e.message});addToast('error',e.message);}setAutoLoading(false);};
  const handleSkillRoute = async()=>{setSkillLoading(true);setSkillResult(null);try{const r=await aiApi.agentSkillRoute({instruction:skillInstruction});setSkillResult(r.data);if(r.success)addToast('success','技能执行完成');}catch(e:any){setSkillResult({error:e.message});addToast('error',e.message);}setSkillLoading(false);};
  const handleBatchAnalysis = async()=>{setDepthLoading(true);setDepthInsights(null);try{const r=await aiApi.alertsAnalyzeBatch();setDepthInsights(r.data||r);if(r.success)addToast('success','批量分析完成');}catch(e:any){setDepthInsights({error:e.message});addToast('error',e.message);}setDepthLoading(false);};

  const quickActions = [
    {id:'analyze',label:'告警分析',icon:AlertTriangle,color:'#ef4444',action:()=>{setInputMsg('分析最近的高危告警');}},
    {id:'event',label:'事件协查',icon:Shield,color:'#60a5fa',action:()=>{setInputMsg('请协查事件 ');}},
    {id:'triage',label:'告警分诊',icon:Target,color:'#fbbf24',action:()=>{setInputMsg('请分析以下告警的误报概率和优先级：');}},
    {id:'attack',label:'攻击链',icon:GitBranch,color:'#f472b6',action:()=>{setInputMsg('请追踪事件编号的攻击链');}},
    {id:'respond',label:'智能响应',icon:Zap,color:'#10b981',action:()=>{setInputMsg('请评估事件编号 的风险并建议处置');}},
    {id:'intel',label:'威胁情报',icon:Search,color:'#8b5cf6',action:()=>{setInputMsg('查询IP 的威胁情报');}},
    {id:'batch',label:'定时分析',icon:RefreshCw,color:'#6366f1',action:async()=>{try{const r=await apiRequest('/ai-api/cron/analyze-alerts');if(r.success)addToast('success','分析完成: '+r.analyzed+'条');else addToast('error',r.error||'分析失败');}catch(e:any){addToast('error',e.message);}}},
  ];

  // ==================== 主渲染 ====================
  return (
    <div className="flex h-full bg-card-bg rounded-2xl border border-border-color overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 统一顶部导航栏 */}
        <div className="flex-shrink-0 flex items-center px-5 py-2.5 border-b border-border-color gap-4">
          <div className="flex items-center gap-3 min-w-fit">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"><Brain className="w-3.5 h-3.5 text-white" /></div>
              <span className="text-sm font-semibold text-text-primary hidden sm:inline">AI 中心</span>
            </div>
            <div className="flex bg-page-bg p-0.5 rounded-lg border border-border-color">
              <button onClick={()=>setMainTab('analysis')}
                className={'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all '+(mainTab==='analysis'?'text-white shadow-sm':'text-text-muted hover:text-text-secondary')}
                style={mainTab==='analysis'?{background:'linear-gradient(135deg, #3b82f6, #6366f1)'}:{}}>
                <MessageSquare className="w-3 h-3" />智能调查
              </button>
              <button onClick={()=>setMainTab('monitor')}
                className={'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all '+(mainTab==='monitor'?'text-white shadow-sm':'text-text-muted hover:text-text-secondary')}
                style={mainTab==='monitor'?{background:'linear-gradient(135deg, #f59e0b, #ef4444)'}:{}}>
                <AlertTriangle className="w-3 h-3" />告警监控
              </button>
              <button onClick={()=>setMainTab('automation')}
                className={'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all '+(mainTab==='automation'?'text-white shadow-sm':'text-text-muted hover:text-text-secondary')}
                style={mainTab==='automation'?{background:'linear-gradient(135deg, #10b981, #059669)'}:{}}>
                <GitBranch className="w-3 h-3" />自动化规则
              </button>
              <button onClick={()=>setMainTab('config')}
                className={'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all '+(mainTab==='config'?'text-white shadow-sm':'text-text-muted hover:text-text-secondary')}
                style={mainTab==='config'?{background:'linear-gradient(135deg, #0ea5e9, #06b6d4)'}:{}}>
                <Settings className="w-3 h-3" />系统配置
              </button>
            </div>
          </div>
          <div className="w-px h-6 bg-border-color" />
          <div className="flex-1 min-w-0">
            {mainTab==='analysis' && <SubTabBar tabs={[{id:'chat',label:'智能对话',icon:MessageSquare},{id:'capabilities',label:'能力中心',icon:Cpu}]} active={analysisSub} onChange={setAnalysisSub} color="#60a5fa" />}
            {mainTab==='config' && <SubTabBar tabs={[{id:'models',label:'模型管理',icon:Brain},{id:'cron',label:'定时任务',icon:Clock},{id:'approval',label:'审批管理',icon:ShieldCheck},{id:'feedback',label:'反馈学习',icon:BookOpen}]} active={configSub} onChange={setConfigSub} color="#38bdf8" />}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          <AnimatePresence mode="wait">
            <motion.div key={mainTab+'-'+analysisSub+'-'+configSub} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.12}}>
              {mainTab==='analysis' && analysisSub==='chat' && renderChat()}
              {mainTab==='analysis' && analysisSub==='capabilities' && renderCapabilities()}
              {mainTab==='monitor' && renderMonitorCenter()}
              {mainTab==='automation' && renderAutomationCenter()}
              {mainTab==='config' && configSub==='models' && renderModels()}
              {mainTab==='config' && configSub==='cron' && renderCron()}
              {mainTab==='config' && configSub==='approval' && renderApproval()}
              {mainTab==='config' && configSub==='feedback' && renderFeedback()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  // ==================== 智能对话（团队协作 + AI 分析） ====================
  
  // ===== 告警监控 =====
    function renderMonitorCenter() {
    const loadWlRules = async () => {
      setWlLoading(true);
      try{const r=await apiRequest('/ai-api/whitelist/rules');if(r.success)setWlRules(r.data||[]);}catch(e){}
      setWlLoading(false);
    };
    if(wlRules.length===0)setTimeout(()=>loadWlRules(),200);
    // 状态在 main 组件中定义: pipelineStatus / pipelineRunning / setPipelineRunning
    const pipelineSteps = [
      {name:'数据采集',icon:Database,color:'text-blue-400',desc:'TimescaleDB alerts超表\nWAF/IDS日志实时写入'},
      {name:'白名单过滤',icon:Filter,color:'text-gray-400',desc:'内置规则匹配\n命中→false_positive'},
      {name:'AI研判',icon:Bot,color:'text-amber-400',desc:'LLM分析告警\nrisk_score(1-100)'},
      {name:'风险决策',icon:ShieldCheck,color:'text-red-400',desc:'score>=80→创建事件\n<80→标记ai_analyzed'},
      {name:'处置输出',icon:FileText,color:'text-emerald-400',desc:'events表写入\nalerts状态更新'},
    ];
    return (
      <div className="space-y-4">
        {/* 状态与控制栏 */}
        <div className="bg-card-bg border border-border-color rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={'flex items-center gap-2 '+(pipelineRunning?'text-emerald-400':'text-gray-500')}>
                <span className={'w-2.5 h-2.5 rounded-full '+(pipelineRunning?'bg-emerald-500 animate-pulse':'bg-gray-600')} />
                <span className="text-xs font-medium">{pipelineRunning?'运行中':'已停止'}</span>
              </div>
              {pipelineLastRun && (
                <span className="text-[10px] text-text-muted">上次: {new Date(pipelineLastRun).toLocaleString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={async()=>{
                try{const r=await apiRequest('/ai-api/pipeline/status');if(r.success){const d=r.data||{};setPipelineRunning(d.running);setPipelineLastRun(d.last_run);setPipelineStats({analyzed:d.total_analyzed||0,events:d.total_events||0,high_risk:d.high_risk||0});}
                }catch(e){}}
              } className="px-2.5 py-1.5 text-[10px] bg-page-bg border border-border-color rounded-lg text-text-secondary hover:text-text-primary hover:border-border-color-hover transition-all flex items-center gap-1">
                <RefreshCw className="w-3 h-3"/>刷新状态
              </button>
              {pipelineRunning ? (
                <button onClick={async()=>{try{await apiRequest('/ai-api/pipeline/stop',{method:'POST'});setPipelineRunning(false);addToast('info','已停止');}catch(e){}}}
                  className="px-3 py-1.5 text-[10px] bg-red-600/80 text-white rounded-lg hover:bg-red-500 transition-all">停止</button>
              ) : (
                <button onClick={async()=>{try{await apiRequest('/ai-api/pipeline/start',{method:'POST'});setPipelineRunning(true);addToast('success','分析已启动');}catch(e){}
                  const iv=setInterval(async()=>{try{const r=await apiRequest('/ai-api/pipeline/status');if(r.success){const d=r.data||{};setPipelineRunning(d.running);setPipelineLastRun(d.last_run);setPipelineStats({analyzed:d.total_analyzed||0,events:d.total_events||0,high_risk:d.high_risk||0});if(!d.running)clearInterval(iv);}}catch(e){}},3000);
                  setTimeout(()=>clearInterval(iv),120000);}}
                  className="px-3 py-1.5 text-[10px] bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-all">启动分析</button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border-color">
            <div className="text-center"><div className="text-lg font-bold text-text-primary">{pipelineStats.analyzed}</div><div className="text-[10px] text-text-muted">已分析告警</div></div>
            <div className="text-center"><div className="text-lg font-bold text-emerald-400">{pipelineStats.events}</div><div className="text-[10px] text-text-muted">已生成事件</div></div>
            <div className="text-center"><div className="text-lg font-bold text-amber-400">{pipelineStats.high_risk||0}</div><div className="text-[10px] text-text-muted">高风险</div></div>
          </div>
        </div>

        {/* 处理流水线 */}
        <div className="bg-card-bg border border-border-color rounded-xl p-5">
          <h3 className="text-xs font-semibold text-text-primary mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-amber-400"/>处理流水线</h3>
          <div className="flex items-center justify-between gap-1">
            {pipelineSteps.map((p,i)=>(
              <div key={i} className="flex items-center gap-1 flex-1">
                <div className={'flex-1 flex flex-col items-center text-center p-2.5 rounded-xl border-2 bg-page-bg min-h-[95px] border-'+p.color.split('-')[1]+'-500/30'}>
                  <p.icon className={'w-5 h-5 mb-1 '+p.color}/>
                  <div className="text-[10px] font-semibold text-text-primary">{p.name}</div>
                  <div className="text-[8px] text-text-muted mt-0.5 leading-tight whitespace-pre-line">{p.desc}</div>
                </div>
                {i<pipelineSteps.length-1&&<div className="text-text-muted/20 text-lg flex-shrink-0">→</div>}
              </div>
            ))}
          </div>
        </div>

        {/* 能力说明 */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {label:'LLM调用',icon:Bot,desc:'_deepseek_request',color:'text-amber-400'},
            {label:'批量处理',icon:Cpu,desc:'analyze_alert_batch()',color:'text-blue-400'},
            {label:'事件创建',icon:FileText,desc:'CreateIncidentTool',color:'text-emerald-400'},
          ].map((c,i)=>(
            <div key={i} className="bg-card-bg border border-border-color rounded-xl p-3">
              <c.icon className={'w-5 h-5 mb-1.5 '+c.color}/>
              <div className="text-xs font-medium text-text-primary">{c.label}</div>
              <div className="text-[9px] text-text-muted mt-0.5 font-mono">{c.desc}</div>
            </div>
          ))}
        </div>
        {/* 白名单规则 */}
        <div className="bg-card-bg border border-border-color rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-text-primary"><Filter className="w-4 h-4 text-gray-400 inline mr-1"/>白名单规则 ({wlRules.length}条)</h4>
            <button onClick={()=>loadWlRules()} className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">刷新</button>
          </div>
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <input value={wlNewRule.name} onChange={e=>setWlNewRule({...wlNewRule,name:e.target.value})} placeholder="规则名" className="w-28 px-2 py-1.5 text-xs bg-page-bg border border-border-color rounded text-text-primary"/>
            <input value={wlNewRule.reason} onChange={e=>setWlNewRule({...wlNewRule,reason:e.target.value})} placeholder="理由" className="w-28 px-2 py-1.5 text-xs bg-page-bg border border-border-color rounded text-text-primary"/>
            <select value={wlNewRule.conditions[0].field} onChange={e=>setWlNewRule({...wlNewRule,conditions:[{...wlNewRule.conditions[0],field:e.target.value}]})} className="w-32 px-2 py-1.5 text-xs bg-page-bg border border-border-color rounded text-text-primary">
              {alertFields.map((f:any)=><option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
            <select value={wlNewRule.conditions[0].op} onChange={e=>setWlNewRule({...wlNewRule,conditions:[{...wlNewRule.conditions[0],op:e.target.value}]})} className="w-24 px-2 py-1.5 text-xs bg-page-bg border border-border-color rounded text-text-primary">
              <option value="eq">等于 (=)</option>
              <option value="ne">不等于 (!=)</option>
              <option value="contains">包含</option>
              <option value="not_contains">不包含</option>
              <option value="prefix">前缀匹配</option>
              <option value="suffix">后缀匹配</option>
              <option value="regex">正则匹配</option>
              <option value="in">属于列表</option>
              <option value="cidr">IP网段</option>
              <option value="gt">大于</option>
              <option value="lt">小于</option>
              <option value="range">范围</option>
            </select>
            <input value={wlNewRule.conditions[0].value} onChange={e=>setWlNewRule({...wlNewRule,conditions:[{...wlNewRule.conditions[0],value:e.target.value}]})} placeholder={wlNewRule.conditions[0].op==='in'?'用逗号分隔':wlNewRule.conditions[0].op==='cidr'?'如 10.0.0.0/8':wlNewRule.conditions[0].op==='range'?'min,max':wlNewRule.conditions[0].op==='regex'?'正则表达式':'匹配值'} className="w-36 px-2 py-1.5 text-xs bg-page-bg border border-border-color rounded text-text-primary"/>
            <button onClick={async()=>{
              if(!wlNewRule.name)return;
              try{await apiRequest('/ai-api/whitelist/rules',{method:'POST',body:{name:wlNewRule.name,conditions:{[wlNewRule.conditions[0].field]:wlNewRule.conditions[0].value},reason:wlNewRule.reason}});addToast('success','已添加');loadWlRules();setWlNewRule({name:'',reason:'',conditions:[{field:'src_ip',op:'eq',value:''}]});}catch(e:any){addToast('error',e.message);}
            }} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500">添加</button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {wlRules.length===0 ? (
              <div className="text-[10px] text-text-muted text-center py-2">暂无自定义规则</div>
            ) : wlRules.slice(0,5).map((rule:any,i:number)=>(
              <div key={i} className="flex items-center justify-between px-2 py-1 bg-page-bg rounded border border-border-color text-[10px]">
                <span className="text-text-primary truncate">{rule.name} <span className="text-text-muted">{JSON.stringify(rule.conditions)}</span></span>
                <button onClick={async()=>{try{await apiRequest('/ai-api/whitelist/rules/'+i,{method:'DELETE'});addToast('success','已删除');loadWlRules();}catch(e){}}} className="p-0.5 text-text-muted hover:text-red-400 flex-shrink-0"><Trash2 className="w-3 h-3"/></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

function renderAutomationCenter() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2"><GitBranch className="w-5 h-5 text-emerald-400"/>自动化规则</h2>
          <button onClick={()=>setMainTab('config')} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500 transition-all active:scale-95">前往配置</button>
        </div>
        <p className="text-xs text-text-muted mb-3">配置告警处理流程、审批规则和Agent启用状态</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card-bg border border-border-color rounded-xl p-4">
            <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-amber-400"/>审批规则</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-page-bg rounded-lg border border-border-color">
                <span className="text-xs text-text-primary">block_ip（封禁IP）</span>
                <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">需审批</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-page-bg rounded-lg border border-border-color">
                <span className="text-xs text-text-primary">isolate_host（隔离主机）</span>
                <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">需审批</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-page-bg rounded-lg border border-border-color">
                <span className="text-xs text-text-primary">query_alerts（查询告警）</span>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">直接执行</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-page-bg rounded-lg border border-border-color">
                <span className="text-xs text-text-primary">nl_query（NL查询）</span>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">直接执行</span>
              </div>
            </div>
          </div>
          <div className="bg-card-bg border border-border-color rounded-xl p-4">
            <h3 className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2"><Cpu className="w-4 h-4 text-purple-400"/>Agent 状态</h3>
            <div className="space-y-2">
              {[
                {name:'alert_analyzer',status:'启用',desc:'告警分析+分诊'},
                {name:'event_copilot',status:'启用',desc:'事件协查'},
                {name:'threat_intel',status:'启用',desc:'威胁情报'},
                {name:'investigator',status:'启用',desc:'攻击溯源'},
                {name:'nl_analyst',status:'启用',desc:'NL查询'},
                {name:'skill_operator',status:'启用',desc:'技能执行'},
              ].map(a=>(
                <div key={a.name} className="flex items-center justify-between p-2 bg-page-bg rounded-lg border border-border-color">
                  <div><div className="text-xs text-text-primary">{a.name}</div><div className="text-[9px] text-text-muted">{a.desc}</div></div>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

function renderCapabilities() {
    const agents = [
      {name:'alert_analyzer',role:'安全告警分析师',color:'from-red-500 to-orange-600',icon:AlertTriangle,
       desc:'分析告警数据，评估风险等级，识别威胁模式',tools:['timescaledb_query','query_alerts','create_incident'],
       prompts:['分析最近的高危告警','分析告警','识别威胁模式','批量分析告警']},
      {name:'event_copilot',role:'事件协查专家',color:'from-blue-500 to-indigo-600',icon:Shield,
       desc:'关联告警、资产、攻击源，输出事件评价和处置建议',tools:['event_analysis','timescaledb_query'],
       prompts:['分析事件 EVT-xxx','协查事件编号 INC-xxx','分析安全事件']},
      {name:'triage_expert',role:'告警分诊专家',color:'from-amber-500 to-yellow-600',icon:Target,
       desc:'判断误报概率、评估优先级、给出处置建议',tools:['query_alerts','timescaledb_query'],
       prompts:['分析以下告警的误报概率','告警分诊','优先级评估']},
      {name:'threat_intel',role:'威胁情报分析师',color:'from-purple-500 to-violet-600',icon:Search,
       desc:'查询IP/域名的威胁情报，关联告警上下文',tools:['timescaledb_query'],
       prompts:['查询IP 8.8.8.8的威胁情报','IP情报分析','查询域名']},
      {name:'incident_respond',role:'安全响应专家',color:'from-emerald-500 to-green-600',icon:Zap,
       desc:'根据事件风险决定处置动作：封禁、隔离、通知',tools:['timescaledb_query','create_incident'],
       prompts:['封禁IP 192.168.1.1','隔离主机 webserver-01','评估事件风险']},
      {name:'investigator',role:'攻击溯源专家',color:'from-cyan-500 to-blue-600',icon:GitBranch,
       desc:'分析攻击链、MITRE ATT&CK映射、时间线',tools:['timescaledb_query','mitre_attack'],
       prompts:['追踪事件 INC-xxx 的攻击链','溯源分析事件','攻击链分析']},
      {name:'nl_analyst',role:'安全数据查询员',color:'from-teal-500 to-emerald-600',icon:MessageCircle,
       desc:'将自然语言转换为数据库查询',tools:['nl_query','timescaledb_query'],
       prompts:['过去24小时的高危告警','查询最近的SQL注入攻击','列出所有告警类型']},
      {name:'skill_operator',role:'安全操作工程师',color:'from-pink-500 to-rose-600',icon:Terminal,
       desc:'匹配并执行已注册的安全操作技能',tools:['skill_execute','timescaledb_query'],
       prompts:['执行封禁IP','查看白名单规则','添加白名单']},
    ];
    const workflows = [
      {step:'用户输入',icon:MessageSquare,color:'text-blue-400',desc:'在对话框输入安全需求'},
      {step:'意图识别',icon:Cpu,color:'text-purple-400',desc:'自动识别7种安全分析意图'},
      {step:'Agent执行',icon:Bot,color:'text-emerald-400',desc:'CrewAI Agent团队调用工具执行'},
      {step:'结果汇总',icon:CheckCircle,color:'text-amber-400',desc:'返回分析结论和处置建议'},
    ];
    return (
      <div className="space-y-6">
        {/* 工作流概览 */}
        <div className="bg-card-bg border border-border-color rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"><GitBranch className="w-4 h-4 text-blue-400"/>编排工作流</h3>
          <div className="grid grid-cols-4 gap-3">
            {workflows.map((w,i) => (
              <div key={i} className="relative">
                <div className="flex flex-col items-center text-center p-3 bg-page-bg rounded-lg border border-border-color">
                  <w.icon className={'w-6 h-6 mb-1.5 '+w.color}/>
                  <div className="text-xs font-medium text-text-primary">{w.step}</div>
                  <div className="text-[10px] text-text-muted mt-0.5">{w.desc}</div>
                </div>
                {i<workflows.length-1&&<div className="hidden lg:block absolute top-1/2 -right-2 w-4 h-0.5 bg-border-color"><ChevronRight className="w-3 h-3 text-text-muted -mt-1.5 ml-1"/></div>}
              </div>
            ))}
          </div>
        </div>

        {/* Agent 团队 */}
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2"><Bot className="w-4 h-4 text-purple-400"/>AI Agent 团队</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {agents.map(a => (
              <div key={a.name} className="bg-card-bg border border-border-color rounded-xl overflow-hidden hover:bg-card-bg-hover transition-colors">
                <div className={'h-2 bg-gradient-to-r '+a.color}/>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={'w-7 h-7 rounded-lg bg-gradient-to-br '+a.color+' flex items-center justify-center'}><a.icon className="w-4 h-4 text-white"/></div>
                    <div><div className="text-xs font-semibold text-text-primary">{a.name}</div><div className="text-[10px] text-text-muted">{a.role}</div></div>
                  </div>
                  <p className="text-[10px] text-text-secondary leading-relaxed mb-2">{a.desc}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {a.tools.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">{t}</span>)}
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[9px] text-text-muted font-medium">示例：</div>
                    {a.prompts.slice(0,2).map((p,i) => <div key={i} className="text-[9px] text-text-muted/70 bg-page-bg rounded px-1.5 py-0.5 truncate">{p}</div>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="bg-card-bg border border-border-color rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400"/>快速开始</h3>
            <button onClick={()=>{setAnalysisSub('chat');}} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-all active:scale-95">前往对话</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {label:'批量分析告警',action:'分析告警',color:'bg-red-500/10 text-red-400 border-red-500/20'},
              {label:'查看帮助',action:'帮助',color:'bg-blue-500/10 text-blue-400 border-blue-500/20'},
              {label:'IP情报查询',action:'查询IP 8.8.8.8的威胁情报',color:'bg-purple-500/10 text-purple-400 border-purple-500/20'},
              {label:'封禁IP',action:'封禁IP 192.168.1.1',color:'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'},
            ].map((item,i) => (
              <button key={i} onClick={()=>{setInputMsg(item.action);setAnalysisSub('chat');}}
                className={'px-3 py-2 rounded-lg text-xs font-medium border transition-all hover:brightness-110 text-left '+item.color}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderChat() {
    const memberUsers = teamUsers.filter(u => !u.isAI && String(u.id) !== String(user?.id));

    const handleMentionSelect = (u: any) => {
      setTeamChatWith(u.id);
      setShowMentionMenu(false);
      const isGrp = typeof u.id === 'string' && u.id.startsWith('group_');
      addToast('info', isGrp ? `进入群聊「${u.name}」` : `正在与 ${u.name} 对话`, 2000);
      setTimeout(() => { const el = document.querySelector('.chat-input'); if(el) (el as HTMLInputElement).focus(); }, 100);
    };

    const handleSendMessage = () => {
      const msg = inputMsg.trim();
      if (!msg) return;
      if (false) {
        handleTeamSend(teamChatWith!);
      } else {
        handleSend();
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputMsg(val);
      // @ 提及仅在群聊中使用
      if (false) {
        const lastAt = val.lastIndexOf('@');
        if (lastAt >= 0 && (lastAt === 0 || val[lastAt-1] === ' ')) {
          const after = val.slice(lastAt + 1);
          if (!after.includes(' ')) {
            setShowMentionMenu(true);
            setMentionFilter(after);
            return;
          }
        }
        setShowMentionMenu(false);
      }
    };

    return (
      <>
      <div className="flex h-full min-h-[calc(100vh-280px)] rounded-xl overflow-hidden border border-border-color bg-card-bg shadow-sm">
        {/* ===== 左侧：联系人面板 ===== */}
        <motion.div 
          initial={false}
          animate={{width:showContacts?280:0}}
          className="flex-shrink-0 border-r border-border-color bg-page-bg/40 overflow-hidden flex flex-col"
        >
          <div className="flex-shrink-0 px-3 py-2.5 border-b border-border-color">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm"><Brain className="w-3.5 h-3.5 text-white" /></div>
              <span className="text-sm font-bold text-text-primary">USOP</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scrollbar-thin">
            {/* AI 分析助手 */}
            <div className={'flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all '+
              'bg-indigo-500/10 text-indigo-400'}
              onClick={()=>{setTeamChatWith(null);}}>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0"><Sparkles className="w-3.5 h-3.5 text-white" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">AI 分析助手</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
              </div>
            </div>

            {/* 分隔线 */}
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div className="flex-1 h-px bg-border-color/30" />
              <span className="text-[8px] text-text-muted/30 font-medium">在线成员</span>
              <div className="flex-1 h-px bg-border-color/30" />
            </div>

            {/* 在线成员列表 */}
            {memberUsers.map(u => {
              return (
              <div key={u.id} className={'flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all '+
                'hover:bg-card-bg-hover text-text-secondary'}
                onClick={()=>{}}>
                <div className={'w-7 h-7 rounded-lg bg-gradient-to-br '+u.color+' flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0'}>{u.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{u.name}</span>
                    <span className={'text-[8px] '+(u.online?'text-emerald-500':'text-gray-400')}>{u.online?'在线':'离线'}</span>
                  </div>
                  <div className="text-[9px] text-text-muted/50 truncate mt-0.5">{u.role}</div>
                </div>
              </div>
              );
            })}
          </div>

        </motion.div>
        {/* ===== 右侧：主对话区 ===== */}
        <div className="flex-1 flex flex-col min-w-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.03),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.03),transparent_60%)]">
          {/* ===== 会话头部 ===== */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-color bg-card-bg/60 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <button onClick={()=>setShowContacts(!showContacts)} 
                className="lg:hidden p-2 text-text-muted hover:text-text-primary rounded-xl hover:bg-card-bg-hover transition-colors">
                <PanelLeft className="w-4 h-4" />
              </button>
              <div className="relative">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card-bg" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">AI 分析助手</span>
                  {defaultLlmId && llmProviders.find(p=>p.id===defaultLlmId) ? (
                    <span className="px-1.5 py-0.5 text-[8px] bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-400 rounded-md font-medium border border-indigo-500/20">{(llmProviders.find(p=>p.id===defaultLlmId) as any)?.name || "AI"}</span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-[8px] bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 rounded-md font-medium border border-emerald-500/20">已配置</span>
                  )}

                </div>
                <div className="text-[10px] text-text-muted/70 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>在线</span>
                  <span className="text-text-muted/30">·</span>
                  <span>智能安全分析引擎</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {(
                <>
                  <button onClick={()=>setShowSessionPanel(!showSessionPanel)} 
                    className="p-2 text-text-muted hover:text-text-primary rounded-xl hover:bg-card-bg-hover transition-colors relative" title="历史会话">
                    <MessageCircle className="w-4 h-4" />
                    {sessions.length>0 && <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-indigo-500 text-[8px] text-white rounded-full flex items-center justify-center font-medium">{sessions.length>9?'9+':sessions.length}</span>}
                  </button>
                  <button onClick={createSession} 
                    className="p-2 text-text-muted hover:text-indigo-400 rounded-xl hover:bg-indigo-500/10 transition-colors" title="新建会话">
                    <Plus className="w-4 h-4" />
                  </button>
                </>
              )}

            </div>
          </div>

          {/* ===== 会话列表面板 ===== */}
          <AnimatePresence>{showSessionPanel&&(
            <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden border-b border-border-color">
              <div className="bg-page-bg/30 p-2 space-y-0.5 max-h-40 overflow-y-auto">
                {sessions.length===0
                  ? <div className="text-xs text-text-muted text-center py-3">暂无历史会话</div>
                  : sessions.map(s=>(
                    <div key={s.id} className={'flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all '+
                      (activeSessionId===s.id?'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20':'hover:bg-card-bg-hover text-text-secondary border border-transparent')}
                      onClick={()=>{loadSession(s.id);setShowSessionPanel(false);}}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{s.title}</span>
                      </div>
                      <button onClick={e=>{e.stopPropagation();setConfirmDialog({open:true,title:'删除会话',message:'确定删除「'+s.title+'」？',onConfirm:()=>deleteSession(s.id)});}} 
                        className="p-1 opacity-0 hover:opacity-100 hover:text-red-400 transition-all"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
              </div>
            </motion.div>
          )}</AnimatePresence>

          {/* ===== 消息区域 ===== */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin">
            {/* 团队对话空状态 */}
            {false && (
              <div className="flex flex-col items-center justify-center h-full text-text-muted py-12">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 flex items-center justify-center mb-4 ring-1 ring-emerald-500/10">
                  <Users className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="text-base font-bold text-text-secondary mb-1">AI 安全分析</div>
                <div className="text-xs text-text-muted max-w-sm text-center leading-relaxed">
                  与 AI 对话，分析告警、溯源攻击链
                </div>
              </div>
            )}

            {/* AI 对话空状态 */}
            {messages.length===0 && (
              <div className="flex flex-col items-center justify-center h-full text-text-muted py-12">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-pink-500/15 flex items-center justify-center mb-5 ring-1 ring-indigo-500/10 shadow-lg shadow-indigo-500/5">
                  <Sparkles className="w-10 h-10 text-indigo-400" />
                </div>
                <div className="text-lg font-bold text-text-secondary mb-1">AI 安全分析助手</div>
                <div className="text-xs text-text-muted mb-6 max-w-md text-center leading-relaxed">
                  {defaultLlmId && llmProviders.find(p=>p.id===defaultLlmId) ? `基于 ${(llmProviders.find(p=>p.id===defaultLlmId) as any)?.name || "已配置"} 大模型的安全运营分析` : "智能安全运营分析助手"}
                </div>
                <div className="grid grid-cols-2 gap-2.5 max-w-lg w-full">
                  {[
                    {icon:AlertTriangle,label:'告警研判',desc:'批量分析告警，识别误报',color:'from-rose-500/20 to-pink-500/20',iconColor:'text-rose-400'},
                    {icon:Radar,label:'攻击链溯源',desc:'追踪攻击路径',color:'from-amber-500/20 to-orange-500/20',iconColor:'text-amber-400'},
                    {icon:FileText,label:'事件分析',desc:'深度分析安全事件',color:'from-blue-500/20 to-cyan-500/20',iconColor:'text-blue-400'},
                    {icon:ShieldCheck,label:'白名单管理',desc:'减少告警噪音',color:'from-emerald-500/20 to-teal-500/20',iconColor:'text-emerald-400'},
                  ].map((item,i)=>(
                    <div key={i} className={'p-3 rounded-xl bg-gradient-to-br '+item.color+' border border-white/5 backdrop-blur-sm'}>
                      <div className="flex items-start gap-2.5">
                        <item.icon className={'w-5 h-5 '+item.iconColor+' flex-shrink-0 mt-0.5'} />
                        <div>
                          <div className="text-xs font-semibold text-text-primary">{item.label}</div>
                          <div className="text-[10px] text-text-muted mt-0.5 leading-relaxed">{item.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI 消息 */}
            {messages.map((m:any,i:number)=>(
              <motion.div key={i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.03}}
                className={'flex items-end gap-2.5 mb-3 '+(m.role==='user'?'flex-row-reverse':'')}>
                <div className={'w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm '+
                  (m.role==='user'?'bg-gradient-to-br from-blue-600 to-cyan-600':'bg-gradient-to-br from-indigo-500 to-purple-600')}>
                  {m.role==='user'?(user?.username||'管').charAt(0):<Sparkles className="w-4 h-4" />}
                </div>
                <div className={'flex flex-col '+(m.role==='user'?'items-end':'items-start')+' max-w-[75%]'}>
                  <div className="flex items-center gap-2 mb-0.5 px-1">
                    <span className="text-[10px] font-medium text-text-muted/60">{m.role==='user'?user?.username||'管理员':'AI 分析助手'}</span>
                    <span className="text-[8px] text-text-muted/30">{m.time||''}</span>
                  </div>
                  <div className={'px-4 py-2.5 text-sm leading-relaxed '+
                    (m.role==='user'
                      ?'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-md shadow-md shadow-blue-500/10'
                      :'bg-card-bg border border-border-color text-text-primary rounded-2xl rounded-bl-md shadow-sm')}>
                    {m.role==='assistant'
                      ? <MarkdownContent content={m.content}/>
                      : <span className="whitespace-pre-wrap">{m.content}</span>
                    }
                  </div>
                  {m.role==='assistant'&&(
                    <div className="flex items-center gap-0.5 mt-1 px-1 opacity-0 hover:opacity-100 transition-opacity">
                      <button onClick={()=>handleFeedback(i,'up')} className={'p-1 rounded-md transition-colors '+(m.feedback==='up'?'text-emerald-400 bg-emerald-500/10':'text-text-muted/30 hover:text-emerald-400 hover:bg-emerald-500/10')}><ThumbsUp className="w-3 h-3"/></button>
                      <button onClick={()=>handleFeedback(i,'down')} className={'p-1 rounded-md transition-colors '+(m.feedback==='down'?'text-red-400 bg-red-500/10':'text-text-muted/30 hover:text-red-400 hover:bg-red-500/10')}><ThumbsDown className="w-3 h-3"/></button>
                      <button onClick={()=>{navigator.clipboard.writeText(m.content);addToast('success','已复制');}} className="p-1 rounded-md text-text-muted/30 hover:text-text-secondary hover:bg-card-bg-hover transition-colors"><Copy className="w-3 h-3"/></button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {/* 流式输出 */}
            {streamingContent&&(
              <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex items-end gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm"><Sparkles className="w-4 h-4 text-white" /></div>
                <div className="flex flex-col items-start max-w-[75%]">
                  <div className="flex items-center gap-2 mb-0.5 px-1"><span className="text-[10px] font-medium text-text-muted/60">AI 分析助手</span></div>
                  <div className="px-4 py-2.5 text-sm bg-card-bg border border-border-color rounded-2xl rounded-bl-md shadow-sm">
                    <MarkdownContent content={streamingContent}/>
                    <span className="inline-block w-2 h-4 bg-indigo-400/60 ml-0.5 animate-pulse rounded-sm"/>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 加载中 */}
            {chatLoading&&!streamingContent&&(
              <div className="flex items-end gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm"><Sparkles className="w-4 h-4 text-white" /></div>
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-0.5 px-1"><span className="text-[10px] font-medium text-text-muted/60">AI 分析助手</span></div>
                  <div className="px-5 py-3.5 bg-card-bg border border-border-color rounded-2xl rounded-bl-md shadow-sm">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-indigo-400/50 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                      <div className="w-2 h-2 bg-indigo-400/50 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                      <div className="w-2 h-2 bg-indigo-400/50 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ===== 底部输入区 ===== */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-border-color bg-card-bg/80 backdrop-blur-xl relative">
            {/* @提及菜单 */}
            <AnimatePresence>{showMentionMenu&&(()=>{const mentionList = memberUsers; return mentionList.filter((u:any)=>!mentionFilter||u.name.includes(mentionFilter)).length>0;})()&&(
              <motion.div initial={{opacity:0,y:8,scale:0.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:8,scale:0.95}}
                className="absolute bottom-full left-4 mb-2 w-72 bg-card-bg border border-border-color rounded-xl shadow-xl overflow-hidden">
                <div className="p-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                  <div className="px-2.5 py-1.5 text-[9px] text-text-muted/50 font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <AtSign className="w-3 h-3" /> {'提及成员'}
                  </div>
                  {(false 
                    ? memberUsers
                    : memberUsers
                  ).filter((u:any)=>!mentionFilter||u.name.includes(mentionFilter)).map(u=>(
                    <button key={u.id} onClick={()=>{
                      // 直接在输入框插入 @name，不切换对话
                      setInputMsg(prev => {
                        const lastAt = prev.lastIndexOf('@');
                        if (lastAt >= 0) return prev.slice(0, lastAt) + '@' + u.name + ' ';
                        return prev + '@' + u.name + ' ';
                      });
                      setShowMentionMenu(false);
                      setTimeout(() => { const el = document.querySelector('.chat-input'); if(el) (el as HTMLInputElement).focus(); }, 0);
                    }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-card-bg-hover transition-colors text-left">
                      <div className={'w-7 h-7 rounded-lg bg-gradient-to-br '+u.color+' flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0'}>{u.avatar}</div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-text-primary">@{u.name}</span>
                        <span className="text-text-muted ml-1.5">{u.role}</span>
                      </div>
                      <span className={'text-[8px] px-1.5 py-0.5 rounded-full '+(u.online?'bg-emerald-500/10 text-emerald-500':'bg-gray-500/10 text-gray-400')}>{u.online?'在线':'离线'}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}</AnimatePresence>

            {/* 快捷操作 */}
            {true && (
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {(quickActions||[]).map((qa:any,i:number)=>(
                <button key={qa.id||i} onClick={qa.action} 
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-text-muted hover:text-text-primary bg-page-bg border border-border-color rounded-lg hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all">
                  <qa.icon className="w-3 h-3" style={{color:qa.color}}/>{qa.label}
                </button>
              ))}
            </div>
            )}
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <input 
                  value={inputMsg} 
                  onChange={handleInputChange}
                  onKeyDown={e=>{
                    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSendMessage();}
                    if(e.key==='Escape')setShowMentionMenu(false);
                  }}
                  onBlur={()=>setTimeout(()=>setShowMentionMenu(false), 200)}
                  placeholder='输入安全事件信息，AI 将辅助分析...'
                  disabled={chatLoading}
                  className="w-full chat-input px-4 py-2.5 bg-page-bg border border-border-color rounded-xl text-sm text-text-primary placeholder:text-text-muted/40 disabled:opacity-50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all outline-none" />
              </div>
              <button onClick={handleSendMessage} 
                disabled={!inputMsg.trim()||chatLoading}
                className="px-5 py-2.5 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:from-indigo-500 hover:to-purple-500 transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-indigo-500/20">
                {chatLoading
                  ? <Loader2 className="w-4 h-4 animate-spin"/>
                  : <Send className="w-4 h-4"/>
                }<span className="hidden sm:inline">发送</span>
              </button>
            </div>
          </div>
        </div>
      </div>


    </>
    );
  }

  // ==================== 深度分析 ====================
  function renderAutomation() {
    const tabs = [{id:'respond',label:'智能响应',icon:ShieldCheck},{id:'skills',label:'技能中心',icon:Terminal}];
    return (
      <div>
        <SubTabBar tabs={tabs} active={autoActiveSubTab} onChange={setAutoActiveSubTab} color="#60a5fa" />
        <div className="mt-4">
          {autoActiveSubTab==='respond' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-card-bg border border-emerald-500/20 rounded-xl p-4">
                <div className="flex items-start gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5"/>
                  <div><h3 className="text-sm font-semibold text-text-primary">智能响应</h3><p className="text-xs text-text-muted mt-0.5">系统将根据以下固定提示词进行风险决策：</p></div>
                </div>
                <div className="p-2.5 bg-page-bg rounded-lg border border-border-color text-[11px] text-text-muted leading-relaxed mb-3">
                  <span className="text-emerald-400 font-medium">系统提示词：</span>你是一个安全响应专家。根据事件风险等级自动决定处置动作，包括封禁 IP、隔离主机、发送告警通知等。评估威胁等级并给出明确的处置建议。
                </div>
                <label className="block text-xs text-text-secondary mb-1 font-medium">事件编号</label>
                <div className="flex gap-2 mb-3">
                  <input value={autoEventCode} onChange={e=>setAutoEventCode(e.target.value)} placeholder="输入事件编号" className="flex-1 px-3 py-2 bg-page-bg border border-border-color rounded-lg text-xs font-mono text-text-primary" />
                  <button onClick={handleAutoRespond} disabled={autoLoading||!autoEventCode} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-emerald-500 transition-all active:scale-95 flex items-center gap-1">{autoLoading?<Loader2 className="w-3 h-3 animate-spin"/>:<Zap className="w-3 h-3"/>}分析</button>
                </div>

              </div>
              <div className="lg:col-span-2">
                {(autoResult?.decisions||[]).map((d:any,i:number)=>(
                  <div key={i} className="flex items-center gap-3 p-3 bg-card-bg border border-border-color rounded-lg mb-2 hover:bg-card-bg-hover transition-colors">
                    <span className={'px-2 py-0.5 rounded text-xs font-medium '+(d.status==='auto_executed'?'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20':'bg-amber-500/10 text-amber-400 border border-amber-500/20')}>{d.action}</span>
                    <span className="text-sm text-text-primary flex-1">{d.target}</span>
                    <span className="text-xs text-text-muted hidden md:block">{d.reason||'-'}</span>
                    <span className={'text-xs flex items-center gap-1 '+(d.auto_execute?'text-emerald-400':'text-amber-400')}>{d.auto_execute?<Check className="w-3 h-3"/>:<Clock className="w-3 h-3"/>}{d.auto_execute?'自动':'待审'}</span>
                  </div>
                ))}
                {autoResult?.error&&<div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300"><AlertTriangle className="w-3.5 h-3.5 inline mr-1"/>{autoResult.error}</div>}
                {!autoLoading&&!autoResult&&<div className="flex flex-col items-center justify-center py-16 text-text-muted"><ShieldCheck className="w-8 h-8 mb-2 opacity-30"/><div className="text-xs">输入事件编号查看 AI 处置建议</div></div>}
              </div>
            </div>
          )}
          {autoActiveSubTab==='skills' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-card-bg border border-purple-500/20 rounded-xl p-4">
                <div className="flex items-start gap-2 mb-3">
                  <Terminal className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5"/>
                  <div><h3 className="text-sm font-semibold text-text-primary">技能中心</h3><p className="text-xs text-text-muted mt-0.5">系统将根据以下固定提示词执行安全操作：</p></div>
                </div>
                <div className="p-2.5 bg-page-bg rounded-lg border border-border-color text-[11px] text-text-muted leading-relaxed mb-3">
                  <span className="text-purple-400 font-medium">系统提示词：</span>你是一个安全操作执行专家。根据自然语言指令，匹配已注册的安全技能并执行相应操作。支持封禁 IP、隔离主机、查询威胁情报等操作。
                </div>
                <label className="block text-xs text-text-secondary mb-1 font-medium">操作指令</label>
                <input value={skillInstruction} onChange={e=>setSkillInstruction(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSkillRoute()} placeholder='例如: "封禁 IP 192.168.1.1"' className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-xs text-text-primary mb-2" />
                <button onClick={handleSkillRoute} disabled={skillLoading||!skillInstruction} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-purple-500 transition-all active:scale-95 flex items-center justify-center gap-1.5 mb-2">{skillLoading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Play className="w-3.5 h-3.5"/>}执行</button>

                {skillResult&&!skillResult?.error&&(
                  <div className="mt-3 p-3 bg-card-bg border border-purple-500/20 rounded-lg text-xs">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-border-color mb-2"><CheckCircle className="w-3 h-3 text-emerald-400"/><span className="text-text-muted">选定技能:</span><span className="font-medium text-purple-400">{skillResult.selected_skill||'-'}</span></div>
                    <pre className="text-xs bg-page-bg p-2 rounded font-mono text-text-secondary overflow-x-auto">{typeof skillResult.result==='object'?JSON.stringify(skillResult.result,null,2):skillResult.result}</pre>
                  </div>
                )}
              </div>
              <div className="lg:col-span-2">
                <h3 className="text-sm font-semibold text-text-primary mb-3"><Blocks className="w-4 h-4 text-purple-400 inline mr-1"/>已注册技能 ({skills.length})</h3>
                {skills.length===0
                  ?<div className="flex flex-col items-center justify-center py-16 text-text-muted"><Terminal className="w-8 h-8 mb-2 opacity-30"/><div className="text-xs">暂无注册技能</div></div>
                  :<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{skills.map((s:any)=>(
                      <div key={s.name} className="flex items-start gap-3 p-3 bg-card-bg border border-border-color rounded-lg hover:bg-card-bg-hover transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0"><Terminal className="w-4 h-4 text-purple-400"/></div>
                        <div className="min-w-0 flex-1"><div className="text-sm font-medium text-text-primary">{s.name}</div><div className="text-xs text-text-muted mt-0.5 truncate">{s.description}</div></div>
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full whitespace-nowrap">就绪</span>
                      </div>
                    ))}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== AI 配置 — 模型管理 ====================
  function renderModels() {
    const llmForm = () => (
      <div className="p-4 bg-card-bg border border-blue-500/20 rounded-xl mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">名称</label><input value={editingLlm?.name||''} onChange={e=>setEditingLlm({...editingLlm,name:e.target.value})} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary" placeholder="DeepSeek Chat"/></div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">提供商</label>
            <select value={editingLlm?.type||'openai_compatible'} onChange={e=>{
              const t=e.target.value;
              const defaults:{[k:string]:{base_url:string;model:string}}={
                'openai_compatible':{base_url:'https://api.openai.com/v1',model:'gpt-4o'},
                'deepseek':{base_url:'https://api.deepseek.com/v1',model:'deepseek-chat'},
                'anthropic':{base_url:'https://api.anthropic.com/v1',model:'claude-3-opus-20240229'},
              };
              const d=defaults[t]||{base_url:'',model:''};
              setEditingLlm({...editingLlm,type:t,base_url:editingLlm?.base_url||d.base_url,model:editingLlm?.model||d.model});
            }}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary">
              <option value="openai_compatible">OpenAI 兼容</option>
              <option value="deepseek">DeepSeek</option>
              <option value="anthropic">Anthropic</option>
            </select>
            <p className="text-[10px] text-text-muted mt-1">选择后自动填充默认服务地址和模型名，可手动修改</p>
          </div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">服务地址 <span className="text-text-muted font-normal">(LLM API 端点)</span></label><input value={editingLlm?.base_url||''} onChange={e=>setEditingLlm({...editingLlm,base_url:e.target.value})} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm font-mono text-text-primary" placeholder="https://api.openai.com/v1"/></div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">API Key</label><input type="password" value={editingLlm?.api_key||''} onChange={e=>setEditingLlm({...editingLlm,api_key:e.target.value})} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary"/></div>
          <div className="md:col-span-2"><label className="block text-xs text-text-secondary mb-1 font-medium">模型名称</label>
            <input value={editingLlm?.model||''} onChange={e=>setEditingLlm({...editingLlm,model:e.target.value})} className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm font-mono text-text-primary" placeholder="例如: gpt-4o / deepseek-chat / claude-3-opus-20240229"/></div>
          <div className="md:col-span-2"><label className="block text-xs text-text-secondary mb-1 font-medium">
            温度 <span className="text-text-muted font-normal">(Temperature) — 控制输出随机性，0=精准确定，1=创意平衡，2=高度随机</span>
          </label>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={2} step={0.1} value={editingLlm?.temperature??0.7}
                onChange={e=>setEditingLlm({...editingLlm,temperature:parseFloat(e.target.value)})}
                className="flex-1 h-1.5 bg-page-bg rounded-full appearance-none cursor-pointer accent-blue-500" />
              <span className="text-xs font-mono text-text-primary w-8 text-right">{editingLlm?.temperature??0.7}</span>
            </div>
          </div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">最大 Token (Max Tokens)</label>
            <input type="number" min={1} max={128000} step={1} value={editingLlm?.max_tokens??4096}
              onChange={e=>setEditingLlm({...editingLlm,max_tokens:parseInt(e.target.value)||4096})}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm font-mono text-text-primary" placeholder="4096"/></div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">超时 (Timeout) 秒</label>
            <input type="number" min={5} max={300} step={5} value={editingLlm?.timeout??60}
              onChange={e=>setEditingLlm({...editingLlm,timeout:parseInt(e.target.value)||60})}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm font-mono text-text-primary" placeholder="60"/></div>
        </div>
        <div className="flex gap-2 justify-end"><button onClick={()=>setShowAddLlm(false)} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary">取消</button>
          <button onClick={async()=>{if(!editingLlm?.name){addToast('error','请填写名称');return;}setLlmFormLoading(true);try{if(editingLlm.id)await aiApi.updateLlmProvider(editingLlm.id,editingLlm);else await aiApi.addLlmProvider(editingLlm);setLlmProviders((await aiApi.getLlmProviders()).data||[]);setShowAddLlm(false);addToast('success',editingLlm.id?'已更新':'已添加');}catch{addToast('error','保存失败');}setLlmFormLoading(false);}}
            disabled={llmFormLoading} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 flex items-center gap-1.5">{llmFormLoading?<Loader2 className="w-3 h-3 animate-spin"/>:<Save className="w-3 h-3"/>}保存</button></div>
      </div>
    );
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div><h3 className="text-sm font-semibold text-text-primary"><Brain className="w-4 h-4 text-blue-400 inline mr-1"/>大模型接口</h3><p className="text-xs text-text-muted mt-0.5">支持 OpenAI / DeepSeek / Anthropic</p></div>
          <button onClick={()=>{setShowAddLlm(true);setEditingLlm({type:'openai_compatible',enabled:true});}} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-all active:scale-95"><Plus className="w-3.5 h-3.5"/>添加</button>
        </div>
        <AnimatePresence>{showAddLlm&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">{llmForm()}</motion.div>}</AnimatePresence>
        <div className="space-y-2">{(llmProviders||[]).length===0
          ?<div className="flex flex-col items-center justify-center py-12 text-text-muted"><Server className="w-8 h-8 mb-2 opacity-30"/><div className="text-xs">暂无模型配置</div></div>
          :llmProviders.map((pr:any)=>(
              <div key={pr.id} className="flex items-center justify-between p-3 bg-card-bg border border-border-color rounded-lg hover:bg-card-bg-hover transition-colors">
                <div className="flex items-center gap-3 min-w-0"><div className={'w-2.5 h-2.5 rounded-full flex-shrink-0 '+(pr.enabled!==false?'bg-emerald-500':'bg-gray-600')}/><div className="min-w-0"><div className="text-sm font-medium text-text-primary">{pr.name}</div><div className="text-xs text-text-muted font-mono">{pr.type} · {pr.model||'-'}</div></div></div>
                <div className="flex items-center gap-1">
                  <button onClick={()=>{setEditingLlm(pr);setShowAddLlm(true);}} className="p-1.5 text-text-muted hover:text-blue-400 rounded-lg hover:bg-card-bg-hover"><Edit3 className="w-3.5 h-3.5"/></button>
                  <button onClick={async()=>{try{await aiApi.setDefaultLlmProvider(pr.id);setDefaultLlmId(pr.id);addToast('success','已设为系统默认');}catch{addToast('error','设置失败');}}} className={"p-1.5 rounded-lg hover:bg-card-bg-hover "+(defaultLlmId===pr.id?'text-amber-400':'text-text-muted hover:text-amber-400')} title={defaultLlmId===pr.id?'当前系统默认':'设为系统默认'}><Star className={"w-3.5 h-3.5 "+(defaultLlmId===pr.id?'fill-current':'')}/></button>
                  <button onClick={()=>{setEditingLlm(pr);setShowAddLlm(true);}} className="p-1.5 text-text-muted hover:text-blue-400 rounded-lg hover:bg-card-bg-hover"><Edit3 className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>{if(window.confirm('确定删除「'+pr.name+'」？')){(async()=>{try{await aiApi.deleteLlmProvider(pr.id);setLlmProviders((await aiApi.getLlmProviders()).data||[]);addToast('success','已删除');}catch{addToast('error','删除失败');}})();}}} className="p-1.5 text-text-muted hover:text-red-400 rounded-lg hover:bg-card-bg-hover"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            ))}</div>
      </div>
    );
  }

  // ==================== AI 配置 — Agent管理 ====================
  function renderApproval() {
    const [approvalRules, setApprovalRules] = useState<any[]>([]);
    const [approvalHistory, setApprovalHistory] = useState<any[]>([]);
    const [activeApprovalTab, setActiveApprovalTab] = useState<'pending'|'rules'|'history'>('pending');
    
    const refresh = async () => {
      setApprovalLoading(true);
      try { 
        const [p, r, h] = await Promise.all([
          apiRequest('/ai-api/approval/pending'),
          apiRequest('/ai-api/approval/rules'),
          apiRequest('/ai-api/approval/history'),
        ]); 
        if (p.success) setPendingActions(p.data||[]);
        if (r.success) setApprovalRules(Object.entries(r.data||{}).map(([k,v]:any)=>({key:k,...v})));
        if (h.success) setApprovalHistory(h.data||[]);
      } catch { /* ignore */ }
      setApprovalLoading(false);
    };

    // 加载角色列表
    const [roles, setRoles] = useState<any[]>([]);
    useEffect(() => {
      apiRequest('/roles-api/roles').then(r => { if(r.success) setRoles(r.data||[]); }).catch(()=>{});
      refresh();
    }, []);

    const getLevelBadge = (level: number) => {
      if (level === 1) return <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">L1 自动</span>;
      if (level === 2) return <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/10 text-amber-400 rounded-md border border-amber-500/20">L2 主管审批</span>;
      return <span className="px-1.5 py-0.5 text-[9px] bg-red-500/10 text-red-400 rounded-md border border-red-500/20">L3 高级审批</span>;
    };

    return (
      <div>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-text-primary"><ShieldCheck className="w-4 h-4 text-amber-400 inline mr-1"/>审批管理</h3>
          <p className="text-xs text-text-muted mt-0.5">基于角色等级的分级审批：L1自动执行 → L2主管审批 → L3高级管理审批</p>
        </div>

        {/* Tab切换 */}
        <div className="flex gap-1 bg-page-bg p-0.5 rounded-lg border border-border-color mb-3">
          {[
            {id:'pending',label:`待审批 (${pendingActions.length})`,icon:Clock},
            {id:'rules',label:'审批规则',icon:ShieldCheck},
            {id:'history',label:'审批历史',icon:List},
          ].map(t => (
            <button key={t.id} onClick={()=>setActiveApprovalTab(t.id as any)}
              className={'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all '+
                (activeApprovalTab===t.id?'bg-card-bg text-text-primary shadow-sm border border-border-color':'text-text-muted hover:text-text-secondary')}>
              <t.icon className="w-3 h-3"/>{t.label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={refresh} disabled={approvalLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card-bg border border-border-color rounded-md text-xs text-text-secondary hover:text-text-primary transition-all disabled:opacity-40">
            <RefreshCw className={'w-3 h-3 '+(approvalLoading?'animate-spin':'')}/>
          </button>
        </div>

        {/* ===== 待审批 ===== */}
        {activeApprovalTab==='pending' && (
          <>
            {pendingActions.length===0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                <CheckCircle className="w-10 h-10 mb-3 opacity-20"/>
                <div className="text-sm font-medium text-text-secondary">全部已处理</div>
                <div className="text-xs mt-1">暂无待审批的操作请求</div>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingActions.map(a => (
                  <div key={a.id} className="bg-card-bg border border-border-color rounded-xl p-4 hover:border-amber-500/30 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={'px-2 py-0.5 rounded text-xs font-medium '+
                          (a.approval_level===3?'bg-red-500/10 text-red-400 border border-red-500/20':
                           a.approval_level===2?'bg-amber-500/10 text-amber-400 border border-amber-500/20':
                           'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')}>
                          {a.label||a.type}
                        </span>
                        {getLevelBadge(a.approval_level||2)}
                        <span className="text-[9px] text-text-muted font-mono">{a.id}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-text-muted">{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted mb-3">
                      <span>发起: {a.requested_by||'system'}</span>
                      {a.approval_level>=2 && <span className="text-amber-400/70">需要: {roles.find(r=>r.approval_level>=a.approval_level)?.name||'主管'} 审批</span>}
                    </div>
                    <div className="text-xs text-text-secondary mb-3 bg-page-bg rounded-lg p-2.5 space-y-0.5 border border-border-color/50">
                      {Object.entries(a.params||{}).map(([k,v]) => (
                        <div key={k} className="flex"><span className="text-text-muted w-20 flex-shrink-0">{k}:</span><span className="text-text-primary font-mono">{String(v)}</span></div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={async()=>{try{await apiRequest('/ai-api/orchestrate/approve',{method:'POST',body:{action_id:a.id,approved:true}});addToast('success','已批准，操作已执行');refresh();}catch(e:any){addToast('error',e.message);}}}
                        className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500 transition-all active:scale-95 shadow-sm">批准执行</button>
                      <button onClick={async()=>{try{await apiRequest('/ai-api/orchestrate/approve',{method:'POST',body:{action_id:a.id,approved:false}});addToast('info','已拒绝');refresh();}catch(e:any){addToast('error',e.message);}}}
                        className="px-4 py-1.5 bg-red-600/80 text-white rounded-lg text-xs font-medium hover:bg-red-500 transition-all active:scale-95">拒绝</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== 审批规则 ===== */}
        {activeApprovalTab==='rules' && (
          <div className="space-y-3">
            <div className="bg-card-bg border border-border-color rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border-color bg-page-bg/30">
                <h4 className="text-xs font-semibold text-text-primary">审批等级说明</h4>
              </div>
              <div className="p-3 space-y-2">
                {[
                  {level:1,label:'L1 — 自动执行',color:'text-emerald-400',desc:'低风险操作，无需人工审批，自动执行',roles:'安全运维、安全分析师',examples:'白名单添加'},
                  {level:2,label:'L2 — 主管审批',color:'text-amber-400',desc:'中风险操作，需要主管级审批',roles:'安全分析师（及以上）',examples:'IP封禁、IP解封、文件隔离、进程终止、密码重置'},
                  {level:3,label:'L3 — 高级审批',color:'text-red-400',desc:'高风险操作，需要高级管理审批',roles:'安全主管、超级管理员',examples:'主机隔离、防火墙修改'},
                ].map((item,i) => (
                  <div key={i} className="p-3 rounded-lg bg-page-bg border border-border-color/50">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={'text-xs font-bold '+item.color}>{item.label}</span>
                      <span className="text-[9px] text-text-muted/50">{item.desc}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-text-muted">
                      <span>审批角色: {item.roles}</span>
                      <span>操作: {item.examples}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card-bg border border-border-color rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border-color bg-page-bg/30">
                <h4 className="text-xs font-semibold text-text-primary">操作类型与审批等级</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-color bg-page-bg/50">
                      <th className="text-left p-2.5 text-text-muted font-medium">操作</th>
                      <th className="text-left p-2.5 text-text-muted font-medium">审批等级</th>
                      <th className="text-left p-2.5 text-text-muted font-medium">风险</th>
                      <th className="text-left p-2.5 text-text-muted font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalRules.map(r => (
                      <tr key={r.key} className="border-b border-border-color/50 hover:bg-page-bg/30 transition-colors">
                        <td className="p-2.5 font-medium text-text-primary">{r.label}</td>
                        <td className="p-2.5">{getLevelBadge(r.level)}</td>
                        <td className="p-2.5">
                          <span className={'px-1.5 py-0.5 text-[9px] rounded-md '+
                            (r.risk==='高'?'bg-red-500/10 text-red-400':
                             r.risk==='中'?'bg-amber-500/10 text-amber-400':
                             'bg-emerald-500/10 text-emerald-400')}>{r.risk}</span>
                        </td>
                        <td className="p-2.5 text-text-muted">{r.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-card-bg border border-border-color rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border-color bg-page-bg/30">
                <h4 className="text-xs font-semibold text-text-primary">角色审批权限</h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-color bg-page-bg/50">
                      <th className="text-left p-2.5 text-text-muted font-medium">角色</th>
                      <th className="text-left p-2.5 text-text-muted font-medium">等级</th>
                      <th className="text-left p-2.5 text-text-muted font-medium">可审批操作</th>
                      <th className="text-left p-2.5 text-text-muted font-medium">自动审批阈值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.filter((r:any)=>!r.is_system||r.id==='admin').map(r => (
                      <tr key={r.id} className="border-b border-border-color/50 hover:bg-page-bg/30 transition-colors">
                        <td className="p-2.5 font-medium text-text-primary">{r.name}</td>
                        <td className="p-2.5">{getLevelBadge(r.approval_level||1)}</td>
                        <td className="p-2.5 text-text-muted">
                          {(!r.can_approve||r.can_approve.length===0||r.can_approve[0]==='*')
                            ? <span className="text-text-primary">全部操作</span>
                            : (r.can_approve||[]).map((a:string)=>approvalRules.find((ar:any)=>ar.key===a)?.label||a).join('、')
                          }
                        </td>
                        <td className="p-2.5">
                          {r.max_auto_approve>0
                            ? <span className="text-emerald-400">前{r.max_auto_approve}次自动</span>
                            : <span className="text-amber-400">全部需审批</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== 审批历史 ===== */}
        {activeApprovalTab==='history' && (
          <div className="space-y-1">
            {approvalHistory.length===0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                <List className="w-8 h-8 mb-2 opacity-20"/>
                <div className="text-xs">暂无审批记录</div>
              </div>
            ) : (
              approvalHistory.reverse().map((a:any,i:number) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-card-bg border border-border-color rounded-lg text-xs">
                  <div className={'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 '+
                    (a.status==='approved'?'bg-emerald-500/10 text-emerald-400':
                     a.status==='rejected'?'bg-red-500/10 text-red-400':
                     'bg-amber-500/10 text-amber-400')}>
                    {a.status==='approved'?<Check className="w-3.5 h-3.5"/>:
                     a.status==='rejected'?<X className="w-3.5 h-3.5"/>:
                     <Clock className="w-3.5 h-3.5"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">{a.label||a.type}</span>
                      <span className={'px-1 py-0.5 text-[8px] rounded '+
                        (a.status==='approved'?'bg-emerald-500/10 text-emerald-400':
                         a.status==='rejected'?'bg-red-500/10 text-red-400':
                         'bg-amber-500/10 text-amber-400')}>
                        {a.status==='approved'?'已批准':a.status==='rejected'?'已拒绝':'待审批'}
                      </span>
                      {getLevelBadge(a.approval_level||2)}
                    </div>
                    <div className="text-[9px] text-text-muted mt-0.5 flex items-center gap-2">
                      <span>发起: {a.requested_by||'-'}</span>
                      {a.approved_by&&<span>审批: {a.approved_by}</span>}
                      <span>{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }  function renderCron() {
    return (
      <div>
        <div className="mb-4"><h3 className="text-sm font-semibold text-text-primary"><RefreshCw className="w-4 h-4 text-blue-400 inline mr-1"/>定时告警分析</h3><p className="text-xs text-text-muted mt-0.5">AI 自动从数据库拉取未分析的告警，批量分析后高风险自动创建安全事件</p></div>
        <div className="bg-card-bg border border-border-color rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-text-primary">立即执行分析</span>
            </div>
            <button onClick={async()=>{setCronLoading(true);try{const r=await apiRequest('/ai-api/cron/analyze-alerts');setCronResult(r.data||r);if(r.success)addToast('success','分析完成');}catch(e:any){addToast('error',e.message);}setCronLoading(false);}}
              disabled={cronLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-blue-500 transition-all active:scale-95 flex items-center gap-1.5">
              {cronLoading?<Loader2 className="w-3 h-3 animate-spin"/>:<Play className="w-3 h-3"/>}执行分析</button>
          </div>
          {cronResult && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-page-bg rounded-lg border border-border-color text-center"><div className="text-lg font-bold text-text-primary">{cronResult.analyzed||0}</div><div className="text-[10px] text-text-muted">已分析告警</div></div>
              <div className="p-3 bg-page-bg rounded-lg border border-border-color text-center"><div className="text-lg font-bold text-emerald-400">{cronResult.events_created||0}</div><div className="text-[10px] text-text-muted">已生成事件</div></div>
              <div className="p-3 bg-page-bg rounded-lg border border-border-color text-center"><div className="text-lg font-bold text-amber-400">{cronResult.high_risk||0}</div><div className="text-[10px] text-text-muted">高风险</div></div>
            </div>
          )}
        </div>
        <div className="bg-card-bg border border-border-color rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4 text-text-muted"/><span className="text-xs font-medium text-text-primary">自动化配置（推荐）</span></div>
          <p className="text-xs text-text-muted mb-3">在生产环境中，建议通过系统定时任务(cron)调用以下接口定期执行分析：</p>
          <div className="bg-page-bg rounded-lg p-3 border border-border-color">
            <code className="text-xs font-mono text-text-secondary">curl http://localhost:5001/api/ai-api/cron/analyze-alerts</code>
          </div>
          <p className="text-xs text-text-muted mt-2">可添加到 crontab：<code className="text-xs font-mono text-blue-400">*/5 * * * * curl http://localhost:5001/api/ai-api/cron/analyze-alerts</code></p>
        </div>
      </div>
    );
  }

  function renderFeedback() {
    return (
      <div>
        <div className="mb-4"><h3 className="text-sm font-semibold text-text-primary"><BookOpen className="w-4 h-4 text-amber-400 inline mr-1"/>知识沉淀与反馈学习</h3><p className="text-xs text-text-muted mt-0.5">记录 AI 分析结果及人工修正，持续提升建议质量</p></div>
        <div className="grid grid-cols-3 gap-4">
          {[
            {icon:FileText,label:'总反馈数',value:feedbackStats?.total||0,color:'text-blue-400',bg:'bg-blue-500/10'},
            {icon:CheckCircle,label:'已采纳',value:feedbackStats?.accepted||0,color:'text-emerald-400',bg:'bg-emerald-500/10'},
            {icon:Gauge,label:'采纳率',value:(feedbackStats?.acceptance_rate||0)+'%',color:'text-amber-400',bg:'bg-amber-500/10'},
          ].map((item,i)=>(
            <div key={i} className="bg-card-bg border border-border-color rounded-xl p-4 text-center metric-card">
              <div className={'w-9 h-9 rounded-lg '+item.bg+' flex items-center justify-center mx-auto mb-2'}><item.icon className={'w-4 h-4 '+item.color}/></div>
              <div className="text-xl font-bold text-text-primary">{item.value}</div>
              <div className="text-xs text-text-muted mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
};

export default AICenter;
