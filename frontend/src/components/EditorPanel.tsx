import { Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Note } from '../lib/types';

type EditorPanelProps = {
  note: Note | null;
  relatedNotes: Note[];
  onSave: (payload: { id?: number; title: string; content: string }) => Promise<void>;
};

export function EditorPanel({ note, relatedNotes, onSave }: EditorPanelProps) {
  const [title, setTitle] = useState('Untitled');
  const [content, setContent] = useState('');

  useEffect(() => {
    setTitle(note?.title ?? 'Untitled');
    setContent(note?.content ?? '# Start writing\n\nCapture a note, research insight, or project brief.');
  }, [note]);

  const summary = useMemo(() => note?.summary || 'AI summaries appear here after saving the note.', [note]);

  return (
    <section className="flex h-full flex-col gap-4 rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.85)] p-6 shadow-soft backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full bg-transparent font-display text-4xl text-stone-900 outline-none"
            placeholder="Untitled"
          />
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">{summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {note?.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => onSave({ id: note?.id, title, content })}
          className="flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-stone-50"
        >
          <Save size={16} /> Save
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-[320px] w-full rounded-[24px] border border-stone-200 bg-white/90 p-5 text-sm leading-7 text-stone-700 outline-none"
        />

        <div className="flex min-h-0 flex-col gap-4">
          <div className="markdown-body min-h-[220px] overflow-y-auto rounded-[24px] border border-stone-200 bg-white/90 p-5">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white/90 p-5">
            <div className="mb-3 text-sm font-medium text-stone-500">Card links</div>
            <div className="space-y-2">
              {relatedNotes.length === 0 && <div className="text-sm text-stone-400">No similar cards yet.</div>}
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
