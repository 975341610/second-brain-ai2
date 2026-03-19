import { CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Task } from '../lib/types';

type TaskBoardProps = {
  tasks: Task[];
  onCreateTask: (payload: { title: string; priority: Task['priority']; task_type: Task['task_type']; deadline: string | null }) => Promise<void>;
  onUpdateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
};

const columns: Task['status'][] = ['todo', 'doing', 'done'];
const statusLabels: Record<Task['status'], string> = { todo: '待开始', doing: '进行中', done: '已完成' };
const priorityLabels: Record<Task['priority'], string> = { low: '低', medium: '中', high: '高' };
const typeLabels: Record<Task['task_type'], string> = { meeting: '会议', work: '工作任务', travel: '出行', errand: '办事', study: '学习', personal: '个人' };

export function TaskBoard({ tasks, onCreateTask, onUpdateTaskStatus }: TaskBoardProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [taskType, setTaskType] = useState<Task['task_type']>('work');
  const [deadline, setDeadline] = useState('');

  const grouped = useMemo(() => columns.reduce((acc, column) => ({ ...acc, [column]: tasks.filter((task) => task.status === column) }), {} as Record<Task['status'], Task[]>), [tasks]);

  return (
    <section className="h-[min(58vh,760px)] min-h-[460px] overflow-hidden rounded-[28px] border border-white/50 bg-[rgba(255,251,245,0.82)] p-5 shadow-soft backdrop-blur">
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-sm font-medium text-stone-900">任务看板</div>
          <div className="text-xs text-stone-500">按优先级和截止时间自动排序。</div>
        </div>
        <div className="grid gap-2 md:grid-cols-4 xl:min-w-[760px]">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm" placeholder="任务标题" />
          <select value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])} className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm">
            <option value="high">高优先级</option>
            <option value="medium">中优先级</option>
            <option value="low">低优先级</option>
          </select>
          <select value={taskType} onChange={(event) => setTaskType(event.target.value as Task['task_type'])} className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm">
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="flex gap-2">
            <input value={deadline} onChange={(event) => setDeadline(event.target.value)} type="datetime-local" className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm" />
            <button onClick={async () => { if (!title.trim()) return; await onCreateTask({ title: title.trim(), priority, task_type: taskType, deadline: deadline || null }); setTitle(''); setDeadline(''); setPriority('medium'); setTaskType('work'); }} className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-medium text-white">添加</button>
          </div>
        </div>
      </div>

      <div className="grid h-[calc(100%-122px)] gap-3 overflow-hidden md:grid-cols-3">
        {columns.map((column) => (
          <div key={column} className="flex min-h-0 flex-col rounded-[24px] bg-white/90 p-4">
            <div className="mb-3 text-xs uppercase tracking-[0.25em] text-stone-400">{statusLabels[column]}</div>
            <div className="space-y-2 overflow-y-auto pr-1">
              {grouped[column].map((task) => (
                <div key={task.id} className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-stone-800">{task.title}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-500">
                        <span className="rounded-full bg-white px-2 py-1">{priorityLabels[task.priority]}</span>
                        <span className="rounded-full bg-white px-2 py-1">{typeLabels[task.task_type]}</span>
                        {task.deadline && <span className="rounded-full bg-white px-2 py-1">DDL {new Date(task.deadline).toLocaleString('zh-CN')}</span>}
                      </div>
                    </div>
                    <CheckCircle2 className="text-emerald-600" size={16} />
                  </div>
                  <div className="mt-3 flex gap-2 text-xs">
                    {columns.map((status) => (
                      <button key={status} onClick={() => onUpdateTaskStatus(task.id, status)} className={`rounded-full px-2 py-1 ${task.status === status ? 'bg-stone-900 text-white' : 'bg-white text-stone-500'}`}>{statusLabels[status]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
