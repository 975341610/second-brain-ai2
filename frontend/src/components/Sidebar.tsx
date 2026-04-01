import { BookCopy, CalendarRange, ChevronDown, ChevronRight, FolderPlus, Home, MoreHorizontal, Plus, Search, Settings, Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { defaultIconFor, isDataIcon, validateExistingDataIcon, validateIconFile } from '../lib/iconUtils';
import type { Note, Notebook, Task, TrashState } from '../lib/types';

type TreeNote = Note & { children: TreeNote[] };

type SidebarProps = {
  activePage: 'home' | 'notes' | 'timeline' | 'settings';
  onChangePage: (page: 'home' | 'notes' | 'timeline' | 'settings') => void;
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
  onCreateChildNote: (noteId: number) => void;
  onMoveNote: (noteId: number, notebookId: number, position: number, parentId?: number | null) => void;
  onBulkMoveNotes: (notebookId: number) => void;
  onBulkDeleteNotes: () => void;
  onDeleteNote: (noteId: number) => void;
  onRestoreNote: (noteId: number) => void;
  onPurgeNote: (noteId: number) => void;
  onUpload: (files: File[]) => void;
};

function sortNotes(items: Note[]): Note[] {
  return [...items].sort((a, b) =>
    a.position - b.position
    || (a.path ?? '').localeCompare(b.path ?? '')
    || a.id - b.id,
  );
}

function buildNotebookTree(notes: Note[], notebookId: number): TreeNote[] {
  const notebookNotes = sortNotes(notes.filter((note) => note.notebook_id === notebookId));
  const nodeMap = new Map<number, TreeNote>();
  notebookNotes.forEach((note) => nodeMap.set(note.id, { ...note, children: [] }));
  const roots: TreeNote[] = [];
  notebookNotes.forEach((note) => {
    const node = nodeMap.get(note.id);
    if (!node) return;
    const parentId = note.parent_id ?? null;
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)?.children.push(node);
      return;
    }
    roots.push(node);
  });
  const sortTree = (items: TreeNote[]) => {
    items.sort((a, b) => a.position - b.position || (a.path ?? '').localeCompare(b.path ?? '') || a.id - b.id);
    items.forEach((item) => sortTree(item.children));
  };
  sortTree(roots);
  return roots;
}

