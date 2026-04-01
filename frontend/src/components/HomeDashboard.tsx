import { Clock3, Filter, GripVertical, ListTodo, Plus } from 'lucide-react';
import { lazy, Suspense, type ReactNode, useMemo, useState } from 'react';
import { DEFAULT_HOME_LAYOUT } from '../lib/types';
import type { AskResponse, ChatSession, HomeBoardId, HomeLayoutItem, ModelConfig, Note, Task } from '../lib/types';

const AssistantPanel = lazy(() => import('./AssistantPanel').then((module) => ({ default: module.AssistantPanel })));

type HomeDashboardProps = {
  recentNotes: Note[];
  tasks: Task[];
  assistant: AskResponse | null;
  modelConfig: ModelConfig;
  sessions: ChatSession[];
  activeSessionId: string;
  layout: HomeLayoutItem[];
  onSelectNote: (noteId: number) => void;
  onOpenSettings: () => void;
  onAsk: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  onCreateTask: (payload: { title: string; priority: Task['priority']; task_type: Task['task_type']; deadline: string | null }) => Promise<void>;
  onUpdateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
  onStartNewChat: () => void;
  onSwitchSession: (sessionId: string) => void;
  onClearSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onReorderBoards: (layout: HomeLayoutItem[]) => void;
};

const typeLabels: Record<Task['task_type'], string> = { meeting: '会议', work: '工作任务', travel: '出行', errand: '办事', study: '学习', personal: '个人' };
const statusLabels: Record<Task['status'], string> = { todo: '待开始', doing: '进行中', done: '已完成' };
const priorityLabels: Record<Task['priority'], string> = { low: '低', medium: '中', high: '高' };
const boardTitles: Record<HomeBoardId, string> = {
  recent_notes: '最近访问的笔记',
  task_board: '待办和任务看板',
  assistant: 'AI 助手',
  knowledge_cards: '知识卡片',
};

function BoardSkeleton({ label }: { label: string }) {
  return <div className="app-surface-muted rounded-[24px] p-4 text-sm app-text-secondary">正在加载{label}...</div>;
}

function DashboardEmptyState({ onOpenSettings, onRestoreLayout }: { onOpenSettings: () => void; onRestoreLayout: () => void }) {
  return (
    <section className="app-panel rounded-[28px] p-8 shadow-soft backdrop-blur">
      <div className="app-surface-muted rounded-[24px] p-6 text-center">
        <div className="text-base font-medium">首页板块已全部隐藏</div>
        <div className="mt-2 text-sm app-text-secondary">可前往设置页重新显示板块，或直接恢复默认布局。</div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button onClick={onRestoreLayout} className="app-primary-button rounded-2xl px-4 py-2 text-sm font-medium">恢复默认布局</button>
          <button onClick={onOpenSettings} className="app-secondary-button rounded-2xl px-4 py-2 text-sm">打开设置</button>
        </div>
      </div>
    </section>
  );
}

