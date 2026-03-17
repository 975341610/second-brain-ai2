import { BookOpenText, Clock3, PencilLine, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Note } from '../lib/types';

type EditorPanelProps = {
  note: Note | null;
  relatedNotes: Note[];
  isSaving: boolean;
  onSave: (payload: { id?: number; title: string; content: string; icon?: string; silent?: boolean }) => Promise<void>;
};

export function EditorPanel({ note, relatedNotes, isSaving, onSave }: EditorPanelProps) {
  const [content, setContent] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setContent(note?.content ?? '# 开始记录\n\n写下你的灵感、项目规划、读书摘录或研究结论。');
    setLastSavedAt(note ? new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null);
  }, [note]);

  const summary = useMemo(() => note?.summary || '保存笔记后，这里会显示 AI 自动摘要。', [note]);
  const isDirty = content !== (note?.content ?? '# 开始记录\n\n写下你的灵感、项目规划、读书摘录或研究结论。');

  useEffect(() => {
    if (!isDirty || isSaving) {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      return;
    }
    autosaveTimerRef.current = window.setTimeout(async () => {
      await onSave({ id: note?.id, title: note?.title ?? '未命名笔记', content, icon: note?.icon ?? '📝', silent: true });
      setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    }, 2600);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [content, note?.id, note?.title, note?.icon, isDirty, isSaving, onSave]);

  return (
    <section className="flex h-[min(72vh,980px)] min-h-[680px] flex-col gap-4 overflow-hidden rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.85)] p-6 shadow-soft backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-2xl">{note?.icon ?? '📝'}</div>
            <h2 className="font-display text-4xl text-stone-900">{note?.title ?? '未命名笔记'}</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">{summary}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
            <Clock3 size={14} />
            {isSaving ? '正在自动保存...' : isDirty ? '有未保存修改' : lastSavedAt ? `已保存于 ${lastSavedAt}` : '内容已同步'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {note?.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-2">
            <button
              onClick={() => setViewMode('edit')}
              className={`rounded-2xl px-3 py-2 text-sm font-medium ${viewMode === 'edit' ? 'bg-stone-900 text-white' : 'text-stone-500'}`}
            >
              <span className="flex items-center gap-2"><PencilLine size={14} /> 输入</span>
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`rounded-2xl px-3 py-2 text-sm font-medium ${viewMode === 'preview' ? 'bg-stone-900 text-white' : 'text-stone-500'}`}
            >
              <span className="flex items-center gap-2"><BookOpenText size={14} /> 阅读</span>
            </button>
          </div>
          <button
            onClick={() => onSave({ id: note?.id, title: note?.title ?? '未命名笔记', content, icon: note?.icon ?? '📝' })}
            disabled={isSaving}
            className="flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-stone-50"
          >
            <Save size={16} /> {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-0 overflow-hidden rounded-[24px] border border-stone-200 bg-white/90">
          {viewMode === 'edit' ? (
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="h-full min-h-[320px] w-full resize-none bg-transparent p-5 text-sm leading-7 text-stone-700 outline-none"
            />
          ) : (
            <div className="markdown-body h-full min-h-[320px] overflow-y-auto p-5">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <div className="rounded-[24px] border border-stone-200 bg-white/90 p-5 overflow-hidden">
            <div className="mb-3 text-sm font-medium text-stone-500">关联卡片</div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {relatedNotes.length === 0 && <div className="text-sm text-stone-400">暂时还没有相似卡片。</div>}
              {relatedNotes.map((item) => (
                <div key={item.id} className="rounded-2xl bg-stone-50 px-4 py-3">
                  <div className="text-sm font-medium text-stone-800">{item.title}</div>
                  <div className="mt-1 text-xs text-stone-500">{item.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
