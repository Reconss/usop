import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, MessageSquare, Zap, Shield, Sparkles, Bot, Cpu,
  Search, Target, Activity, ThumbsUp, ThumbsDown, Server,
  AlertTriangle, Loader2, X, Plus, Save, Play,
  Clock, FileText, Trash2, Edit3, Copy, BarChart3, GitBranch,
  Terminal, User, Users, Send, List, MessageCircle, Filter, Check,
  AlertCircle, Settings, PanelLeftClose, PanelLeft,
  RefreshCw, Layers, Lightbulb,
  ShieldCheck, Blocks, BookOpen, Radar, Gauge, Combine,
  Wrench, Upload, FileJson, Flag, Link2, Wifi
} from 'lucide-react';
import { aiApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface LlmProvider { id: string; name: string; type: string; base_url: string; api_key: string; model: string; temperature?: number; max_tokens?: number; timeout?: number; enabled?: boolean; }
interface AgentProvider { id: string; name: string; type: string; endpoint: string; api_key: string; description: string; skills: Skill[]; enabled?: boolean; }
interface Skill { name: string; description: string; }
interface ChatSession { id: string; title: string; created_at: string; message_count?: number; }
interface ToastItem { id: string; type: 'success' | 'error' | 'info'; message: string; duration?: number; }

// ==================== 子组件 ====================
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
  const [mainTab, setMainTab] = useState('analysis');
  const [analysisSub, setAnalysisSub] = useState('chat');
  const [configSub, setConfigSub] = useState('models');

  const [llmProviders, setLlmProviders] = useState<LlmProvider[]>([]);
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
  const [selectedProvider, setSelectedProvider] = useState('');
  const [messages, setMessages] = useState<{role:string;content:string;feedback?:'up'|'down'}[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string|null>(null);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showNlInput, setShowNlInput] = useState(false);
  const [analysisNlQuery, setAnalysisNlQuery] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
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
    { name: user?.username||'管理员', role: user?.role||'安全管理员', avatar: (user?.username||'管').charAt(0), color: 'bg-blue-500', isAI: false },
    { name: 'AI 分析助手', role: '智能分析引擎', avatar: 'AI', color: 'bg-gradient-to-br from-indigo-500 to-purple-600', isAI: true },
  ];

  useEffect(()=>{
    Promise.all([
      aiApi.getLlmProviders().then(r=>r.success&&setLlmProviders(r.data)).catch(()=>{}),
      aiApi.getAgentProviders().then(async r=>{
        if(r.success){
          const providers=r.data||[];
          setAgentProviders(providers);
          // 优先选择本地的 Hermes Agent
          const hermesAgent = providers.find((p:any)=>p.name==='Hermes Agent');
          if(hermesAgent && !selectedProvider){setSelectedProvider('agent:'+hermesAgent.id);}
          // 如果没有 Hermes Agent，自动创建
          if(!providers.find((p:any)=>p.name==='Hermes Agent'||(p.type==='hermes'&&p.endpoint?.includes('localhost:8080')))){
            try{
              const res=await aiApi.addAgentProvider({
                name:'Hermes Agent',type:'hermes',endpoint:'http://localhost:8080',api_key:'',
                description:'本地 Hermes AI Agent，基于 DeepSeek，提供安全分析与自动化能力',
                skills:[{name:'威胁分析',description:'安全事件分析与威胁识别'},{name:'告警分诊',description:'告警优先级评估与误报判断'},{name:'攻击链溯源',description:'MITRE ATT&CK 攻击链映射'}],
                enabled:true
              });
              if(res.success){
                const updated=await aiApi.getAgentProviders();
                if(updated.success)setAgentProviders(updated.data||[]);
              }
            }catch(e){/* Hermes auto-register failed */}
          }
        }
      }).catch(()=>{}),
      aiApi.listSkills().then(r=>r.success&&setSkills(r.data?.skills||[])).catch(()=>{}),
      aiApi.getFeedbackStats().then(r=>r.success&&setFeedbackStats(r.data)).catch(()=>{}),
      aiApi.getSessions().then(r=>r.success&&setSessions(r.data||[])).catch(()=>{}),
    ]);
  },[]);

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:'smooth'});},[messages,streamingContent]);
  useEffect(()=>{teamEndRef.current?.scrollIntoView({behavior:'smooth'});},[teamMessages]);

  const loadSession = useCallback(async(id:string)=>{setActiveSessionId(id);setChatLoading(true);try{const r=await aiApi.getSession(id);if(r.success)setMessages(r.data?.messages||[]);}catch{}setChatLoading(false);},[]);
  const createSession = useCallback(async()=>{try{const r=await aiApi.createSession({title:`新会话 ${new Date().toLocaleTimeString()}`});if(r.success){setSessions(p=>[r.data,...p]);setActiveSessionId(r.data.id);setMessages([]);setShowSessionPanel(false);addToast('success','新会话已创建');}}catch{addToast('error','创建失败');}},[addToast]);
  const deleteSession = useCallback(async(id:string)=>{try{await aiApi.deleteSession(id);setSessions(p=>p.filter(s=>s.id!==id));if(activeSessionId===id){setActiveSessionId(null);setMessages([]);}addToast('success','已删除');}catch{addToast('error','删除失败');}},[activeSessionId,addToast]);

  const handleSend = useCallback(async()=>{
    if(!inputMsg.trim()){addToast('info','请输入消息');return;}
    const mentionMatch=inputMsg.match(/@([\w\u4e00-\u9fa5-]+)/);
    let sid=activeSessionId;
    if(!sid){try{const r=await aiApi.createSession({title:inputMsg.slice(0,30)});if(r.success){sid=r.data.id;setActiveSessionId(sid);setSessions(p=>[r.data,...p]);}}catch{addToast('error','创建会话失败');return;}}
    const userMsg={role:'user' as const,content:inputMsg};
    setMessages(p=>[...p,userMsg]);setInputMsg('');setChatLoading(true);setStreamingContent('');
    try{
      // @mention → 直接调用 Agent；否则 → LangGraph 编排
      if(mentionMatch && selectedProvider){
        const agentName=mentionMatch[1];
        const matchedAgent=agentProviders.find(a=>a.enabled!==false&&a.name.includes(agentName));
        const providerId=matchedAgent?'agent:'+matchedAgent.id:selectedProvider;
        const r=await aiApi.invokeAI({provider_id:providerId.split(':')[1],provider_type:providerId.split(':')[0],messages:[...messages,userMsg]});
        if(r.success){const reply=r.data?.choices?.[0]?.message?.content||'无响应';let idx=0;const iv=setInterval(()=>{idx+=3;if(idx>=reply.length){clearInterval(iv);setStreamingContent('');setMessages(p=>[...p,{role:'assistant',content:reply}]);setChatLoading(false);}else setStreamingContent(reply.slice(0,idx));},20);}
        else{setChatLoading(false);addToast('error','AI 响应失败');}
      }else{
        // LangGraph 编排
        const r=await aiApi.orchestrate({query:inputMsg,session_id:sid});
        if(r.success){const reply=r.data?.response||'无响应';let idx=0;const iv=setInterval(()=>{idx+=3;if(idx>=reply.length){clearInterval(iv);setStreamingContent('');setMessages(p=>[...p,{role:'assistant',content:reply}]);setChatLoading(false);}else setStreamingContent(reply.slice(0,idx));},20);}
        else{setChatLoading(false);addToast('error','编排失败');}}
    }catch(e:any){setChatLoading(false);setMessages(p=>[...p,{role:'assistant',content:`请求失败: ${e.message}`}]);addToast('error',e.message);}
  },[inputMsg,selectedProvider,activeSessionId,messages,addToast]);

  const handleFeedback = useCallback(async(i:number,t:'up'|'down')=>{setMessages(p=>p.map((m,j)=>j===i?{...m,feedback:t}:m));try{await aiApi.recordFeedback({message_index:i,feedback:t});addToast('success',t==='up'?'感谢反馈':'已记录');}catch{}},[addToast]);

  const handleTeamSend = () => {
    if(!teamMsg.trim()) return;
    const sender = teamUsers[0]; // current user
    setTeamMessages(p=>[...p,{id:Date.now().toString(),user:sender,content:teamMsg,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}]);
    setTeamMsg('');
    // If AI provider selected, also send to AI
    if(selectedProvider){setInputMsg(teamMsg);setTimeout(()=>handleSend(),100);}
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
    {id:'nl',label:'NL查询',icon:MessageCircle,color:'#34d399',action:()=>setShowNlInput(!showNlInput)},
    {id:'attack',label:'攻击链',icon:GitBranch,color:'#f472b6',action:()=>{setInputMsg('请追踪事件编号的攻击链');}},
    {id:'respond',label:'智能响应',icon:Zap,color:'#10b981',action:()=>{setInputMsg('请评估事件编号 的风险并建议处置');}},
    {id:'intel',label:'威胁情报',icon:Search,color:'#8b5cf6',action:()=>{setInputMsg('查询IP 的威胁情报');}},
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
                <Radar className="w-3 h-3" />分析中心
              </button>
              <button onClick={()=>setMainTab('config')}
                className={'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all '+(mainTab==='config'?'text-white shadow-sm':'text-text-muted hover:text-text-secondary')}
                style={mainTab==='config'?{background:'linear-gradient(135deg, #0ea5e9, #06b6d4)'}:{}}>
                <Wrench className="w-3 h-3" />AI 配置
              </button>
            </div>
          </div>
          <div className="w-px h-6 bg-border-color" />
          <div className="flex-1 min-w-0">
            {mainTab==='analysis' && <SubTabBar tabs={[{id:'chat',label:'智能对话',icon:MessageSquare}]} active={analysisSub} onChange={setAnalysisSub} color="#60a5fa" />}
            {mainTab==='config' && <SubTabBar tabs={[{id:'models',label:'模型管理',icon:Brain},{id:'agents',label:'Agent管理',icon:Bot},{id:'feedback',label:'反馈学习',icon:BookOpen}]} active={configSub} onChange={setConfigSub} color="#38bdf8" />}
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
          <AnimatePresence mode="wait">
            <motion.div key={mainTab+'-'+analysisSub+'-'+configSub} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.12}}>
              {mainTab==='analysis' && analysisSub==='chat' && renderChat()}

              {mainTab==='config' && configSub==='models' && renderModels()}
              {mainTab==='config' && configSub==='agents' && renderAgents()}
              {mainTab==='config' && configSub==='feedback' && renderFeedback()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  // ==================== 智能对话（团队协作 + AI 分析） ====================
  function renderChat() {
    return (
      <div className="flex h-full min-h-[calc(100vh-280px)] border border-border-color rounded-xl overflow-hidden">
        {/* 团队区 */}
        <div className="w-56 flex-shrink-0 border-r border-border-color bg-page-bg/30 p-3 overflow-y-auto hidden md:block">
          <div className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-2">在线成员</div>
          {teamUsers.map((u,i) => (
            <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-text-secondary hover:bg-card-bg-hover transition-colors mb-0.5">
              <div className={'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white '+u.color}>
                {u.avatar}
                <span className={'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card-bg '+(u.isAI?'bg-purple-500':'bg-emerald-500')} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{u.name}</div>
                <div className="text-[9px] opacity-60 truncate">{u.role}</div>
              </div>
            </div>
          ))}

        </div>

        {/* 对话区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 会话栏 */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-color bg-card-bg/20">
            <div className="flex items-center gap-2">
              <button onClick={()=>setShowSessionPanel(!showSessionPanel)} className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-card-bg-hover transition-colors relative">
                <List className="w-4 h-4" />
                {sessions.length>0 && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 text-[8px] text-white rounded-full flex items-center justify-center">{sessions.length>9?'9+':sessions.length}</span>}
              </button>
              <button onClick={createSession} className="p-1.5 text-text-muted hover:text-blue-400 rounded-lg hover:bg-card-bg-hover transition-colors"><Plus className="w-4 h-4" /></button>
              {activeSessionId&&<span className="text-[11px] text-text-muted"><Wifi className="w-3 h-3 inline mr-1 text-emerald-500" />会话已连接</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <select value={selectedProvider} onChange={e=>setSelectedProvider(e.target.value)}
                className="px-2 py-1 bg-page-bg border border-border-color rounded-lg text-[11px] text-text-muted font-mono max-w-[160px] cursor-pointer hover:border-border-color-hover transition-colors">
                <option value="">AI 离线</option>
                {agentProviders.filter(a=>a.enabled!==false).map(a=><option key={a.id} value={'agent:'+a.id}>🤖 {a.name}</option>)}
                {llmProviders.filter(p=>p.enabled!==false).map(p=><option key={p.id} value={'llm:'+p.id}>🧠 {p.name}</option>)}
              </select>
              {selectedProvider&&<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="已连接"/>}
            </div>
          </div>

          <AnimatePresence>{showSessionPanel&&(
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden border-b border-border-color">
              <div className="bg-page-bg/30 p-2 space-y-0.5 max-h-36 overflow-y-auto">
                {sessions.length===0?<div className="text-xs text-text-muted text-center py-3">暂无历史会话</div>
                :sessions.map(s=>(
                  <div key={s.id} className={'flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors '+(activeSessionId===s.id?'bg-blue-500/10 text-blue-400':'hover:bg-card-bg-hover text-text-secondary')}
                    onClick={()=>{loadSession(s.id);setShowSessionPanel(false);}}>
                    <div className="flex items-center gap-2 min-w-0"><MessageCircle className="w-3 h-3 flex-shrink-0" /><span className="truncate">{s.title}</span></div>
                    <button onClick={e=>{e.stopPropagation();setConfirmDialog({open:true,title:'删除会话',message:'确定删除「'+s.title+'」？',onConfirm:()=>deleteSession(s.id)});}} className="p-1 opacity-0 hover:opacity-100 hover:text-red-400 transition-all"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}</AnimatePresence>

          {/* 消息区 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin bg-page-bg/20">
            {messages.length===0&&teamMessages.length===0&&(
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center mb-4"><Brain className="w-7 h-7 text-blue-400" /></div>
                <div className="text-sm font-medium text-text-secondary">AI 安全分析工作台</div>
                <div className="text-xs text-text-muted mt-1.5 max-w-xs text-center">左侧选择模型后输入安全事件，AI 将辅助分析告警、追溯攻击链</div>
              </div>
            )}
            {teamMessages.map(m=>(
              <div key={m.id} className={'flex items-end gap-2.5 '+(m.user.isAI?'':'flex-row-reverse')}>
                <div className={'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 '+(m.user.isAI?'bg-gradient-to-br from-indigo-500 to-purple-600':'bg-blue-500')}>{m.user.avatar}</div>
                <div className={'flex flex-col max-w-[65%] '+(m.user.isAI?'items-start':'items-end')}>
                  <div className={'flex items-center gap-2 mb-1 '+(m.user.isAI?'':'flex-row-reverse')}>
                    <span className="text-[11px] font-medium text-text-muted">{m.user.name}</span>
                    <span className="text-[10px] text-text-muted/50">{m.time}</span>
                  </div>
                  <div className={'px-3.5 py-2.5 text-sm leading-relaxed '+(m.user.isAI?'bg-card-bg border border-border-color rounded-2xl rounded-bl-md shadow-sm text-text-primary':'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-md shadow-sm')}>{m.content}</div>
                </div>
              </div>
            ))}
            {messages.map((m,i)=>(
              <div key={'ai-'+i} className={'flex items-end gap-2.5 '+(m.role==='user'?'flex-row-reverse':'')}>
                <div className={'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 '+(m.role==='user'?'bg-blue-500/20 text-blue-400':'bg-gradient-to-br from-indigo-500 to-purple-600 text-white')}>
                  {m.role==='user'?<User className="w-4 h-4"/>:'AI'}
                </div>
                <div className={'flex flex-col max-w-[70%] '+(m.role==='user'?'items-end':'items-start')}>
                  <div className={'flex items-center gap-2 mb-1 '+(m.role==='user'?'flex-row-reverse':'')}>
                    <span className="text-[11px] font-medium text-text-muted">{m.role==='user'?teamUsers[0].name:'AI 助手'}</span>
                    <span className="text-[10px] text-text-muted/50">{new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                  <div className={'relative px-3.5 py-2.5 text-sm leading-relaxed '+(m.role==='user'?'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-md shadow-sm':'bg-card-bg border border-border-color text-text-primary rounded-2xl rounded-bl-md shadow-sm')}>
                    {m.role==='assistant'?<MarkdownContent content={m.content}/>:m.content}
                  </div>
                  {m.role==='assistant'&&(
                    <div className="flex items-center gap-1 mt-1.5">
                      <button onClick={()=>handleFeedback(i,'up')} className={'p-1 rounded transition-colors '+(m.feedback==='up'?'text-emerald-400 bg-emerald-500/10':'text-text-muted/40 hover:text-emerald-400')}><ThumbsUp className="w-3 h-3"/></button>
                      <button onClick={()=>handleFeedback(i,'down')} className={'p-1 rounded transition-colors '+(m.feedback==='down'?'text-red-400 bg-red-500/10':'text-text-muted/40 hover:text-red-400')}><ThumbsDown className="w-3 h-3"/></button>
                      <button onClick={()=>{navigator.clipboard.writeText(m.content);addToast('success','已复制');}} className="p-1 rounded text-text-muted/40 hover:text-text-secondary"><Copy className="w-3 h-3"/></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {streamingContent&&(
              <div className="flex items-end gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">AI</div>
                <div className="flex flex-col items-start max-w-[70%]">
                  <div className="flex items-center gap-2 mb-1"><span className="text-[11px] font-medium text-text-muted">AI 助手</span></div>
                  <div className="px-3.5 py-2.5 text-sm bg-card-bg border border-border-color rounded-2xl rounded-bl-md shadow-sm"><MarkdownContent content={streamingContent}/><span className="inline-block w-2 h-4 bg-blue-400/60 ml-0.5 animate-pulse"/></div>
                </div>
              </div>
            )}
            {chatLoading&&!streamingContent&&(
              <div className="flex items-end gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">AI</div>
                <div className="flex flex-col items-start"><div className="flex items-center gap-2 mb-1"><span className="text-[11px] font-medium text-text-muted">AI 助手</span></div><div className="px-3.5 py-3 bg-card-bg border border-border-color rounded-2xl rounded-bl-md shadow-sm"><div className="flex gap-1.5"><div className="w-2 h-2 bg-blue-400/40 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/><div className="w-2 h-2 bg-blue-400/40 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/><div className="w-2 h-2 bg-blue-400/40 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/></div></div></div>
              </div>
            )}
            <div ref={teamEndRef} />
          </div>

          {/* 输入区 */}
          <div className="flex-shrink-0 p-3 border-t border-border-color bg-card-bg/50">
            <div className="flex items-center gap-2 mb-2">{(quickActions||[]).map(qa=>(
              <button key={qa.id} onClick={qa.action} className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-muted hover:text-text-primary bg-page-bg border border-border-color rounded-lg hover:border-border-color-hover transition-all"><qa.icon className="w-3 h-3" style={{color:qa.color}}/>{qa.label}</button>
            ))}
              <div className="flex-1" />
              {agentProviders.filter(a=>a.enabled!==false).length>0&&
                <span className="text-[10px] text-text-muted/50">在输入框中输入 <span className="font-mono text-purple-400/60">@Agent名</span> 可调用 Agent 技能</span>
              }
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input ref={inputRef} value={selectedProvider?inputMsg:teamMsg} onChange={e=>{
                  const val=e.target.value;
                  selectedProvider?setInputMsg(val):setTeamMsg(val);
                  // @mention 检测
                  const pos=e.target.selectionStart||0;
                  const before=val.slice(0,pos);
                  const lastAt=before.lastIndexOf('@');
                  if(lastAt>=0&&pos-lastAt<=20){
                    setMentionFilter(before.slice(lastAt+1));
                    setMentionOpen(true);
                  }else{setMentionOpen(false);}
                }}
                onKeyDown={e=>{
                  if(mentionOpen&&e.key==='Enter'){e.preventDefault();return;}
                  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();selectedProvider?handleSend():handleTeamSend();}
                  if(e.key==='Escape')setMentionOpen(false);
                }}
                placeholder={selectedProvider?'输入安全事件信息，AI 将辅助分析...':'输入团队讨论内容...'}
                disabled={chatLoading}
                className="w-full px-4 py-2.5 bg-page-bg border border-border-color rounded-xl text-sm text-text-primary placeholder:text-text-muted/50 disabled:opacity-50 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all" />
                {/* @mention 弹出层 */}
                {mentionOpen&&(
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-card-bg border border-border-color rounded-xl shadow-xl overflow-hidden z-10">
                    <div className="p-1.5 text-[10px] text-text-muted/50 border-b border-border-color px-3 py-1">选择 Agent 调用</div>
                    <div className="max-h-36 overflow-y-auto">
                      {agentProviders.filter(a=>a.enabled!==false&&(a.name.includes(mentionFilter)||mentionFilter==='')).map(a=>{
                        const skills=a.skills||[];
                        return (
                          <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-card-bg-hover transition-colors border-b border-border-color/50 last:border-0"
                            onClick={()=>{
                              const curVal=selectedProvider?inputMsg:teamMsg;
                              const pos=inputRef.current?.selectionStart||curVal.length;
                              const beforeAt=curVal.lastIndexOf('@',pos);
                              const after=curVal.slice(pos);
                              const newVal=curVal.slice(0,beforeAt)+'@'+a.name+' '+after;
                              selectedProvider?setInputMsg(newVal):setTeamMsg(newVal);
                              setMentionOpen(false);
                              inputRef.current?.focus();
                            }}>
                            <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-400 flex-shrink-0">{a.name.charAt(0)}</div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-text-primary truncate">{a.name}</div>
                              <div className="text-[10px] text-text-muted truncate">{skills.slice(0,2).map((s:any)=>s.name).join(' · ')||a.type}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={selectedProvider?handleSend:handleTeamSend} disabled={(selectedProvider?!inputMsg.trim():!teamMsg.trim())||(selectedProvider&&chatLoading)}
                className="px-5 py-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:from-blue-500 hover:to-indigo-500 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm">
                {chatLoading?<Loader2 className="w-4 h-4 animate-spin"/>:<Send className="w-4 h-4"/>}发送
              </button>
            </div>
          </div>
        </div>
      </div>
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
                <div className="pt-3 border-t border-border-color">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-text-secondary">🔗 关联 Agent</span>
                    {agentProviders.find(a=>a.name.includes('响应')||a.skills?.find((s:any)=>s.name.includes('封禁')))
                      ? <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3"/>响应Agent已注册</span>
                      : <button onClick={async()=>{
                          try{
                            const r=await aiApi.addAgentProvider({
                              name:'响应助手',type:'hermes',endpoint:'http://localhost:8080',api_key:'',
                              description:'自动响应与处置 Agent，根据事件风险执行封禁/隔离/通知等操作',
                              skills:[
                                {name:'封禁IP',description:'封禁恶意IP地址'},
                                {name:'隔离主机',description:'隔离受感染主机'},
                                {name:'告警通知',description:'发送告警通知给相关人员'},
                                {name:'事件升级',description:'将高风险事件升级为紧急事件'},
                              ],
                              enabled:true
                            });
                            if(r.success){
                              const updated=await aiApi.getAgentProviders();
                              if(updated.success)setAgentProviders(updated.data||[]);
                              const newId=r.data?.id;
                              if(newId)setSelectedProvider('agent:'+newId);
                              addToast('success','响应Agent已注册，可在对话中 @响应助手 调用');
                            }
                          }catch{addToast('error','注册失败');}
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-medium hover:bg-emerald-500 transition-all active:scale-95 flex items-center gap-1">
                        <Plus className="w-3 h-3"/>注册响应Agent
                      </button>
                    }
                  </div>
                  <p className="text-[10px] text-text-muted/60">注册后可在智能对话中输入 <span className="font-mono text-purple-400/60">@响应助手 封禁IP 192.168.1.1</span> 直接执行</p>
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
                <p className="text-[10px] text-text-muted/60 text-center">💡 在智能对话中 <span className="font-mono text-purple-400/60">@响应助手 你的指令</span> 可以直接调用技能</p>
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
                  <button onClick={()=>{if(window.confirm('确定删除「'+pr.name+'」？')){(async()=>{try{await aiApi.deleteLlmProvider(pr.id);setLlmProviders((await aiApi.getLlmProviders()).data||[]);addToast('success','已删除');}catch{addToast('error','删除失败');}})();}}} className="p-1.5 text-text-muted hover:text-red-400 rounded-lg hover:bg-card-bg-hover"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            ))}</div>
      </div>
    );
  }

  // ==================== AI 配置 — Agent管理 ====================
  function renderAgents() {
      const agentForm = () => {
    const [testStatus, setTestStatus] = useState<'idle'|'testing'|'success'|'fail'>('idle');
    const testConnection = async () => {
      if(!editingAgent?.endpoint) { addToast('error','请先填写 Endpoint'); return; }
      setTestStatus('testing');
      try {
        const res = await fetch(editingAgent.endpoint.replace(/\/$/,'')+'/v1/models', {
          signal: AbortSignal.timeout(5000),
          headers: editingAgent.api_key ? { 'Authorization': 'Bearer '+editingAgent.api_key } : {}
        });
        setTestStatus(res.ok ? 'success' : 'fail');
        if(res.ok) addToast('success','连接成功！Agent 可用');
        else addToast('error','连接失败：HTTP '+res.status);
      } catch(e: any) {
        setTestStatus('fail');
        addToast('error','连接失败：'+e.message);
      }
    };
    return (
      <div className="p-4 bg-card-bg border border-purple-500/20 rounded-xl mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="md:col-span-2 flex items-center gap-2 pb-2 border-b border-border-color mb-1">
            <Bot className="w-4 h-4 text-purple-400"/>
            <span className="text-xs font-medium text-text-primary">Agent 连接配置</span>
            {testStatus==='idle' && <span className="text-[10px] text-text-muted ml-auto">配置后点击「测试连接」验证</span>}
            {testStatus==='testing' && <Loader2 className="w-3 h-3 animate-spin ml-auto text-purple-400"/>}
            {testStatus==='success' && <span className="text-[10px] text-emerald-400 ml-auto flex items-center gap-1"><Check className="w-3 h-3"/>连接正常</span>}
            {testStatus==='fail' && <span className="text-[10px] text-red-400 ml-auto flex items-center gap-1"><X className="w-3 h-3"/>连接失败</span>}
          </div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">名称</label>
            <input value={editingAgent?.name||''} onChange={e=>setEditingAgent({...editingAgent,name:e.target.value})}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary" placeholder="Hermes Agent"/></div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">类型</label>
            <select value={editingAgent?.type||'hermes'} onChange={e=>setEditingAgent({...editingAgent,type:e.target.value})}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary">
              <option value="hermes">Hermes — OpenAI 兼容 API</option>
              <option value="openclaw">OpenClaw — 安全操作框架</option>
              <option value="custom">自定义 Agent</option></select></div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">服务地址 <span className="text-text-muted font-normal">(Agent Endpoint)</span></label>
            <input value={editingAgent?.endpoint||''} onChange={e=>setEditingAgent({...editingAgent,endpoint:e.target.value})}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm font-mono text-text-primary" placeholder="http://localhost:8080"/></div>
          <div><label className="block text-xs text-text-secondary mb-1 font-medium">认证密钥 <span className="text-text-muted font-normal">(API Key, 可选)</span></label>
            <input type="password" value={editingAgent?.api_key||''} onChange={e=>setEditingAgent({...editingAgent,api_key:e.target.value})}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary" placeholder="如不需要可留空"/></div>
          <div className="flex items-end">
            <button onClick={testConnection} disabled={testStatus==='testing'||!editingAgent?.endpoint}
              className="w-full px-4 py-2 bg-page-bg border border-border-color rounded-lg text-xs text-text-secondary hover:text-text-primary hover:border-border-color-hover transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
              {testStatus==='testing'?<Loader2 className="w-3 h-3 animate-spin"/>:<Wifi className="w-3 h-3"/>}测试连接</button>
          </div>
          <div className="md:col-span-2"><label className="block text-xs text-text-secondary mb-1 font-medium">描述</label>
            <input value={editingAgent?.description||''} onChange={e=>setEditingAgent({...editingAgent,description:e.target.value})}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm text-text-primary" placeholder="Agent 功能描述"/></div>
          <div className="md:col-span-2"><label className="block text-xs text-text-secondary mb-1 font-medium">注册技能 <span className="text-text-muted font-normal">(每行一个: 技能名称 | 技能描述)</span></label>
            <textarea value={(editingAgent?.skills||[]).map((s:any)=>s.name+' | '+s.description).join('\n')}
              onChange={e=>{const sk=e.target.value.split('\n').filter(Boolean).map(line=>{[n,...d]=line.split('|');return{name:n.trim(),description:d.join('|').trim()||n.trim()}});setEditingAgent({...editingAgent,skills:sk});}}
              className="w-full px-3 py-2 bg-page-bg border border-border-color rounded-lg text-sm h-20 font-mono text-text-primary" placeholder="威胁分析 | 安全事件分析与威胁识别
告警分诊 | 告警优先级评估与误报判断
攻击链溯源 | MITRE ATT&CK 攻击链映射"/></div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={()=>setShowAddAgent(false)} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary">取消</button>
          <button onClick={async()=>{
            if(!editingAgent?.name){addToast('error','请填写名称');return;}
            setAgentFormLoading(true);
            try{
              if(editingAgent.id) await aiApi.updateAgentProvider(editingAgent.id,editingAgent);
              else await aiApi.addAgentProvider(editingAgent);
              const r=await aiApi.getAgentProviders();
              if(r.success) setAgentProviders(r.data||[]);
              setShowAddAgent(false);
              addToast('success',editingAgent.id?'已更新':'已添加');
            }catch{addToast('error','保存失败');}
            setAgentFormLoading(false);
          }}
            disabled={agentFormLoading}
            className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium disabled:opacity-40 hover:bg-purple-500 transition-all active:scale-95 flex items-center gap-1.5">
            {agentFormLoading?<Loader2 className="w-3 h-3 animate-spin"/>:<Save className="w-3 h-3"/>}保存</button>
        </div>
      </div>
    );
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div><h3 className="text-sm font-semibold text-text-primary"><Bot className="w-4 h-4 text-purple-400 inline mr-1"/>AI Agent 配置</h3><p className="text-xs text-text-muted mt-0.5">Agent 接口与安全技能管理。Hermes Agent (本地端口 8080) 已自动注册</p></div>
        <div className="flex items-center gap-2">
          <button onClick={()=>{setShowAddAgent(true);setEditingAgent({type:'hermes',skills:[],enabled:true});}} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-500 transition-all active:scale-95"><Plus className="w-3.5 h-3.5"/>添加</button>
        </div>
      </div>
      <AnimatePresence>{showAddAgent&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:'auto'}} exit={{opacity:0,height:0}} className="overflow-hidden">{agentForm()}</motion.div>}</AnimatePresence>
      <div className="space-y-2">{(agentProviders||[]).length===0
        ?<div className="flex flex-col items-center justify-center py-12 text-text-muted"><Bot className="w-8 h-8 mb-2 opacity-30"/><div className="text-xs">暂无 Agent 配置</div></div>
        :agentProviders.map((pr:any)=>(
            <div key={pr.id} className="flex items-center justify-between p-3 bg-card-bg border border-border-color rounded-lg hover:bg-card-bg-hover transition-colors">
              <div className="flex items-center gap-3 min-w-0"><div className={'w-9 h-9 rounded-lg '+(pr.enabled!==false?'bg-purple-500/10':'bg-gray-500/10')+' flex items-center justify-center'}><Bot className={'w-4 h-4 '+(pr.enabled!==false?'text-purple-400':'text-gray-500')}/></div><div className="min-w-0"><div className="text-sm font-medium text-text-primary">{pr.name}</div><div className="text-xs text-text-muted">{pr.type} · {(pr?.skills?.length||0)} 项技能</div></div></div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex gap-1">{(pr.skills||[]).slice(0,2).map((s:any,i:number)=><span key={i} className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded">{s.name}</span>)}{(pr.skills||[]).length>2&&<span className="text-[10px] text-text-muted">+{(pr.skills||[]).length-2}</span>}</div>
                <button onClick={()=>{setEditingAgent(pr);setShowAddAgent(true);}} className="p-1.5 text-text-muted hover:text-purple-400 rounded-lg hover:bg-card-bg-hover"><Edit3 className="w-3.5 h-3.5"/></button>
                <button onClick={()=>{if(window.confirm('确定删除 Agent「'+pr.name+'」？')){(async()=>{try{await aiApi.deleteAgentProvider(pr.id);setAgentProviders((await aiApi.getAgentProviders()).data||[]);addToast('success','已删除');}catch{addToast('error','删除失败');}})();}}} className="p-1.5 text-text-muted hover:text-red-400 rounded-lg hover:bg-card-bg-hover"><Trash2 className="w-3.5 h-3.5"/></button>
              </div>
            </div>
          ))}</div>
    </div>
  );
}

  // ==================== AI 配置 — 反馈学习 ====================
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