export function HomeDashboard({ recentNotes, tasks, assistant, modelConfig, sessions, activeSessionId, layout, onSelectNote, onOpenSettings, onAsk, onCreateTask, onUpdateTaskStatus, onStartNewChat, onSwitchSession, onClearSession, onRenameSession, onDeleteSession, onReorderBoards }: HomeDashboardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [taskType, setTaskType] = useState<Task['task_type']>('work');
  const [deadline, setDeadline] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | Task['status']>('all');
  const [draggingBoardId, setDraggingBoardId] = useState<HomeBoardId | null>(null);
  const visibleTaskCounts = useMemo(() => ({
    all: tasks.length,
    todo: tasks.filter((task) => task.status === 'todo').length,
    doing: tasks.filter((task) => task.status === 'doing').length,
    done: tasks.filter((task) => task.status === 'done').length,
  }), [tasks]);

  const visibleTasks = useMemo(() => tasks.filter((task) => filterStatus === 'all' || task.status === filterStatus), [tasks, filterStatus]);

  const visibleLayout = layout.filter((item) => item.visible !== false);

  const moveBoard = (sourceId: HomeBoardId, targetId: HomeBoardId) => {
    if (sourceId === targetId) return;
    const next = [...layout];
    const sourceIndex = next.findIndex((item) => item.id === sourceId);
    const targetIndex = next.findIndex((item) => item.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorderBoards(next);
  };

  const boardShell = (id: HomeBoardId, titleText: string, content: ReactNode, countLabel?: string) => (
    <section
      key={id}
      draggable
      onDragStart={() => setDraggingBoardId(id)}
      onDragEnd={() => setDraggingBoardId(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => {
        if (!draggingBoardId) return;
        moveBoard(draggingBoardId, id);
        setDraggingBoardId(null);
      }}
      className={`home-board app-panel rounded-[28px] p-6 shadow-soft backdrop-blur ${draggingBoardId === id ? 'opacity-70' : ''}`}
      data-board-id={id}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium app-text-secondary">{titleText}</div>
          {countLabel && <span className="app-surface rounded-full px-2.5 py-1 text-xs app-text-secondary">{countLabel}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] app-text-muted">
          <GripVertical size={14} /> 拖动排序
        </div>
      </div>
      {content}
    </section>
  );

  const knowledgeCardCount = Math.min(recentNotes.length, 5);

  const boardMap: Record<HomeBoardId, ReactNode> = {
    recent_notes: boardShell('recent_notes', boardTitles.recent_notes, (
      <>
        <div className="mb-4 flex items-center gap-2 text-sm font-medium app-text-secondary"><Clock3 size={16} /> 最近访问的笔记</div>
        {recentNotes.length === 0 ? (
          <div className="app-surface-muted rounded-[24px] p-4 text-sm app-text-secondary">还没有最近访问的笔记。</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentNotes.map((note) => (
              <button key={note.id} onClick={() => onSelectNote(note.id)} className="app-surface-muted rounded-[24px] p-4 text-left">
                <div className="text-sm font-medium">{note.icon} {note.title}</div>
                <div className="mt-2 text-xs app-text-muted">最近编辑</div>
              </button>
            ))}
          </div>
        )}
      </>
    ), `${recentNotes.length}`),
    task_board: boardShell('task_board', boardTitles.task_board, (
      <>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium app-text-secondary"><ListTodo size={16} /> 待办和任务看板</div>
          <div className="flex gap-2">
            <button onClick={() => setShowCreate((value) => !value)} className="app-primary-button rounded-2xl px-4 py-2 text-sm font-medium"><span className="flex items-center gap-2"><Plus size={14} /> 添加</span></button>
            <button onClick={() => setShowFilter((value) => !value)} className="app-secondary-button rounded-2xl px-4 py-2 text-sm"><span className="flex items-center gap-2"><Filter size={14} /> 筛选</span></button>
          </div>
        </div>

        {showCreate && (
          <div className="mb-4 grid gap-2 rounded-[24px] app-surface-muted p-4 md:grid-cols-4">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input rounded-2xl px-3 py-2 text-sm" placeholder="任务标题" />
            <select value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])} className="app-select rounded-2xl px-3 py-2 text-sm">
              {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}优先级</option>)}
            </select>
            <select value={taskType} onChange={(event) => setTaskType(event.target.value as Task['task_type'])} className="app-select rounded-2xl px-3 py-2 text-sm">
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="flex gap-2">
              <input value={deadline} onChange={(event) => setDeadline(event.target.value)} type="datetime-local" className="app-input w-full rounded-2xl px-3 py-2 text-sm" />
              <button onClick={async () => { if (!title.trim()) return; await onCreateTask({ title: title.trim(), priority, task_type: taskType, deadline: deadline || null }); setTitle(''); setDeadline(''); setPriority('medium'); setTaskType('work'); setShowCreate(false); }} className="app-primary-button rounded-2xl px-4 py-2 text-sm">保存</button>
            </div>
          </div>
        )}

        {showFilter && (
          <div className="mb-4 flex gap-2 rounded-[24px] app-surface-muted p-4 text-sm">
            {['all', 'todo', 'doing', 'done'].map((status) => (
              <button key={status} onClick={() => setFilterStatus(status as 'all' | Task['status'])} className={`rounded-full px-3 py-2 ${filterStatus === status ? 'app-primary-button' : 'app-surface-soft app-text-secondary'}`}>
                {status === 'all' ? `全部 · ${visibleTaskCounts.all}` : `${statusLabels[status as Task['status']]} · ${visibleTaskCounts[status as Task['status']]}`}
              </button>
            ))}
          </div>
        )}

        <div className="grid max-h-[420px] gap-3 overflow-hidden md:grid-cols-3">
          {['todo', 'doing', 'done'].map((status) => {
            const statusTasks = visibleTasks.filter((task) => task.status === status);
            return (
              <div key={status} className="app-surface-muted flex min-h-0 flex-col rounded-[24px] p-4">
                <div className="mb-3 text-xs uppercase tracking-[0.25em] app-text-muted">{statusLabels[status as Task['status']]} · {visibleTaskCounts[status as Task['status']]}</div>
                <div className="space-y-2 overflow-y-auto pr-1">
                  {statusTasks.length === 0 && <div className="app-surface-soft rounded-2xl px-3 py-3 text-sm app-text-secondary">当前没有{statusLabels[status as Task['status']]}任务。</div>}
                  {statusTasks.map((task) => (
                    <div key={task.id} className="app-surface-soft rounded-2xl px-3 py-3">
                      <div className="text-sm font-medium">{task.title}</div>
                      <div className="mt-1 text-xs app-text-secondary">{priorityLabels[task.priority]} · {typeLabels[task.task_type]}{task.deadline ? ` · ${new Date(task.deadline).toLocaleDateString('zh-CN')}` : ''}</div>
                      <div className="mt-3 flex gap-2 text-xs">
                        {(['todo', 'doing', 'done'] as Task['status'][]).map((nextStatus) => (
                          <button key={nextStatus} onClick={() => onUpdateTaskStatus(task.id, nextStatus)} className={`rounded-full px-2 py-1 ${task.status === nextStatus ? 'app-primary-button' : 'app-surface app-text-secondary'}`}>
                            {statusLabels[nextStatus]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </>
    ), `${visibleTaskCounts.all}`),
    assistant: boardShell('assistant', boardTitles.assistant, (
      <Suspense fallback={<BoardSkeleton label="Assistant" />}>
        <AssistantPanel assistant={assistant} modelConfig={modelConfig} loading={false} sessions={sessions} activeSessionId={activeSessionId} onAsk={onAsk} onStartNewChat={onStartNewChat} onSwitchSession={onSwitchSession} onClearSession={onClearSession} onRenameSession={onRenameSession} onDeleteSession={onDeleteSession} onUpdateModelConfig={async () => {}} />
      </Suspense>
    )),
    knowledge_cards: boardShell('knowledge_cards', boardTitles.knowledge_cards, (
      <div className="space-y-3">
        {recentNotes.slice(0, 5).length === 0 ? (
          <div className="app-surface-muted rounded-[24px] p-4 text-sm app-text-secondary">还没有可展示的知识卡片。</div>
        ) : (
          recentNotes.slice(0, 5).map((note) => (
            <button key={note.id} onClick={() => onSelectNote(note.id)} className="app-surface-muted block w-full rounded-[24px] p-4 text-left">
              <div className="text-sm font-medium">{note.icon} {note.title}</div>
              <div className="mt-2 text-xs app-text-muted">知识卡片</div>
            </button>
          ))
        )}
      </div>
    ), `${knowledgeCardCount}`),
  };

  if (visibleLayout.length === 0) return <DashboardEmptyState onOpenSettings={onOpenSettings} onRestoreLayout={() => onReorderBoards(DEFAULT_HOME_LAYOUT.map((item) => ({ ...item })))} />;

  return <section className="grid gap-4">{visibleLayout.map((item) => boardMap[item.id])}</section>;
}
