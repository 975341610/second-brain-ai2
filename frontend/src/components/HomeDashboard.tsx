import { Clock3, Filter, ListTodo, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AssistantPanel } from './AssistantPanel';
import type { AskResponse, ChatSession, ModelConfig, Note, Task } from '../lib/types';

type HomeDashboardProps = {
  recentNotes: Note[];
  tasks: Task[];
  assistant: AskResponse | null;
  modelConfig: ModelConfig;
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectNote: (noteId: number) => void;
  onAsk: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  onCreateTask: (payload: { title: string; priority: Task['priority']; task_type: Task['task_type']; deadline: string | null }) => Promise<void>;
  onUpdateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
  onStartNewChat: () => void;
  onSwitchSession: (sessionId: string) => void;
  onClearSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
};

const typeLabels: Record<Task['task_type'], string> = { meeting: '会议', work: '工作任务', travel: '出行', errand: '办事', study: '学习', personal: '个人' };
const priorityLabels: Record<Task['priority'], string> = { low: '低', medium: '中', high: '高' };

export function HomeDashboard({ recentNotes, tasks, assistant, modelConfig, sessions, activeSessionId, onSelectNote, onAsk, onCreateTask, onUpdateTaskStatus, onStartNewChat, onSwitchSession, onClearSession, onRenameSession, onDeleteSession }: HomeDashboardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [taskType, setTaskType] = useState<Task['task_type']>('work');
  const [deadline, setDeadline] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | Task['status']>('all');
  const visibleTasks = useMemo(() => tasks.filter((task) => filterStatus === 'all' || task.status === filterStatus), [tasks, filterStatus]);

  return (
    <section className="grid gap-4">
      <div className="rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.88)] p-6 shadow-soft backdrop-blur">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-stone-500"><Clock3 size={16} /> 最近访问的笔记</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recentNotes.map((note) => (
            <button key={note.id} onClick={() => onSelectNote(note.id)} className="rounded-[24px] bg-white/80 p-4 text-left">
              <div className="text-sm font-medium text-stone-800">{note.icon} {note.title}</div>
              <div className="mt-2 text-xs text-stone-400">最近编辑</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.88)] p-6 shadow-soft backdrop-blur">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-stone-500"><ListTodo size={16} /> 待办和任务看板</div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate((value) => !value)} className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-medium text-white"><span className="flex items-center gap-2"><Plus size={14} /> 添加</span></button>
            <button onClick={() => setShowFilter((value) => !value)} className="rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700"><span className="flex items-center gap-2"><Filter size={14} /> 筛选</span></button>
          </div>
        </div>

        {showCreate && (
          <div className="mb-4 grid gap-2 rounded-[24px] bg-white/85 p-4 md:grid-cols-4">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="任务标题" />
            <select value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])} className="rounded-2xl border border-stone-200 px-3 py-2 text-sm">
              {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}优先级</option>)}
            </select>
            <select value={taskType} onChange={(event) => setTaskType(event.target.value as Task['task_type'])} className="rounded-2xl border border-stone-200 px-3 py-2 text-sm">
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={deadline} onChange={(event) => setDeadline(event.target.value)} type="datetime-local" className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" />
              <button onClick={async () => { if (!title.trim()) return; await onCreateTask({ title: title.trim(), priority, task_type: taskType, deadline: deadline || null }); setTitle(''); setDeadline(''); setPriority('medium'); setTaskType('work'); setShowCreate(false); }} className="rounded-2xl bg-emerald-700 px-4 py-2 text-sm text-white">保存</button>
            </div>
          </div>
        )}

        {showFilter && (
          <div className="mb-4 flex gap-2 rounded-[24px] bg-white/85 p-4 text-sm">
            {['all', 'todo', 'doing', 'done'].map((status) => (
              <button key={status} onClick={() => setFilterStatus(status as 'all' | Task['status'])} className={`rounded-full px-3 py-2 ${filterStatus === status ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>
                {status === 'all' ? '全部' : status}
              </button>
            ))}
          </div>
        )}

        <div className="grid max-h-[420px] gap-3 overflow-hidden md:grid-cols-3">
          {['todo', 'doing', 'done'].map((status) => (
            <div key={status} className="flex min-h-0 flex-col rounded-[24px] bg-white/85 p-4">
              <div className="mb-3 text-xs uppercase tracking-[0.25em] text-stone-400">{status}</div>
              <div className="space-y-2 overflow-y-auto pr-1">
                {visibleTasks.filter((task) => task.status === status).map((task) => (
                  <div key={task.id} className="rounded-2xl bg-stone-50 px-3 py-3">
                    <div className="text-sm font-medium text-stone-800">{task.title}</div>
                    <div className="mt-1 text-xs text-stone-500">{priorityLabels[task.priority]} · {typeLabels[task.task_type]}{task.deadline ? ` · ${new Date(task.deadline).toLocaleDateString('zh-CN')}` : ''}</div>
                    <div className="mt-3 flex gap-2 text-xs">
                      {(['todo', 'doing', 'done'] as Task['status'][]).map((nextStatus) => (
                        <button key={nextStatus} onClick={() => onUpdateTaskStatus(task.id, nextStatus)} className={`rounded-full px-2 py-1 ${task.status === nextStatus ? 'bg-stone-900 text-white' : 'bg-white text-stone-500'}`}>
                          {nextStatus}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <AssistantPanel assistant={assistant} modelConfig={modelConfig} loading={false} sessions={sessions} activeSessionId={activeSessionId} onAsk={onAsk} onStartNewChat={onStartNewChat} onSwitchSession={onSwitchSession} onClearSession={onClearSession} onRenameSession={onRenameSession} onDeleteSession={onDeleteSession} onUpdateModelConfig={async () => {}} />
        <div className="rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.88)] p-6 shadow-soft backdrop-blur">
          <div className="mb-4 text-sm font-medium text-stone-500">知识卡片</div>
          <div className="space-y-3">
            {recentNotes.slice(0, 5).map((note) => (
              <button key={note.id} onClick={() => onSelectNote(note.id)} className="block w-full rounded-[24px] bg-white/85 p-4 text-left">
                <div className="text-sm font-medium text-stone-800">{note.icon} {note.title}</div>
                <div className="mt-2 text-xs text-stone-400">知识卡片</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
