import { AlertCircle, ChevronRight, Clock3, Filter, ListTodo, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AssistantPanel } from './AssistantPanel';
import { AchievementWall } from './AchievementWall';
import { PRESET_TEMPLATES } from '../lib/templates';
import type { AskResponse, ChatSession, ModelConfig, Note, Task, UserStats, UserAchievement } from '../lib/types';

type HomeDashboardProps = {
  recentNotes: Note[];
  notes: Note[];
  tasks: Task[];
  unsyncedNotes: Note[];
  assistant: AskResponse | null;
  modelConfig: ModelConfig;
  sessions: ChatSession[];
  activeSessionId: string;
  userStats: UserStats | null;
  userAchievements: UserAchievement[];
  onSelectNote: (noteId: number) => void;
  onRetryNoteSync: (noteId: number) => void;
  onRetryAllPendingSync: () => void;
  onCreateTemplateNote: (templateName: string) => void;
  onAsk: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  onCreateTask: (payload: { title: string; priority: Task['priority']; task_type: Task['task_type']; deadline: string | null }) => Promise<void>;
  onUpdateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
  onDeleteTask: (taskId: number) => Promise<void>;
  onClearCompleted: () => Promise<void>;
  onStartNewChat: () => void;
  onSwitchSession: (sessionId: string) => void;
  onClearSession: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
};

type TimelineItem =
  | { id: string; kind: 'task-deadline'; title: string; when: string; meta: string }
  | { id: string; kind: 'task-created'; title: string; when: string; meta: string }
  | { id: string; kind: 'note-created'; title: string; when: string; meta: string; noteId: number; isPrivate: boolean };

const PRIVATE_TAGS = new Set(['私密', 'private']);
const typeLabels: Record<Task['task_type'], string> = { meeting: '会议', work: '工作任务', travel: '出行', errand: '办事', study: '学习', personal: '个人' };
const priorityLabels: Record<Task['priority'], string> = { low: '低', medium: '中', high: '高' };
const statusLabels: Record<Task['status'], string> = { todo: '待办', doing: '进行中', done: '已完成' };

function isPrivateNote(note: Note) {
  return note.tags.some((tag) => PRIVATE_TAGS.has(tag.toLowerCase()));
}

function getDisplayNoteTitle(note: Note) {
  return isPrivateNote(note) ? '私密笔记' : (note.title || '未命名笔记');
}

function getDisplayNoteSummary(note: Note) {
  return isPrivateNote(note) ? '内容已锁定。' : (note.summary || '暂无记录摘要。');
}

function formatTimelineTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HomeDashboard({
  recentNotes, notes, tasks, unsyncedNotes, assistant, modelConfig, sessions, activeSessionId, userStats, userAchievements,
  onSelectNote, onRetryNoteSync, onRetryAllPendingSync, onCreateTemplateNote, onAsk, onCreateTask, onUpdateTaskStatus, onDeleteTask, onClearCompleted,
  onStartNewChat, onSwitchSession, onClearSession, onRenameSession, onDeleteSession
}: HomeDashboardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [taskType, setTaskType] = useState<Task['task_type']>('work');
  const [deadline, setDeadline] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | Task['status']>('all');
  const visibleTasks = useMemo(() => tasks.filter((task) => filterStatus === 'all' || task.status === filterStatus), [tasks, filterStatus]);
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const noteItems: TimelineItem[] = notes
      .filter((note) => !note.deleted_at)
      .map((note) => ({
        id: `note-${note.id}`,
        kind: 'note-created',
        title: getDisplayNoteTitle(note),
        when: note.created_at,
        meta: isPrivateNote(note) ? '私密内容已锁定' : (note.is_draft ? '草稿创建' : '笔记创建'),
        noteId: note.id,
        isPrivate: isPrivateNote(note),
      }));

    const taskCreatedItems: TimelineItem[] = tasks.map((task) => ({
      id: `task-created-${task.id}`,
      kind: 'task-created',
      title: task.title,
      when: task.created_at,
      meta: `${typeLabels[task.task_type]} · ${statusLabels[task.status]}`,
    }));

    const taskDeadlineItems: TimelineItem[] = tasks
      .filter((task) => !!task.deadline)
      .map((task) => ({
        id: `task-deadline-${task.id}`,
        kind: 'task-deadline',
        title: task.title,
        when: task.deadline!,
        meta: `${priorityLabels[task.priority]}优先级截止`,
      }));

    return [...taskDeadlineItems, ...taskCreatedItems, ...noteItems]
      .filter((item) => !Number.isNaN(new Date(item.when).getTime()))
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 8);
  }, [notes, tasks]);

  const hasWallpaper = !!userStats?.wallpaper_url;
  const glassClasses = hasWallpaper ? 'glass-panel' : 'bg-white';

  return (
    <section className="grid gap-8 max-w-5xl mx-auto py-4 antialiased text-reflect-text">
      {/* Welcome Header */}
      <header className="px-2 flex justify-between items-end">
        <div>
          <h1 className="font-serif text-3xl italic font-medium">早上好，Reflect。</h1>
          <p className="mt-2 text-sm text-reflect-muted font-sans tracking-tight">今天是 {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AchievementWall achievements={userAchievements} />
          {userStats && (
            <div className="text-right">
               <div className="text-[10px] font-bold uppercase tracking-widest text-reflect-accent mb-1">Level {userStats.level}</div>
               <div className="h-1.5 w-32 bg-reflect-sidebar rounded-full overflow-hidden">
                  <div
                    className="h-full bg-reflect-accent transition-all duration-500"
                    style={{ width: `${(userStats.exp % 100)}%` }}
                  />
               </div>
               <div className="text-[9px] text-reflect-muted mt-1 font-mono">{userStats.exp} EXP</div>
            </div>
          )}
        </div>
      </header>

      {unsyncedNotes.length > 0 && (
        <div className={`mx-2 rounded-2xl border border-amber-200/70 px-5 py-4 text-amber-900 ${hasWallpaper ? 'bg-amber-50/75 backdrop-blur-sm' : 'bg-amber-50'}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle size={14} className="shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold">{unsyncedNotes.length} 条笔记等待同步</div>
                <div className="text-[11px] opacity-75">失败的保存会在恢复连接后重放，也可以立即手动重试。</div>
              </div>
            </div>
            <button
              onClick={onRetryAllPendingSync}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[11px] font-medium hover:bg-amber-100 transition-colors"
            >
              <RefreshCw size={12} />
              全部重试
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {unsyncedNotes.slice(0, 4).map((note) => (
              <div key={note.id} className="flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2">
                <button onClick={() => onSelectNote(note.id)} className="flex-1 truncate text-left text-[11px] font-medium hover:underline">
                  {getDisplayNoteTitle(note)}
                </button>
                <span className="text-[10px] opacity-70">{note.sync_status === 'error' ? '失败' : '排队中'}</span>
                <button
                  onClick={() => onRetryNoteSync(note.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] hover:bg-amber-100 transition-colors"
                >
                  <RefreshCw size={10} />
                  重试
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-reflect-muted font-bold opacity-60">
            <Clock3 size={12} /> 最近记录
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {PRESET_TEMPLATES.slice(0, 4).map((template) => (
              <button
                key={template.name}
                onClick={() => onCreateTemplateNote(template.name)}
                className="rounded-full border border-reflect-border/50 px-3 py-1.5 text-[10px] font-medium text-reflect-muted transition-colors hover:bg-reflect-sidebar/40 hover:text-reflect-text"
                title={template.description}
              >
                <span className="mr-1">{template.icon}</span>
                {template.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recentNotes.slice(0, 3).map((note, idx) => {
            const macaronColors = ['bg-macaron-pink', 'bg-macaron-blue', 'bg-macaron-green', 'bg-macaron-yellow', 'bg-macaron-purple'];
            const macaronBg = !hasWallpaper ? macaronColors[idx % macaronColors.length] + '/30' : '';
            const privateNote = isPrivateNote(note);
            return (
            <button
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className={`group relative h-40 rounded-2xl border border-reflect-border/50 p-6 text-left transition-all hover:border-reflect-accent/30 hover:shadow-soft ${glassClasses} ${macaronBg}`}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="text-2xl opacity-80 group-hover:opacity-100 transition-opacity">{privateNote ? '🔒' : (note.icon || '📝')}</div>
                {privateNote && <Lock size={12} className="text-reflect-muted" />}
              </div>
              <div className="text-sm font-semibold text-reflect-text leading-tight mb-1">{getDisplayNoteTitle(note)}</div>
              <div className="text-[10px] text-reflect-muted line-clamp-2 leading-relaxed opacity-70">
                {getDisplayNoteSummary(note)}
              </div>
              <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-40 transition-opacity">
                 <Plus size={14} />
              </div>
            </button>
          );})}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 text-[10px] uppercase tracking-widest text-reflect-muted font-bold opacity-60">
            <ListTodo size={12} /> 时间轴
          </div>
          <div className={`rounded-2xl border border-reflect-border/50 p-4 ${glassClasses}`}>
            {timelineItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-reflect-border/50 px-4 py-6 text-center text-xs text-reflect-muted">
                还没有可展示的时间事件。
              </div>
            ) : (
              <div className="space-y-3">
                {timelineItems.map((item) => {
                  const dotClass = item.kind === 'task-deadline'
                    ? 'bg-rose-400'
                    : item.kind === 'task-created'
                      ? 'bg-amber-400'
                      : 'bg-sky-400';
                  const label = item.kind === 'task-deadline'
                    ? '截止'
                    : item.kind === 'task-created'
                      ? '任务'
                      : '笔记';
                  const content = (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-xs font-semibold text-reflect-text truncate">{item.title}</div>
                          {'isPrivate' in item && item.isPrivate && <Lock size={11} className="text-reflect-muted" />}
                        </div>
                        <div className="mt-1 text-[10px] text-reflect-muted">{item.meta}</div>
                      </div>
                      <span className="shrink-0 text-[10px] text-reflect-muted">{formatTimelineTime(item.when)}</span>
                    </div>
                  );

                  return item.kind === 'note-created' ? (
                    <button
                      key={item.id}
                      onClick={() => onSelectNote(item.noteId)}
                      className="flex w-full items-start gap-3 rounded-xl border border-reflect-border/40 px-3 py-3 text-left transition-colors hover:bg-reflect-sidebar/35"
                    >
                      <div className="flex flex-col items-center pt-0.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                        <span className="mt-2 rounded-full bg-reflect-sidebar/60 px-2 py-0.5 text-[9px] uppercase tracking-widest text-reflect-muted">{label}</span>
                      </div>
                      <div className="flex-1 min-w-0">{content}</div>
                    </button>
                  ) : (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border border-reflect-border/40 px-3 py-3"
                    >
                      <div className="flex flex-col items-center pt-0.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                        <span className="mt-2 rounded-full bg-reflect-sidebar/60 px-2 py-0.5 text-[9px] uppercase tracking-widest text-reflect-muted">{label}</span>
                      </div>
                      <div className="flex-1 min-w-0">{content}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-reflect-muted font-bold opacity-60">
              <ListTodo size={12} /> 任务看板
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="text-[10px] uppercase tracking-widest font-bold text-reflect-accent hover:opacity-70 transition-opacity"
              >
                添加任务
              </button>
            </div>
          </div>

          {showCreate && (
            <div className={`mx-2 p-4 border border-reflect-border/50 rounded-2xl shadow-soft animate-in fade-in slide-in-from-top-2 duration-300 ${glassClasses}`}>
              <div className="grid gap-4 md:grid-cols-4">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="任务标题..."
                  className="col-span-1 md:col-span-2 bg-reflect-bg border-none rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-reflect-accent outline-none transition-all"
                />
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Task['priority'])}
                  className="bg-reflect-bg border-none rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-reflect-accent outline-none appearance-none"
                >
                  <option value="high">高优先级</option>
                  <option value="medium">中优先级</option>
                  <option value="low">低优先级</option>
                </select>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as Task['task_type'])}
                  className="bg-reflect-bg border-none rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-reflect-accent outline-none appearance-none"
                >
                  {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-reflect-bg border-none rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-reflect-accent outline-none"
                />
                <div className="md:col-start-4 flex gap-2">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="flex-1 px-4 py-2 rounded-xl text-xs font-bold text-reflect-muted hover:bg-reflect-bg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={async () => {
                      if (!title.trim()) return;
                      await onCreateTask({ title: title.trim(), priority, task_type: taskType, deadline: deadline || null });
                      setTitle('');
                      setDeadline('');
                      setShowCreate(false);
                    }}
                    className="flex-1 px-4 py-2 rounded-xl text-xs font-bold bg-reflect-text text-white hover:opacity-90 transition-all active:scale-95"
                  >
                    创建任务
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-1 xl:grid-cols-3">
            {['todo', 'doing', 'done'].map((status) => (
              <div key={status} className="flex flex-col min-h-0 bg-reflect-sidebar/30 rounded-2xl p-4 border border-reflect-border/30">
                <div className="mb-4 flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-reflect-muted opacity-50">{status}</span>
                  <div className="flex items-center gap-2">
                    {status === 'done' && visibleTasks.filter(t => t.status === 'done').length > 0 && (
                      <button
                        onClick={() => onClearCompleted()}
                        className="text-[9px] font-bold text-rose-500/60 hover:text-rose-600 transition-colors uppercase tracking-widest"
                        title="清除所有已完成任务"
                      >
                        Clear
                      </button>
                    )}
                    <span className="text-[10px] text-reflect-muted font-mono">{visibleTasks.filter(t => t.status === status).length}</span>
                  </div>
                </div>
                <div className="space-y-3 overflow-y-auto pr-1 max-h-[300px] custom-scrollbar">
                  {visibleTasks.filter((task) => task.status === status).map((task) => (
                    <div key={task.id} className={`group rounded-xl p-4 border border-reflect-border/50 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all hover:shadow-soft relative ${glassClasses}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-medium text-reflect-text leading-snug">{task.title}</div>
                        <button
                          onClick={() => onDeleteTask(task.id)}
                          className="text-reflect-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                          title="废弃任务"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                         <span className={`w-1 h-1 rounded-full ${task.priority === 'high' ? 'bg-rose-400' : task.priority === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                         <span className="text-[10px] text-reflect-muted opacity-60">{typeLabels[task.task_type]}</span>
                      </div>
                      <div className="mt-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {(['todo', 'doing', 'done'] as Task['status'][]).map((nextStatus) => (
                          <button
                            key={nextStatus}
                            onClick={() => onUpdateTaskStatus(task.id, nextStatus)}
                            className={`text-[9px] px-2 py-0.5 rounded-full transition-colors ${task.status === nextStatus ? 'bg-reflect-text text-white' : 'bg-reflect-bg text-reflect-muted hover:bg-reflect-border/50'}`}
                          >
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
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-4">
           <div className="flex items-center gap-2 px-2 text-[10px] uppercase tracking-widest text-reflect-muted font-bold opacity-60">
            智能助手
          </div>
          <div className={`rounded-2xl border border-reflect-border/50 p-6 overflow-hidden min-h-[400px] ${glassClasses}`}>
             <AssistantPanel assistant={assistant} modelConfig={modelConfig} loading={false} sessions={sessions} activeSessionId={activeSessionId} isEmbedded={true} onAsk={onAsk} onStartNewChat={onStartNewChat} onSwitchSession={onSwitchSession} onClearSession={onClearSession} onRenameSession={onRenameSession} onDeleteSession={onDeleteSession} onUpdateModelConfig={async () => {}} />
          </div>
        </div>

        <div className="space-y-4">
           <div className="flex items-center gap-2 px-2 text-[10px] uppercase tracking-widest text-reflect-muted font-bold opacity-60">
            收藏
          </div>
          <div className="space-y-3">
            {recentNotes.slice(0, 5).map((note) => (
              <button
                key={note.id}
                onClick={() => onSelectNote(note.id)}
                className={`group flex items-center gap-3 w-full rounded-xl p-3 border border-reflect-border/40 transition-all hover:bg-reflect-sidebar/40 ${glassClasses}`}
              >
                <span className="text-sm opacity-70 group-hover:opacity-100">{isPrivateNote(note) ? '🔒' : (note.icon || '📄')}</span>
                <span className="text-xs font-medium text-reflect-text truncate flex-1 text-left">{getDisplayNoteTitle(note)}</span>
                <ChevronRight size={12} className="text-reflect-muted opacity-0 group-hover:opacity-40 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
