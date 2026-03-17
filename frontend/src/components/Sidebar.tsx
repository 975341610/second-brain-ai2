import { FileText, Plus, Search, Tag, UploadCloud, X } from 'lucide-react';
import { useMemo, useState, type ChangeEvent } from 'react';
import type { Note, Task } from '../lib/types';

type SidebarProps = {
  notes: Note[];
  tasks: Task[];
  selectedNoteId: number | null;
  onSelectNote: (noteId: number) => void;
  onCreateNote: () => void;
  onUpload: (files: File[]) => void;
};

export function Sidebar({ notes, tasks, selectedNoteId, onSelectNote, onCreateNote, onUpload }: SidebarProps) {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const tagSet = Array.from(new Set(notes.flatMap((note) => note.tags))).slice(0, 12);
  const filteredNotes = useMemo(
    () =>
      notes.filter((note) => {
        const matchesQuery = !query || `${note.title} ${note.summary} ${note.content}`.toLowerCase().includes(query.toLowerCase());
        const matchesTag = !activeTag || note.tags.includes(activeTag);
        return matchesQuery && matchesTag;
      }),
    [notes, query, activeTag],
  );

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) onUpload(files);
    event.target.value = '';
  };

  return (
    <aside className="flex h-full flex-col gap-6 rounded-[28px] border border-white/60 bg-[rgba(253,250,242,0.88)] p-5 shadow-soft backdrop-blur">
      <div>
        <div className="text-xs uppercase tracking-[0.35em] text-stone-500">Second Brain</div>
        <h1 className="mt-3 font-display text-3xl text-stone-900">第二大脑</h1>
      </div>

      <div className="flex gap-2">
        <button className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-stone-50" onClick={onCreateNote}>
          <Plus size={16} /> 新建
        </button>
        <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-stone-300 px-4 py-3 text-stone-700">
          <UploadCloud size={16} />
          <input className="hidden" multiple type="file" accept=".txt,.md,.pdf" onChange={handleUpload} />
        </label>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white/75 px-3 py-3">
        <div className="flex items-center gap-2 text-stone-500">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-sm outline-none"
            placeholder="搜索标题、摘要或内容"
          />
          {query && (
            <button className="text-stone-400" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <section className="min-h-0 flex-1 overflow-hidden">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500">
          <FileText size={16} /> 笔记
        </div>
        <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
          {filteredNotes.length === 0 && <div className="rounded-2xl bg-white/70 px-4 py-4 text-sm text-stone-500">没有匹配的笔记，试试换个关键词或标签。</div>}
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                note.id === selectedNoteId
                  ? 'border-amber-300 bg-amber-50 text-stone-900'
                  : 'border-transparent bg-white/70 text-stone-600 hover:border-stone-200 hover:bg-white'
              }`}
            >
              <div className="truncate text-sm font-medium">{note.title}</div>
              <div className="mt-1 line-clamp-2 text-xs text-stone-500">{note.summary}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500">
          <Tag size={16} /> 标签
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTag && (
            <button onClick={() => setActiveTag(null)} className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white">
              清除筛选
            </button>
          )}
          {tagSet.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${tag === activeTag ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 text-sm font-medium text-stone-500">待办</div>
        <div className="space-y-2">
          {tasks.slice(0, 4).map((task) => (
            <div key={task.id} className="rounded-2xl bg-white/70 px-4 py-3 text-sm text-stone-700">
              <div>{task.title}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.25em] text-stone-400">{task.status}</div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
