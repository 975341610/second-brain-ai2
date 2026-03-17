import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import type { Task } from '../lib/types';

type TaskBoardProps = {
  tasks: Task[];
  onCreateTask: (title: string) => Promise<void>;
  onUpdateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
};

const columns: Task['status'][] = ['todo', 'doing', 'done'];

export function TaskBoard({ tasks, onCreateTask, onUpdateTaskStatus }: TaskBoardProps) {
  const [title, setTitle] = useState('');

  return (
    <section className="rounded-[28px] border border-white/50 bg-[rgba(255,251,245,0.82)] p-5 shadow-soft backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-stone-900">Task board</div>
          <div className="text-xs text-stone-500">Agent-created TODOs stay editable.</div>
        </div>
        <div className="flex gap-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm" placeholder="Add task" />
          <button
            onClick={async () => {
              if (!title.trim()) return;
              await onCreateTask(title.trim());
              setTitle('');
            }}
            className="rounded-2xl bg-stone-900 px-4 py-2 text-sm font-medium text-white"
          >
            Add
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((column) => (
          <div key={column} className="rounded-[24px] bg-white/90 p-4">
            <div className="mb-3 text-xs uppercase tracking-[0.25em] text-stone-400">{column}</div>
            <div className="space-y-2">
              {tasks.filter((task) => task.status === column).map((task) => (
                <div key={task.id} className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm text-stone-800">{task.title}</div>
                    <CheckCircle2 className="text-emerald-600" size={16} />
                  </div>
                  <div className="mt-3 flex gap-2 text-xs">
                    {columns.map((status) => (
                      <button
                        key={status}
                        onClick={() => onUpdateTaskStatus(task.id, status)}
                        className={`rounded-full px-2 py-1 ${task.status === status ? 'bg-stone-900 text-white' : 'bg-white text-stone-500'}`}
                      >
                        {status}
                      </button>
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