function countTreeNotes(items: TreeNote[]): number {
  return items.reduce((total, item) => total + 1 + countTreeNotes(item.children), 0);
}

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
  onCreateChildNote,
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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

  void tasks;

  const tagSet = Array.from(new Set(notes.flatMap((note) => note.tags)));
  const visibleTags = showAllTags ? tagSet : tagSet.slice(0, 5);

  const filteredNotes = useMemo(
    () =>
      notes.filter((note) => {
        const matchesQuery = !query || `${note.title} ${note.summary} ${note.content} ${note.path ?? ''}`.toLowerCase().includes(query.toLowerCase());
        const matchesTag = !activeTag || note.tags.includes(activeTag);
        return matchesQuery && matchesTag;
      }),
    [notes, query, activeTag],
  );

  const noteTreesByNotebook = useMemo(() => {
    const grouped = new Map<number, TreeNote[]>();
    notebooks.forEach((notebook) => grouped.set(notebook.id, buildNotebookTree(filteredNotes, notebook.id)));
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

  const renderIcon = (icon: string, fallback: string, className = 'h-7 w-7') => {
    if (isDataIcon(icon)) {
      return <img src={icon} alt="icon" className={`${className} rounded-lg object-cover`} onError={(event) => { (event.currentTarget as HTMLImageElement).src = ''; }} />;
    }
    return <span className="text-lg">{icon || fallback}</span>;
  };

  const renderNoteNode = (note: TreeNote, notebookId: number, depth = 0): JSX.Element => {
    const noteEditing = editingNoteId === note.id;
    const collapsedKey = `note-${note.id}`;
    const hasChildren = note.children.length > 0;
    const isCollapsed = collapsed[collapsedKey];

    return (
      <div key={note.id} className="space-y-2" style={{ marginLeft: depth * 14 }}>
        <div
          className={`group rounded-[16px] border px-3 py-2.5 transition ${note.id === selectedNoteId ? 'app-surface shadow-sm' : 'app-surface-soft app-hover-surface border-transparent'}`}
          draggable
          onDragStart={() => setDraggingNoteId(note.id)}
          onDragEnd={() => setDraggingNoteId(null)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingNoteId === null || draggingNoteId === note.id) return;
            onMoveNote(draggingNoteId, notebookId, note.children.length, note.id);
            setDraggingNoteId(null);
          }}
        >
          <div className="flex items-start gap-2">
            <input type="checkbox" checked={selectedNoteIds.includes(note.id)} onChange={() => onToggleNoteSelection(note.id)} className="mt-1" />
            <div className="mt-0.5 flex w-5 items-center justify-center app-text-muted">
              {hasChildren ? (
                <button onClick={() => setCollapsed((value) => ({ ...value, [collapsedKey]: !value[collapsedKey] }))} className="rounded p-0.5 app-hover-surface">
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : (
                <span className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {noteEditing ? (
                <div className="space-y-2 rounded-2xl app-surface p-3">
                  {editingNoteMode === 'rename' ? (
                    <input value={editingNoteTitle} onChange={(event) => setEditingNoteTitle(event.target.value)} className="app-input w-full rounded-2xl px-3 py-2 text-sm" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={() => noteIconInputRef.current?.click()} className="app-secondary-button rounded-2xl px-3 py-2 text-lg">{isDataIcon(editingNoteIcon) ? '图片' : editingNoteIcon}</button>
                      <input value={isDataIcon(editingNoteIcon) ? '' : editingNoteIcon} onChange={(event) => setEditingNoteIcon(event.target.value || defaultIconFor('note'))} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="输入 emoji 图标" />
                      <input ref={noteIconInputRef} type="file" accept="image/*" className="hidden" onChange={handleNoteIconPick} />
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingNoteId(null)} className="app-secondary-button rounded-2xl px-3 py-2 text-sm">取消</button>
                    <button onClick={() => { onUpdateNote(note.id, editingNoteMode === 'rename' ? { title: editingNoteTitle } : { icon: editingNoteIcon }); setEditingNoteId(null); }} className="app-primary-button rounded-2xl px-3 py-2 text-sm">保存</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => onSelectNote(note.id)} className="block w-full min-w-0 text-left">
                  <div className="flex items-center gap-2 truncate text-sm font-medium">
                    {renderIcon(note.icon, defaultIconFor('note'), 'h-5 w-5')}
                    <span className="truncate">{note.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] app-text-muted">
                    <span>{hasChildren ? `父页 · ${note.children.length} 个子页` : '笔记'}</span>
                    {note.path && <span className="truncate">{note.path}</span>}
                  </div>
                </button>
              )}
            </div>
            {!noteEditing && (
              <div className="flex items-center gap-1">
                <button onClick={() => onCreateChildNote(note.id)} className="app-chip-warning rounded-full px-2 py-1 text-xs font-medium opacity-0 transition group-hover:opacity-100">+</button>
                <div className="relative">
                  <button onClick={() => setActiveNoteMenuId(activeNoteMenuId === note.id ? null : note.id)} className="rounded-full p-1 app-text-muted opacity-0 transition app-hover-surface group-hover:opacity-100">
                    <MoreHorizontal size={16} />
                  </button>
                  {activeNoteMenuId === note.id && (
                    <div className="absolute right-0 top-8 z-20 w-40 rounded-2xl app-surface p-2 shadow-soft">
                      <button onClick={() => { onCreateChildNote(note.id); setActiveNoteMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm app-hover-surface">新建子页</button>
                      <button onClick={() => { startNoteEdit(note, 'rename'); setActiveNoteMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm app-hover-surface">改名</button>
                      <button onClick={() => { startNoteEdit(note, 'icon'); setActiveNoteMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm app-hover-surface">改图标</button>
                      <button onClick={() => { onDeleteNote(note.id); setActiveNoteMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm app-text-danger app-hover-surface">删除</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {hasChildren && !isCollapsed && (
          <div className="space-y-2">
            {note.children.map((child) => renderNoteNode(child, notebookId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="app-panel flex h-full flex-col gap-4 rounded-[22px] p-4 shadow-[0_12px_30px_rgba(28,25,23,0.06)] backdrop-blur">
      <div className="px-1">
        <div className="text-[11px] uppercase tracking-[0.28em] app-text-muted">Second Brain</div>
        <h1 className="mt-2 font-display text-2xl">第二大脑</h1>
      </div>

      <div className="app-surface-soft grid gap-1 rounded-[18px] p-1.5">
        <button onClick={() => onChangePage('home')} className={`rounded-[14px] px-3 py-2.5 text-sm font-medium ${activePage === 'home' ? 'app-surface shadow-sm' : 'app-text-secondary'}`}><span className="flex items-center justify-center gap-2"><Home size={15} /> 主页</span></button>
        <button onClick={() => onChangePage('notes')} className={`rounded-[14px] px-3 py-2.5 text-sm font-medium ${activePage === 'notes' ? 'app-surface shadow-sm' : 'app-text-secondary'}`}><span className="flex items-center justify-center gap-2"><BookCopy size={15} /> 笔记</span></button>
        <button onClick={() => onChangePage('timeline')} className={`rounded-[14px] px-3 py-2.5 text-sm font-medium ${activePage === 'timeline' ? 'app-surface shadow-sm' : 'app-text-secondary'}`}><span className="flex items-center justify-center gap-2"><CalendarRange size={15} /> 时间轴</span></button>
      </div>

      <div className="flex gap-2">
        {activePage === 'notes' && (
          <button className="app-primary-button flex flex-1 items-center justify-center gap-2 rounded-[16px] px-4 py-2.5 text-sm font-medium" onClick={onCreateNote}>
            <Plus size={16} /> 新建
          </button>
        )}
        <label className="app-secondary-button flex cursor-pointer items-center justify-center rounded-[16px] px-4 py-2.5">
          <UploadCloud size={16} />
          <input className="hidden" multiple type="file" accept=".txt,.md,.pdf" onChange={handleUpload} />
        </label>
        <button onClick={() => onChangePage('settings')} className={`flex items-center justify-center rounded-[16px] px-4 py-2.5 ${activePage === 'settings' ? 'app-primary-button' : 'app-secondary-button'}`}>
          <Settings size={16} />
        </button>
      </div>

      {activePage === 'notes' && (
        <>
          <div className="app-surface rounded-[18px] px-3 py-3">
            <div className="flex items-center gap-2 app-text-secondary">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="搜索标题、摘要或内容" />
              {query && (
                <button className="app-text-muted" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeTag && <button onClick={() => setActiveTag(null)} className="app-primary-button rounded-full px-3 py-1 text-xs font-medium">清除筛选</button>}
              {visibleTags.map((tag) => (
                <button key={tag} onClick={() => setActiveTag(tag === activeTag ? null : tag)} className={`rounded-full px-3 py-1 text-xs font-medium ${tag === activeTag ? 'app-chip-success' : 'app-surface-soft app-text-secondary'}`}>
                  {tag}
                </button>
              ))}
              {tagSet.length > 5 && <button onClick={() => setShowAllTags((value) => !value)} className="app-secondary-button rounded-full px-3 py-1 text-xs font-medium">{showAllTags ? '收起标签' : `更多标签 +${tagSet.length - 5}`}</button>}
            </div>
          </div>

          <section className="min-h-0 flex-1 overflow-hidden">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium app-text-secondary">
              <div className="flex items-center gap-2"><BookCopy size={16} /> 笔记本</div>
              <button onClick={() => setShowNotebookCreator(true)} className="app-primary-button rounded-full px-3 py-1 text-xs"><span className="flex items-center gap-1"><FolderPlus size={12} /> 新建本</span></button>
            </div>

            {selectedNoteIds.length > 0 && (
              <div className="mb-3 rounded-[20px] app-surface-soft p-3 text-sm">
                <div className="font-medium">已选中 {selectedNoteIds.length} 条笔记</div>
                <div className="mt-2 flex gap-2">
                  <select value={bulkTargetNotebookId} onChange={(event) => setBulkTargetNotebookId(event.target.value ? Number(event.target.value) : '')} className="app-select flex-1 rounded-2xl px-3 py-2 text-sm">
                    <option value="">选择目标笔记本</option>
                    {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}
                  </select>
                  <button onClick={() => bulkTargetNotebookId && onBulkMoveNotes(Number(bulkTargetNotebookId))} className="app-primary-button rounded-2xl px-3 py-2 text-sm">移动</button>
                  <button onClick={onBulkDeleteNotes} className="app-danger-soft-button rounded-2xl px-3 py-2 text-sm">删除</button>
                  <button onClick={onClearSelection} className="app-secondary-button rounded-2xl px-3 py-2 text-sm">清空</button>
                </div>
              </div>
            )}

            {showNotebookCreator && (
              <div className="mb-3 rounded-[20px] app-surface p-3 shadow-sm">
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] app-text-muted">新建笔记本</div>
                <input value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="输入笔记本名称" />
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => { setShowNotebookCreator(false); setNewNotebookName(''); }} className="app-secondary-button rounded-2xl px-3 py-2 text-sm">取消</button>
                  <button onClick={() => { if (!newNotebookName.trim()) return; onCreateNotebook(newNotebookName.trim()); setNewNotebookName(''); setShowNotebookCreator(false); }} className="app-primary-button rounded-2xl px-3 py-2 text-sm">创建</button>
                </div>
              </div>
            )}

            <div className="flex max-h-[470px] flex-col gap-2 overflow-y-auto pr-1">
              {filteredNotes.length === 0 && <div className="app-surface-muted rounded-2xl px-4 py-4 text-sm app-text-secondary">没有匹配的笔记，试试换个关键词或标签。</div>}
              {notebooks.map((notebook) => {
                const notebookNotes = noteTreesByNotebook.get(notebook.id) || [];
                const notebookCollapsed = collapsed[`notebook-${notebook.id}`];
                const notebookEditing = editingNotebookId === notebook.id;
                return (
                  <div
                    key={notebook.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggingNoteId === null) return;
                      onMoveNote(draggingNoteId, notebook.id, notebookNotes.length, null);
                      setDraggingNoteId(null);
                    }}
                    className="app-surface rounded-[18px] p-3"
                  >
                    {notebookEditing ? (
                      <div className="space-y-2 rounded-2xl app-surface-soft p-3">
                        {editingNotebookMode === 'rename' ? (
                          <input value={editingNotebookName} onChange={(event) => setEditingNotebookName(event.target.value)} className="app-input w-full rounded-2xl px-3 py-2 text-sm" />
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => notebookIconInputRef.current?.click()} className="app-secondary-button rounded-2xl px-3 py-2 text-lg">{isDataIcon(editingNotebookIcon) ? '图片' : editingNotebookIcon}</button>
                            <input value={isDataIcon(editingNotebookIcon) ? '' : editingNotebookIcon} onChange={(event) => setEditingNotebookIcon(event.target.value || defaultIconFor('notebook'))} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="输入 emoji 图标" />
                            <input ref={notebookIconInputRef} type="file" accept="image/*" className="hidden" onChange={handleNotebookIconPick} />
                          </div>
                        )}
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingNotebookId(null)} className="app-secondary-button rounded-2xl px-3 py-2 text-sm">取消</button>
                          <button onClick={() => { onUpdateNotebook(notebook.id, editingNotebookMode === 'rename' ? { name: editingNotebookName } : { icon: editingNotebookIcon }); setEditingNotebookId(null); }} className="app-primary-button rounded-2xl px-3 py-2 text-sm">保存</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <button onClick={() => setCollapsed((value) => ({ ...value, [`notebook-${notebook.id}`]: !value[`notebook-${notebook.id}`] }))} className="flex items-center gap-2 text-left text-sm font-medium">
                            {notebookCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                            {renderIcon(notebook.icon, defaultIconFor('notebook'))}
                            <span>{notebook.name}</span>
                            <span className="app-surface-soft rounded-full px-2 py-0.5 text-[11px] app-text-secondary">{countTreeNotes(notebookNotes)}</span>
                          </button>
                          <div className="flex items-center gap-1">
                            <button onClick={() => onCreateNoteInNotebook(notebook.id)} className="app-chip-warning rounded-full px-2 py-1 text-xs font-medium">+</button>
                            <div className="group relative">
                              <button onClick={() => setActiveNotebookMenuId(activeNotebookMenuId === notebook.id ? null : notebook.id)} className="rounded-full p-1 app-text-muted opacity-0 transition app-hover-surface group-hover:opacity-100">
                                <MoreHorizontal size={16} />
                              </button>
                              {activeNotebookMenuId === notebook.id && notebook.name !== '快速笔记' && (
                                <div className="absolute right-0 top-8 z-20 w-36 rounded-2xl app-surface p-2 shadow-soft">
                                  <button onClick={() => { startNotebookEdit(notebook, 'rename'); setActiveNotebookMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm app-hover-surface">改名</button>
                                  <button onClick={() => { startNotebookEdit(notebook, 'icon'); setActiveNotebookMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm app-hover-surface">改图标</button>
                                  <button onClick={() => { onDeleteNotebook(notebook.id); setActiveNotebookMenuId(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm app-text-danger app-hover-surface">删除</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {!notebookCollapsed && (
                          <div className="mt-3 space-y-2">
                            {notebookNotes.length === 0 ? (
                              <div className="app-surface-soft rounded-2xl px-3 py-3 text-sm app-text-muted">这个笔记本里还没有笔记。</div>
                            ) : (
                              notebookNotes.map((note) => renderNoteNode(note, notebook.id))
                            )}
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
            <button onClick={() => setShowTrash((value) => !value)} className="mb-3 flex w-full items-center justify-between text-sm font-medium app-text-secondary">
              <span className="flex items-center gap-2"><Trash2 size={16} /> 垃圾桶</span>
              {showTrash ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {showTrash && (
              <div className="app-surface-muted max-h-[220px] space-y-2 overflow-y-auto rounded-2xl p-3">
                {trash.notebooks.map((notebook) => (
                  <div key={`notebook-${notebook.id}`} className="app-surface-soft rounded-2xl px-3 py-3 text-sm">
                    <div className="font-medium">{notebook.name}</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => onRestoreNotebook(notebook.id)} className="app-chip-success rounded-full px-2 py-1 text-xs">恢复</button>
                      <button onClick={() => onPurgeNotebook(notebook.id)} className="app-danger-soft-button rounded-full px-2 py-1 text-xs">永久删除</button>
                    </div>
                  </div>
                ))}
                {trash.notes.map((note) => (
                  <div key={`note-${note.id}`} className="app-surface-soft rounded-2xl px-3 py-3 text-sm">
                    <div className="font-medium">{note.title}</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => onRestoreNote(note.id)} className="app-chip-success rounded-full px-2 py-1 text-xs">恢复</button>
                      <button onClick={() => onPurgeNote(note.id)} className="app-danger-soft-button rounded-full px-2 py-1 text-xs">永久删除</button>
                    </div>
                  </div>
                ))}
                {trash.notes.length === 0 && trash.notebooks.length === 0 && <div className="text-sm app-text-muted">垃圾桶为空。</div>}
              </div>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
