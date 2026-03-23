import { Bot, BrainCircuit, MessageSquareText, Pencil, PlusSquare, SendHorizontal, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { AskResponse, ChatSession, Citation, ModelConfig } from '../lib/types';

type AssistantPanelProps = {
  assistant: AskResponse | null;
  modelConfig: ModelConfig;
  loading: boolean;
  sessions: ChatSession[];
  activeSessionId: string;
  isEmbedded?: boolean;
  onAsk: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  onStartNewChat: () => void;
  onSwitchSession: (sessionId: string) => void;
  onClearSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateModelConfig: (payload: ModelConfig) => Promise<void>;
};

const modes = [
  { key: 'chat', label: '对话', icon: MessageSquareText },
  { key: 'rag', label: '知识库', icon: BrainCircuit },
  { key: 'agent', label: '智能体', icon: Sparkles },
] as const;

const starterPrompts = ['总结我最近的重点笔记', '根据知识库给我一个本周计划', '帮我发现这些笔记之间的关联'];

function CitationList({ citations, isEmbedded }: { citations: Citation[]; isEmbedded?: boolean }) {
  if (citations.length === 0) return <div className="text-sm text-stone-400 p-2">当前没有返回引用来源。</div>;
  return (
    <div className={`grid gap-2 ${isEmbedded ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {citations.map((citation) => (
        <div key={citation.chunk_id} className="rounded-xl bg-stone-50 p-3 border border-stone-100 hover:border-purple-200 transition-colors">
          <div className="text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            {citation.title}
          </div>
          <div className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">{citation.excerpt}</div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-wider text-stone-400">Score {citation.score.toFixed(2)}</div>
            <div className="text-[9px] font-mono text-purple-400">#Source</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssistantPanel({ assistant, modelConfig, loading, sessions, activeSessionId, isEmbedded, onAsk, onStartNewChat, onSwitchSession, onClearSession, onRenameSession, onDeleteSession, onUpdateModelConfig }: AssistantPanelProps) {
  const [question, setQuestion] = useState('结合我的笔记，建议我这周最值得优先推进的事情。');
  const [mode, setMode] = useState<'chat' | 'rag' | 'agent'>('rag');
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  void modelConfig;
  void onUpdateModelConfig;

  const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) || sessions[0], [activeSessionId, sessions]);
  const activeCitations = useMemo(() => {
    const assistantMessage = [...(activeSession?.messages || [])].reverse().find((message) => message.role === 'assistant' && message.citations?.length);
    return assistantMessage?.citations || assistant?.citations || [];
  }, [activeSession?.messages, assistant?.citations]);

  const sendQuestion = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setQuestion('');
    // Use non-streaming for agent mode as it involves task planning and specific response structure
    if (mode === 'agent') {
      await onAsk(trimmed, 'agent');
    } else {
      // Chat and RAG benefit more from streaming
      await onAsk(trimmed, mode);
    }
  };

  return (
    <aside className={`flex flex-col gap-3 overflow-hidden rounded-[20px] ${isEmbedded ? 'h-full bg-transparent border-none p-0 shadow-none backdrop-blur-none' : 'h-[min(78vh,860px)] min-h-[620px] border border-stone-200/80 bg-white/95 p-4 shadow-[0_12px_40px_rgba(124,58,237,0.12)] backdrop-blur-md'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 p-2.5 text-white shadow-lg shadow-purple-200/50"><Sparkles size={18} /></div>
          <div>
            <div className="text-sm font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">智能助手</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-stone-400 flex items-center gap-1">
              <span className="w-1 h-1 bg-green-400 rounded-full animate-pulse" />
              {modelConfig.model_name || 'Deep Reasoning'}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={onStartNewChat} className="rounded-xl bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors border border-purple-100" title="新会话"><PlusSquare size={14} /></button>
          <button onClick={onClearSession} className="rounded-xl bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 transition-colors border border-stone-100" title="清空会话"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {sessions.map((session) => (
          <div key={session.id} className={`flex items-center gap-1 rounded-full px-2 py-1 whitespace-nowrap ${session.id === activeSessionId ? 'bg-stone-900 text-white' : 'bg-white text-stone-600'}`}>
            {renamingSessionId === session.id ? (
              <>
                <input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} className="min-w-[100px] bg-transparent text-xs outline-none" />
                <button onClick={() => { onRenameSession(session.id, sessionTitle); setRenamingSessionId(null); }} className="text-xs">保存</button>
              </>
            ) : (
              <>
                <button onClick={() => onSwitchSession(session.id)} className="px-2 py-1 text-xs">{session.title || '新会话'}</button>
                <button onClick={() => { setRenamingSessionId(session.id); setSessionTitle(session.title); }} className="opacity-70"><Pencil size={12} /></button>
                <button onClick={() => onDeleteSession(session.id)} className="opacity-70"><Trash2 size={12} /></button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1 border border-stone-200">
        {modes.map((item) => {
          const Icon = item.icon;
          return <button key={item.key} onClick={() => setMode(item.key)} className={`rounded-xl px-2 py-2 text-[11px] font-bold transition-all duration-200 ${mode === item.key ? 'bg-white text-purple-600 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}><div className="flex items-center justify-center gap-1.5"><Icon size={14} /> {item.label}</div></button>;
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {starterPrompts.map((prompt) => (
          <button 
            key={prompt} 
            onClick={() => void sendQuestion(prompt)} 
            className="rounded-xl bg-purple-50/50 px-3 py-2 text-[10px] font-bold text-purple-600 hover:bg-purple-100 hover:text-purple-700 transition-all border border-purple-100/30 hover:border-purple-200/50 active:scale-95"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="min-h-[220px] flex-1 overflow-y-auto rounded-[24px] border border-stone-200 bg-white p-4">
        <div className="space-y-4">
          {activeSession?.messages.length === 0 && <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-500">可以在这里连续对话，支持普通聊天、知识库问答和智能体模式。</div>}
          {activeSession?.messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] rounded-[24px] px-4 py-3 text-sm leading-7 ${message.role === 'user' ? 'bg-stone-900 text-white shadow-md' : 'bg-white border border-purple-100 text-stone-700 shadow-sm shadow-purple-100/20'}`}>
                <div className={`mb-2 text-[10px] uppercase tracking-[0.2em] font-bold ${message.role === 'user' ? 'opacity-50' : 'text-purple-500 opacity-80'}`}>{message.role === 'user' ? '你' : message.mode === 'agent' ? '智能体' : message.mode === 'rag' ? '知识库检索' : '助手'}</div>
                <div className="markdown-body"><ReactMarkdown>{message.content}</ReactMarkdown></div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-[24px] bg-purple-50 px-5 py-4 text-xs font-bold text-purple-600 border border-purple-100 animate-pulse flex items-center gap-3">
                <div className="flex gap-1">
                  <div className="h-1.5 w-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="h-1.5 w-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="h-1.5 w-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span>正在思考...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[24px] border border-purple-200/50 bg-gradient-to-br from-white to-purple-50/30 p-3 shadow-inner">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-[96px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-stone-700 outline-none placeholder:text-stone-300" placeholder="向你的第二大脑提问..." />
        <div className="mt-3 flex justify-end">
          <button onClick={() => void sendQuestion(question)} className="rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-200 hover:scale-[1.02] transition-transform active:scale-100 flex items-center gap-2 uppercase tracking-widest">{loading ? '处理中...' : '提问 AI'} <SendHorizontal size={14} /></button>
        </div>
      </div>

      <div className="max-h-[220px] overflow-y-auto rounded-[24px] border border-stone-200 bg-white p-4 custom-scrollbar">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-stone-400">知识溯源</div>
        <CitationList citations={activeCitations} isEmbedded={isEmbedded} />
      </div>
    </aside>
  );
}
