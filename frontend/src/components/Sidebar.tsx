import { BookCopy, ChevronDown, ChevronRight, FolderPlus, Home, MoreHorizontal, Plus, Search, Settings, Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { defaultIconFor, isDataIcon, validateExistingDataIcon, validateIconFile } from '../lib/iconUtils';
import type { Note, Notebook, Task, TrashState } from '../lib/types';

type SidebarProps = {
  activePage: 'home' | 'notes' | 'settings';
  onChangePage: (page: 'home' | 'notes' | 'settings') => void;
  notes: Note[];
  notebooks: Notebook[];
  tasks: Task[];
  trash: TrashState;
  selectedNoteId: number | null;
  selectedNoteIds: number[];
  onSelectNote: (noteId: number) => void;
  onToggleNoteSelection: (noteId: number) => void;
  onClearSelection: () => void;
  onCreateNote: () => void;
  onCreateNotebook: (name: string) => void;
  onNotify: (message: string) => void;
  onUpdateNote: (noteId: number, payload: { title?: string; icon?: string }) => void;
  onUpdateNotebook: (notebookId: number, payload: { name?: string; icon?: string }) => void;
  onDeleteNotebook: (notebookId: number) => void;
  onRestoreNotebook: (notebookId: number) => void;
  onPurgeNotebook: (notebookId: number) => void;
  onCreateNoteInNotebook: (notebookId: number) => void;
  onMoveNote: (noteId: number, notebookId: number, position: number) => void;
  onBulkMoveNotes: (notebookId: number) => void;
  onBulkDeleteNotes: () => void;
  onDeleteNote: (noteId: number) => void;
  onRestoreNote: (noteId: number) => void;
  onPurgeNote: (noteId: number) => void;
  onUpload: (files: File[]) => void;
};

export function Sidebar({
  activePage,
  onChangePage,
  notes,
  notebooks,
  tasks,
  trash,
  selectedNoteId,
  selectedNoteIds,
  onSelectNote,
  onToggleNoteSelection,
  onClearSelection,
  onCreateNote,
  onCreateNotebook,
  onNotify,
  onUpdateNote,
  onUpdateNotebook,
  onDeleteNotebook,
  onRestoreNotebook,
  onPurgeNotebook,
  onCreateNoteInNotebook,
  onMoveNote,
  onBulkMoveNotes,
  onBulkDeleteNotes,
  onDeleteNote,
  onRestoreNote,
  onPurgeNote,
  onUpload,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [showNotebookCreator, setShowNotebookCreator] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [showTrash, setShowTrash] = useState(false);
  const [bulkTargetNotebookId, setBulkTargetNotebookId] = useState<number | ''>('');
  const [draggingNoteId, setDraggingNoteId] = useState<number | null>(null);
  const [activeNotebookMenuId, setActiveNotebookMenuId] = useState<number | null>(null);
  const [activeNoteMenuId, setActiveNoteMenuId] = useState<number | null>(null);

  const [editingNotebookId, setEditingNotebookId] = useState<number | null>(null);
  const [editingNotebookName, setEditingNotebookName] = useState('');
  const [editingNotebookIcon, setEditingNotebookIcon] = useState(defaultIconFor('notebook'));
  const [editingNotebookMode, setEditingNotebookMode] = useState<'rename' | 'icon'>('rename');

  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState('');
  const [editingNoteIcon, setEditingNoteIcon] = useState(defaultIconFor('note'));
  const [editingNoteMode, setEditingNoteMode] = useState<'rename' | 'icon'>('rename');

  const notebookIconInputRef = useRef<HTMLInputElement | null>(null);
  const noteIconInputRef = useRef<HTMLInputElement | null>(null);

  const tagSet = Array.from(new Set(notes.flatMap((note) => note.tags)));
  const visibleTags = showAllTags ? tagSet : tagSet.slice(0, 5);

  const filteredNotes = useMemo(
    () =>
      notes.filter((note) => {
        const matchesQuery = !query || `${note.title} ${note.summary} ${note.content}`.toLowerCase().includes(query.toLowerCase());
        const matchesTag = !activeTag || note.tags.includes(activeTag);
        return matchesQuery && matchesTag;
      }),
    [notes, query, activeTag],
  );

  const notesByNotebook = useMemo(() => {
    const grouped = new Map<number, Note[]>();
    notebooks.forEach((notebook) => grouped.set(notebook.id, []));
    filteredNotes.forEach((note) => {
      const notebookId = note.notebook_id ?? notebooks[0]?.id;
      if (!notebookId) return;
      grouped.set(notebookId, [...(grouped.get(notebookId) || []), note]);
    });
    grouped.forEach((value) => value.sort((a, b) => a.position - b.position));
    return grouped;
  }, [filteredNotes, notebooks]);

  useEffect(() => {
    notebooks.forEach((notebook) => {
      if (!isDataIcon(notebook.icon)) return;
      void validateExistingDataIcon(notebook.icon).then((valid) => {
        if (!valid) onUpdateNotebook(notebook.id, { icon: defaultIconFor('notebook') });
      });
    });
    notes.forEach((note) => {
      if (!isDataIcon(note.icon)) return;
      void validateExistingDataIcon(note.icon).then((valid) => {
        if (!valid) onUpdateNote(note.id, { icon: defaultIconFor('note') });
      });
    });
  }, [notes, notebooks, onUpdateNote, onUpdateNotebook]);

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) onUpload(files);
    event.target.value = '';
  };

  const startNotebookEdit = (notebook: Notebook, mode: 'rename' | 'icon') => {
    setEditingNotebookId(notebook.id);
    setEditingNotebookMode(mode);
    setEditingNotebookName(notebook.name);
    setEditingNotebookIcon(notebook.icon || defaultIconFor('notebook'));
  };

  const startNoteEdit = (note: Note, mode: 'rename' | 'icon') => {
    setEditingNoteId(note.id);
    setEditingNoteMode(mode);
    setEditingNoteTitle(note.title);
    setEditingNoteIcon(note.icon || defaultIconFor('note'));
  };

  const handleNotebookIconPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = await validateIconFile(file);
    if (!result.ok) {
      setEditingNotebookIcon(defaultIconFor('notebook'));
      onNotify(result.message || '图标尺寸不合适，已恢复默认图标。');
      return;
    }
    setEditingNotebookIcon(result.dataUrl || defaultIconFor('notebook'));
  };

  const handleNoteIconPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = await validateIconFile(file);
    if (!result.ok) {
      setEditingNoteIcon(defaultIconFor('note'));
      onNotify(result.message || '图标尺寸不合适，已恢复默认图标。');
      return;
    }
    setEditingNoteIcon(result.dataUrl || defaultIconFor('note'));
  };

  const renderIcon = (icon: string, fallback: string) => {
    if (isDataIcon(icon)) {
      return <img src={icon} alt="icon" className="h-7 w-7 rounded-lg object-cover" onError={(event) => { (event.currentTarget as HTMLImageElement).src = ''; }} />;
    }
    return <span className="text-lg">{icon || fallback}</span>;
  };

  return (
    <aside className="flex h-full flex-col gap-4 rounded-[22px] border border-stone-200/80 bg-[rgba(255,255,255,0.78)] p-4 shadow-[0_12px_30px_rgba(28,25,23,0.06)] backdrop-blur">
      <div className="px-1">
        <div className="text-[11px] uppercase tracking-[0.28em] text-stone-400">Second Brain</div>
        <h1 className="mt-2 font-display text-2xl text-stone-900">第二大脑</h1>
      </div>

      <div className="grid gap-1 rounded-[18px] bg-stone-50 p-1.5">
        <button onClick={() => onChangePage('home')} className={`rounded-[14px] px-3 py-2.5 text-sm font-medium ${activePage === 'home' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}><span className="flex items-center justify-center gap-2"><Home size={15} /> 主页</span></button>
        <button onClick={() => onChangePage('notes')} className={`rounded-[14px] px-3 py-2.5 text-sm font-medium ${activePage === 'notes' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}><span className="flex items-center justify-center gap-2"><BookCopy size={15} /> 笔记</span></button>
      </div>

      <div className="flex gap-2">
        {activePage === 'notes' && (
        <button className="flex flex-1 items-center justify-center gap-2 rounded-[16px] bg-stone-900 px-4 py-2.5 text-sm font-medium text-stone-50" onClick={onCreateNote}>
          <Plus size={16} /> 新建
        </button>
        )}
        <label className="flex cursor-pointer items-center justify-center rounded-[16px] border border-stone-300 bg-white px-4 py-2.5 text-stone-700">
          <UploadCloud size={16} />
          <input className="hidden" multiple type="file" accept=".txt,.md,.pdf" onChange={handleUpload} />
        </label>
        <button onClick={() => onChangePage('settings')} className={`flex items-center justify-center rounded-[16px] border bg-white px-4 py-2.5 ${activePage === 'settings' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-stone-700'}`}>
          <Settings size={16} />
        </button>
      </div>

      {activePage === 'notes' && (
      <>
      <div className="rounded-[18px] border border-stone-200 bg-white px-3 py-3">
        <div className="flex items-center gap-2 text-stone-500">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="搜索标题、摘要或内容" />
          {query && (
            <button className="text-stone-400" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {activeTag && <button onClick={() => setActiveTag(null)} className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white">清除筛选</button>}
          {visibleTags.map((tag) => (
            <button key={tag} onClick={() => setActiveTag(tag === activeTag ? null : tag)} className={`rounded-full px-3 py-1 text-xs font-medium ${tag === activeTag ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              {tag}
            </button>
          ))}
          {tagSet.length > 5 && <button onClick={() => setShowAllTags((value) => !value)} className="rounded-full bg-stone-200 px-3 py-1 text-xs font-medium text-stone-700">{showAllTags ? '收起标签' : `更多标签 +${tagSet.length - 5}`}</button>}
        </div>
      </div>

      <section className="min-h-0 flex-1 overflow-hidden">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-stone-500">
          <div className="flex items-center gap-2"><BookCopy size={16} /> 笔记本</div>
          <button onClick={() => setShowNotebookCreator(true)} className="rounded-full bg-stone-900 px-3 py-1 text-xs text-white"><span className="flex items-center gap-1"><FolderPlus size={12} /> 新建本</span></button>
        </div>

        {selectedNoteIds.length > 0 && (
          <div className="mb-3 rounded-[20px] border border-amber-200 bg-amber-50 p-3 text-sm">
            <div className="font-medium text-amber-900">已选中 {selectedNoteIds.length} 条笔记</div>
            <div className="mt-2 flex gap-2">
              <select value={bulkTargetNotebookId} onChange={(event) => setBulkTargetNotebookId(event.target.value ? Number(event.target.value) : '')} className="flex-1 rounded-2xl border border-amber-200 bg-white px-3 py-2 text-sm">
                <option value="">选择目标笔记本</option>
                {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}
              </select>
              <button onClick={() => bulkTargetNotebookId && onBulkMoveNotes(Number(bulkTargetNotebookId))} className="rounded-2xl bg-stone-900 px-3 py-2 text-white">移动</button>
              <button onClick={onBulkDeleteNotes} className="rounded-2xl bg-rose-600 px-3 py-2 text-white">删除</button>
              <button onClick={onClearSelection} className="rounded-2xl border border-stone-200 px-3 py-2 text-stone-600">清空</button>
            </div>
          </div>
        )}

        {showNotebookCreator && (
          <div className="mb-3 rounded-[20px] border border-stone-200 bg-white p-3 shadow-sm">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-stone-400">新建笔记本</div>
            <input value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm" placeholder="输入笔记本名称" />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => { setShowNotebookCreator(false); setNewNotebookName(''); }} className="rounded-2xl border border-stone-200 px-3 py-2 text-sm text-stone-600">取消</button>
              <button onClick={() => { if (!newNotebookName.trim()) return; onCreateNotebook(newNotebookName.trim()); setNewNotebookName(''); setShowNotebookCreator(false); }} className="rounded-2xl bg-stone-900 px-3 py-2 text-sm text-white">创建</button>
            </div>
          </div>
        )}

        <div className="flex max-h-[470px] flex-col gap-2 overflow-y-auto pr-1">
          {filteredNotes.length === 0 && <div className="rounded-2xl bg-white/70 px-4 py-4 text-sm text-stone-500">没有匹配的笔记，试试换个关键词或标签。</div>}
          {notebooks.map((notebook) => {
            const notebookNotes = notesByNotebook.get(notebook.id) || [];
            const isCollapsed = collapsed[notebook.id];
            const notebookEditing = editingNotebookId === notebook.id;
            return (
              <div key={notebook.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingNoteId === null) return; onMoveNote(draggingNoteId, notebook.id, notebookNotes.length); setDraggingNoteId(null); }} className="rounded-[18px] border border-stone-200 bg-white p-3">
                {notebookEditing ? (
                  <div className="space-y-2 rounded-2xl bg-stone-50 p-3">
                    {editingNotebookMode === 'rename' ? (
                      <input value={editingNotebookName} onChange={(event) => setEditingNotebookName(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <button onClick={() => notebookIconInputRef.current?.click()} className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-lg">{isDataIcon(editingNotebookIcon) ? '图片' : editingNotebookIcon}</button>
                        <input value={isDataIcon(editingNotebookIcon) ? '' : editingNotebookIcon} onChange={(event) => setEditingNotebookIcon(event.target.value || defaultIconFor('notebook'))} className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm" placeholder="输入 emoji 图标" />
                        <input ref={notebookIconInputRef} type="file" accept="image/*" className="hidden" onChange={handleNotebookIconPick} />
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingNotebookId(null)} className="rounded-2xl border border-stone-200 px-3 py-2 text-sm text-stone-600">取消</button>
                      <button onClick={() => { onUpdateNotebook(notebook.id, editingNotebookMode === 'rename' ? { name: editingNotebookName } : { icon: editingNotebookIcon }); setEditingNotebookId(null); }} className="rounded-2xl bg-stone-900 px-3 py-2 text-sm text-white">保存</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => setCollapsed((value) => ({ ...value, [notebook.id]: !value[notebook.id] }))} className="flex items-center gap-2 text-left text-sm font-medium text-stone-700">
                        {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                        {renderIcon(notebook.icon, defaultIconFor('notebook'))}
                        <span>{notebook.name}</span>
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] text-stone-600">{notebookNotes.length}</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onCreateNoteInNotebook(notebook.id)} className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">+</button>
                        <div className="group relative">
                          <button onClick={() => setActiveNotebookMenuId(activeNotebookMenuId === notebook.id ? null : notebook.id)} className="rounded-full p-1 text-stone-400 opacity-0 transition hover:bg-stone-200 hover:text-stone-700 group-hover:opacity-100">
                            <MoreHorizontal size={16} />
                          </button>
                          {activeNotebookMenuId === notebook.id && notebook.name !== '快速笔记' && (
                            <div className="absolute right-0 top-8 z-20 w-36 rounded-2xl border border-stone-200 bg-white p-2 shadow-soft">
                              <button onClick={() => { startNotebookEdit(notebook, 'rename'); setActiveNotebookMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-100">改名</button>
                              <button onClick={() => { startNotebookEdit(notebook, 'icon'); setActiveNotebookMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-100">改图标</button>
                              <button onClick={() => { onDeleteNotebook(notebook.id); setActiveNotebookMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">删除</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="mt-3 space-y-2">
                        {notebookNotes.map((note, index) => {
                          const noteEditing = editingNoteId === note.id;
                          return (
                          <div key={note.id} className={`group rounded-[16px] border px-3 py-2.5 transition ${note.id === selectedNoteId ? 'border-stone-300 bg-stone-100' : 'border-transparent bg-stone-50/80 hover:border-stone-200 hover:bg-white'}`} draggable onDragStart={() => setDraggingNoteId(note.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingNoteId === null || draggingNoteId === note.id) return; onMoveNote(draggingNoteId, notebook.id, index); setDraggingNoteId(null); }}>
                              <div className="flex items-start gap-2">
                                <input type="checkbox" checked={selectedNoteIds.includes(note.id)} onChange={() => onToggleNoteSelection(note.id)} className="mt-1" />
                                <div className="flex-1">
                                  {noteEditing ? (
                                    <div className="space-y-2 rounded-2xl bg-white p-3">
                                      {editingNoteMode === 'rename' ? (
                                        <input value={editingNoteTitle} onChange={(event) => setEditingNoteTitle(event.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm" />
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <button onClick={() => noteIconInputRef.current?.click()} className="rounded-2xl border border-stone-200 bg-white px-3 py-2 text-lg">{isDataIcon(editingNoteIcon) ? '图片' : editingNoteIcon}</button>
                                          <input value={isDataIcon(editingNoteIcon) ? '' : editingNoteIcon} onChange={(event) => setEditingNoteIcon(event.target.value || defaultIconFor('note'))} className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm" placeholder="输入 emoji 图标" />
                                          <input ref={noteIconInputRef} type="file" accept="image/*" className="hidden" onChange={handleNoteIconPick} />
                                        </div>
                                      )}
                                      <div className="flex justify-end gap-2">
                                        <button onClick={() => setEditingNoteId(null)} className="rounded-2xl border border-stone-200 px-3 py-2 text-sm text-stone-600">取消</button>
                                        <button onClick={() => { onUpdateNote(note.id, editingNoteMode === 'rename' ? { title: editingNoteTitle } : { icon: editingNoteIcon }); setEditingNoteId(null); }} className="rounded-2xl bg-stone-900 px-3 py-2 text-sm text-white">保存</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button onClick={() => onSelectNote(note.id)} className="block w-full min-w-0 text-left">
                                      <div className="truncate text-sm font-medium text-stone-800">{isDataIcon(note.icon) ? '' : note.icon} {note.title}</div>
                                      <div className="mt-1 text-[11px] text-stone-400">笔记</div>
                                    </button>
                                  )}
                                </div>
                                {!noteEditing && (
                                  <div className="relative">
                                    <button onClick={() => setActiveNoteMenuId(activeNoteMenuId === note.id ? null : note.id)} className="rounded-full p-1 text-stone-400 opacity-0 transition hover:bg-stone-200 hover:text-stone-700 group-hover:opacity-100">
                                      <MoreHorizontal size={16} />
                                    </button>
                                    {activeNoteMenuId === note.id && (
                                      <div className="absolute right-0 top-8 z-20 w-36 rounded-2xl border border-stone-200 bg-white p-2 shadow-soft">
                                        <button onClick={() => { startNoteEdit(note, 'rename'); setActiveNoteMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-100">改名</button>
                                        <button onClick={() => { startNoteEdit(note, 'icon'); setActiveNoteMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-stone-100">改图标</button>
                                        <button onClick={() => { onDeleteNote(note.id); setActiveNoteMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">删除</button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <button onClick={() => setShowTrash((value) => !value)} className="mb-3 flex w-full items-center justify-between text-sm font-medium text-stone-500">
          <span className="flex items-center gap-2"><Trash2 size={16} /> 垃圾桶</span>
          {showTrash ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {showTrash && (
          <div className="max-h-[220px] space-y-2 overflow-y-auto rounded-2xl bg-white/70 p-3">
            {trash.notebooks.map((notebook) => (
              <div key={`notebook-${notebook.id}`} className="rounded-2xl bg-stone-50 px-3 py-3 text-sm">
                <div className="font-medium text-stone-800">{notebook.name}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => onRestoreNotebook(notebook.id)} className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">恢复</button>
                  <button onClick={() => onPurgeNotebook(notebook.id)} className="rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700">永久删除</button>
                </div>
              </div>
            ))}
            {trash.notes.map((note) => (
              <div key={`note-${note.id}`} className="rounded-2xl bg-stone-50 px-3 py-3 text-sm">
                <div className="font-medium text-stone-800">{note.title}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => onRestoreNote(note.id)} className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">恢复</button>
                  <button onClick={() => onPurgeNote(note.id)} className="rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700">永久删除</button>
                </div>
              </div>
            ))}
            {trash.notes.length === 0 && trash.notebooks.length === 0 && <div className="text-sm text-stone-400">垃圾桶为空。</div>}
          </div>
        )}
      </section>

      </>
      )}
    </aside>
  );
}
