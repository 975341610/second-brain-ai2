import { Bot, BrainCircuit, MessageSquareText, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { AskResponse, Citation, ModelConfig } from '../lib/types';

type AssistantPanelProps = {
  assistant: AskResponse | null;
  modelConfig: ModelConfig;
  loading: boolean;
  onAsk: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  onUpdateModelConfig: (payload: ModelConfig) => Promise<void>;
};

const modes = [
  { key: 'chat', label: 'Chat', icon: MessageSquareText },
  { key: 'rag', label: 'Knowledge', icon: BrainCircuit },
  { key: 'agent', label: 'Agent', icon: Sparkles },
] as const;

function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return <div className="text-sm text-stone-400">No citations returned.</div>;
  return (
    <div className="space-y-2">
      {citations.map((citation) => (
        <div key={citation.chunk_id} className="rounded-2xl bg-stone-50 px-4 py-3">
          <div className="text-sm font-medium text-stone-800">{citation.title}</div>
          <div className="mt-1 text-xs text-stone-500">{citation.excerpt}</div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.25em] text-stone-400">score {citation.score.toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}

export function AssistantPanel({ assistant, modelConfig, loading, onAsk, onUpdateModelConfig }: AssistantPanelProps) {
  const [question, setQuestion] = useState('What should I focus on this week based on my notes?');
  const [mode, setMode] = useState<'chat' | 'rag' | 'agent'>('rag');
  const [config, setConfig] = useState(modelConfig);

  useEffect(() => {
    setConfig(modelConfig);
  }, [modelConfig]);

  return (
    <aside className="flex h-full flex-col gap-4 rounded-[28px] border border-white/50 bg-[rgba(246,244,238,0.9)] p-5 shadow-soft backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-stone-900 p-3 text-stone-50">
          <Bot size={18} />
        </div>
        <div>
          <div className="text-sm font-medium text-stone-900">AI Assistant</div>
          <div className="text-xs text-stone-500">RAG, planning, and local fallback</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2">
        {modes.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setMode(item.key)}
              className={`rounded-2xl px-3 py-3 text-sm font-medium ${mode === item.key ? 'bg-stone-900 text-stone-50' : 'text-stone-500'}`}
            >
              <div className="flex items-center justify-center gap-2">
                <Icon size={14} /> {item.label}
              </div>
            </button>
          );
        })}
      </div>

      <textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        className="min-h-[120px] rounded-[24px] border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-700 outline-none"
      />
      <button
        onClick={() => onAsk(question, mode)}
        className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white"
      >
        {loading ? 'Thinking...' : 'Ask AI'}
      </button>

      <div className="markdown-body min-h-[220px] flex-1 overflow-y-auto rounded-[24px] border border-stone-200 bg-white p-4">
        {assistant ? <ReactMarkdown>{assistant.answer}</ReactMarkdown> : <p>Ask in chat, knowledge, or agent mode.</p>}
      </div>

      <div className="rounded-[24px] border border-stone-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium text-stone-500">Sources</div>
        <CitationList citations={assistant?.citations || []} />
      </div>

      <div className="rounded-[24px] border border-stone-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium text-stone-500">Model config</div>
        <div className="space-y-3">
          <input value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="provider" />
          <input value={config.model_name} onChange={(e) => setConfig({ ...config, model_name: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="model" />
          <input value={config.base_url} onChange={(e) => setConfig({ ...config, base_url: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="base url" />
          <input value={config.api_key} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="api key" />
          <button onClick={() => onUpdateModelConfig(config)} className="w-full rounded-2xl bg-stone-900 px-3 py-3 text-sm font-medium text-white">Save model settings</button>
        </div>
      </div>
    </aside>
  );
}
