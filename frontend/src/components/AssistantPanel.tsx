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

function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return <div className="text-sm text-stone-400">当前没有返回引用来源。</div>;
  return (
    <div className="space-y-2">
      {citations.map((citation) => (
        <div key={citation.chunk_id} className="rounded-2xl bg-stone-50 px-4 py-3">
          <div className="text-sm font-medium text-stone-800">{citation.title}</div>
          <div className="mt-1 text-xs text-stone-500">{citation.excerpt}</div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.25em] text-stone-400">相关度 {citation.score.toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}

export function AssistantPanel({ assistant, modelConfig, loading, sessions, activeSessionId, onAsk, onStartNewChat, onSwitchSession, onClearSession, onRenameSession, onDeleteSession, onUpdateModelConfig }: AssistantPanelProps) {
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
    await onAsk(trimmed, mode);
  };

  return (
    <aside className="flex h-[min(78vh,860px)] min-h-[620px] flex-col gap-3 overflow-hidden rounded-[20px] border border-stone-200/80 bg-[rgba(255,255,255,0.96)] p-4 shadow-[0_12px_30px_rgba(28,25,23,0.08)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-stone-900 p-3 text-stone-50"><Bot size={18} /></div>
          <div>
            <div className="text-sm font-medium text-stone-900">AI 助手</div>
            <div className="text-xs text-stone-500">支持知识问答、规划和离线回退</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onStartNewChat} className="rounded-2xl bg-white px-3 py-2 text-sm text-stone-700"><span className="flex items-center gap-2"><PlusSquare size={14} /> 新会话</span></button>
          <button onClick={onClearSession} className="rounded-2xl bg-white px-3 py-2 text-sm text-rose-700"><span className="flex items-center gap-2"><Trash2 size={14} /> 清空</span></button>
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

      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2">
        {modes.map((item) => {
          const Icon = item.icon;
          return <button key={item.key} onClick={() => setMode(item.key)} className={`rounded-2xl px-3 py-3 text-sm font-medium ${mode === item.key ? 'bg-stone-900 text-stone-50' : 'text-stone-500'}`}><div className="flex items-center justify-center gap-2"><Icon size={14} /> {item.label}</div></button>;
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {starterPrompts.map((prompt) => <button key={prompt} onClick={() => void sendQuestion(prompt)} className="rounded-full bg-white px-3 py-2 text-xs text-stone-600">{prompt}</button>)}
      </div>

      <div className="min-h-[220px] flex-1 overflow-y-auto rounded-[24px] border border-stone-200 bg-white p-4">
        <div className="space-y-4">
          {activeSession?.messages.length === 0 && <div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-500">可以在这里连续对话，支持普通聊天、知识库问答和智能体模式。</div>}
          {activeSession?.messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] rounded-[24px] px-4 py-3 text-sm leading-7 ${message.role === 'user' ? 'bg-stone-900 text-white' : 'bg-stone-50 text-stone-700'}`}>
                <div className="mb-2 text-[11px] uppercase tracking-[0.22em] opacity-60">{message.role === 'user' ? '我' : message.mode === 'agent' ? 'AI 智能体' : message.mode === 'rag' ? 'AI 知识问答' : 'AI 对话'}</div>
                <div className="markdown-body"><ReactMarkdown>{message.content}</ReactMarkdown></div>
              </div>
            </div>
          ))}
          {loading && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">AI 正在整理回复...</div>}
        </div>
      </div>

      <div className="rounded-[24px] border border-stone-200 bg-white p-3">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-[96px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-stone-700 outline-none" placeholder="输入问题，按模式发起连续对话..." />
        <div className="mt-3 flex justify-end">
          <button onClick={() => void sendQuestion(question)} className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white"><span className="flex items-center gap-2">{loading ? '思考中...' : '发送给 AI'} <SendHorizontal size={14} /></span></button>
        </div>
      </div>

      <div className="max-h-[220px] overflow-y-auto rounded-[24px] border border-stone-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium text-stone-500">引用来源</div>
        <CitationList citations={activeCitations} />
      </div>
    </aside>
  );
}
