import { BookCopy, ChevronDown, ChevronRight, FolderPlus, Home, Layout, MoreHorizontal, Plus, Search, Settings, Trash2, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { defaultIconFor, isDataIcon, validateExistingDataIcon, validateIconFile } from '../lib/iconUtils';
import type { Note, Notebook, Task, TrashState } from '../lib/types';

type SidebarProps = {
  activePage: 'home' | 'notes' | 'settings' | 'database';
  onChangePage: (page: 'home' | 'notes' | 'settings' | 'database') => void;
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
  onUpdateNote: (noteId: number, payload: { title?: string; icon?: string; tags?: string[] }) => void;
  onUpdateNotebook: (notebookId: number, payload: { name?: string; icon?: string }) => void;
  onDeleteNotebook: (notebookId: number) => void;
  onRestoreNotebook: (notebookId: number) => void;
  onPurgeNotebook: (notebookId: number) => void;
  onCreateNoteInNotebook: (notebookId: number, parentId?: number | null) => void;
  onMoveNote: (noteId: number, notebookId: number, position: number, parentId?: number | null) => void;
  onBulkMoveNotes: (notebookId: number, parentId?: number | null) => void;
  onBulkDeleteNotes: () => void;
  onDeleteNote: (noteId: number) => void;
  onRestoreNote: (noteId: number) => void;
  onPurgeNote: (noteId: number) => void;
  onPurgeTrash: () => void;
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
  onPurgeTrash,
  onUpload,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [showNotebookCreator, setShowNotebookCreator] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [collapsedNotes, setCollapsedNotes] = useState<Record<number, boolean>>({});
  const [showTrash, setShowTrash] = useState(false);
  const [bulkTargetNotebookId, setBulkTargetNotebookId] = useState<number | ''>('');
  const [draggingNoteId, setDraggingNoteId] = useState<number | null>(null);
  const [activeNotebookMenuId, setActiveNotebookMenuId] = useState<number | null>(null);
  const [activeNoteMenuId, setActiveNoteMenuId] = useState<number | null>(null);
  const [dragOverNoteId, setDragOverNoteId] = useState<number | null>(null);

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

  const notesByParent = useMemo(() => {
    const grouped = new Map<number | null, Note[]>();
    filteredNotes.forEach((note) => {
      const parentId = note.parent_id || null;
      grouped.set(parentId, [...(grouped.get(parentId) || []), note]);
    });
    grouped.forEach((value) => value.sort((a, b) => a.position - b.position));
    return grouped;
  }, [filteredNotes]);

  const rootNotesByNotebook = useMemo(() => {
    const grouped = new Map<number, Note[]>();
    notebooks.forEach((notebook) => grouped.set(notebook.id, []));
    
    const rootNotes = notesByParent.get(null) || [];
    rootNotes.forEach((note) => {
      const notebookId = note.notebook_id ?? notebooks[0]?.id;
      if (!notebookId) return;
      grouped.set(notebookId, [...(grouped.get(notebookId) || []), note]);
    });
    return grouped;
  }, [notesByParent, notebooks]);

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

  const renderNoteTree = (note: Note, index: number, notebookId: number, level = 0) => {
    const children = notesByParent.get(note.id) || [];
    const isCollapsed = collapsedNotes[note.id];
    const noteEditing = editingNoteId === note.id;
    const isSelected = selectedNoteId === note.id;
    const isDragOver = dragOverNoteId === note.id;

    return (
      <div key={note.id} className="flex flex-col">
        <div
          className={`
            relative group flex items-center gap-1.5 px-2 py-1 rounded-md transition-all cursor-pointer
            ${isSelected ? 'bg-reflect-border/60 text-reflect-text font-medium' : 'text-reflect-muted hover:bg-reflect-border/30 hover:text-reflect-text'}
            ${isDragOver ? 'ring-1 ring-reflect-accent/50' : ''}
          `}
          style={{ paddingLeft: `${(level + 1) * 10 + 6}px` }}
          draggable
          onDragStart={() => setDraggingNoteId(note.id)}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOverNoteId(note.id);
          }}
          onDragLeave={() => setDragOverNoteId(null)}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOverNoteId(null);
            if (draggingNoteId === null || draggingNoteId === note.id) return;
            onMoveNote(draggingNoteId, notebookId, children.length, note.id);
            setDraggingNoteId(null);
          }}
          onClick={() => onSelectNote(note.id)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {children.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setCollapsedNotes((prev) => ({ ...prev, [note.id]: !prev[note.id] })) }}
                className="p-0.5 hover:bg-reflect-border/50 rounded transition opacity-60 hover:opacity-100"
              >
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
            
            <div className="flex-1 truncate">
              {noteEditing ? (
                <input 
                  autoFocus 
                  value={editingNoteTitle} 
                  onClick={(e) => e.stopPropagation()}
                  onChange={(event) => setEditingNoteTitle(event.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && (onUpdateNote(note.id, { title: editingNoteTitle }), setEditingNoteId(null))} 
                  className="w-full bg-white border border-reflect-border px-2 py-0.5 text-xs rounded outline-none" 
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-shrink-0 text-xs opacity-70">{renderIcon(note.icon, defaultIconFor('note'))}</span>
                  <span className="truncate text-xs leading-relaxed">{note.title}</span>
                </div>
              )}
            </div>
          </div>

          {!noteEditing && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={(e) => { e.stopPropagation(); onCreateNoteInNotebook(notebookId, note.id); }} 
                className="p-1 hover:bg-reflect-border/50 rounded text-reflect-muted hover:text-reflect-text"
              >
                <Plus size={12} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setActiveNoteMenuId(activeNoteMenuId === note.id ? null : note.id); }} 
                className="p-1 hover:bg-reflect-border/50 rounded text-reflect-muted hover:text-reflect-text"
              >
                <MoreHorizontal size={12} />
              </button>
            </div>
          )}

          {activeNoteMenuId === note.id && (
            <div className="absolute right-0 top-full mt-1 z-30 w-32 rounded-lg border border-reflect-border bg-white p-1 shadow-soft-lg">
              <button onClick={() => { startNoteEdit(note, 'rename'); setActiveNoteMenuId(null); }} className="block w-full rounded px-2 py-1 text-left text-[11px] hover:bg-reflect-bg">重命名</button>
              <button onClick={() => { startNoteEdit(note, 'icon'); setActiveNoteMenuId(null); }} className="block w-full rounded px-2 py-1 text-left text-[11px] hover:bg-reflect-bg">图标</button>
              <div className="h-px bg-reflect-border my-1" />
              <button onClick={() => { onDeleteNote(note.id); setActiveNoteMenuId(null); }} className="block w-full rounded px-2 py-1 text-left text-[11px] text-rose-600 hover:bg-rose-50">删除</button>
            </div>
          )}
        </div>
        {!isCollapsed && children.length > 0 && (
          <div className="flex flex-col">
            {children.map((child, idx) => renderNoteTree(child, idx, notebookId, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="flex h-full flex-col gap-5 py-6 px-3 font-sans antialiased text-reflect-text">
      {/* Brand Header */}
      <div className="px-2 mb-1">
        <div className="text-[9px] uppercase tracking-[0.4em] text-reflect-muted font-bold opacity-40">Second Brain</div>
        <h1 className="mt-0.5 font-serif text-xl text-reflect-text italic font-medium">Reflect</h1>
      </div>

      {/* Primary Navigation */}
      <nav className="space-y-0.5">
        {[
          { id: 'home', label: '控制面板', icon: Home },
          { id: 'notes', label: '所有笔记', icon: BookCopy },
          { id: 'database', label: '收藏', icon: Layout },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => onChangePage(item.id as any)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] font-medium rounded-lg transition-all ${
              activePage === item.id 
              ? 'bg-reflect-border/50 text-reflect-text shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]' 
              : 'text-reflect-muted hover:bg-reflect-border/20 hover:text-reflect-text'
            }`}
          >
            <item.icon size={15} className={activePage === item.id ? 'text-reflect-text' : 'opacity-50'} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Tags Section - More Compact Tag Cloud */}
      {tagSet.length > 0 && (
        <div className="px-2 space-y-1.5">
          <div className="flex items-center justify-between group/tags">
            <h2 className="text-[9px] font-bold uppercase tracking-widest text-reflect-muted opacity-40">标签</h2>
            <button 
              onClick={() => setShowAllTags(!showAllTags)}
              className="p-0.5 hover:bg-reflect-border/50 rounded transition-colors text-reflect-muted opacity-0 group-hover/tags:opacity-100"
            >
              {showAllTags ? <ChevronDown size={10} className="rotate-180" /> : <ChevronDown size={10} />}
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {visibleTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  activeTag === tag 
                  ? 'bg-reflect-text text-white' 
                  : 'bg-reflect-border/20 text-reflect-muted hover:bg-reflect-border/40 hover:text-reflect-text'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-reflect-border/30 mx-2" />

      {activePage === 'notes' && (
        <section className="flex-1 flex flex-col min-h-0 gap-3">
          {/* Action Header */}
          <div className="flex items-center justify-between px-2">
            <h2 className="text-[9px] font-bold uppercase tracking-widest text-reflect-muted opacity-40">笔记本</h2>
            <button 
              onClick={() => setShowNotebookCreator(true)}
              className="p-1 hover:bg-reflect-border/50 rounded-md transition-colors text-reflect-muted hover:text-reflect-text"
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Search Bar - Extremely Minimal */}
          <div className="px-2">
            <div className="flex items-center gap-2 bg-reflect-border/20 px-2 py-1.5 rounded-md focus-within:bg-reflect-border/30 transition-all">
              <Search size={13} className="text-reflect-muted opacity-50" />
              <input 
                value={query} 
                onChange={(event) => setQuery(event.target.value)} 
                className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-reflect-muted/40" 
                placeholder="搜索..." 
              />
              {query && <X size={11} className="cursor-pointer text-reflect-muted hover:text-reflect-text" onClick={() => setQuery('')} />}
            </div>
          </div>

          {/* Notebooks List */}
          <div className="flex-1 overflow-y-auto min-h-0 pr-1 custom-scrollbar">
            {showNotebookCreator && (
              <div className="mx-2 mb-2 p-2 bg-white rounded-lg border border-reflect-border shadow-sm">
                <input 
                  autoFocus
                  value={newNotebookName} 
                  onChange={(e) => setNewNotebookName(e.target.value)} 
                  placeholder="笔记本名称..."
                  className="w-full text-[11px] bg-transparent border-none outline-none mb-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newNotebookName.trim()) {
                      onCreateNotebook(newNotebookName.trim());
                      setNewNotebookName('');
                      setShowNotebookCreator(false);
                    }
                    if (e.key === 'Escape') {
                      setShowNotebookCreator(false);
                    }
                  }}
                />
                <div className="flex justify-end gap-1">
                  <button onClick={() => setShowNotebookCreator(false)} className="text-[10px] px-2 py-1 text-reflect-muted hover:text-reflect-text">取消</button>
                  <button 
                    onClick={() => { 
                      if (newNotebookName.trim()) {
                        onCreateNotebook(newNotebookName.trim());
                        setNewNotebookName('');
                        setShowNotebookCreator(false);
                      }
                    }}
                    className="text-[10px] bg-reflect-text text-white px-2 py-1 rounded"
                  >
                    创建
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-0.5">
            {notebooks.map((notebook) => {
              const notebookNotes = rootNotesByNotebook.get(notebook.id) || [];
              const isCollapsed = collapsed[notebook.id];
              const notebookEditing = editingNotebookId === notebook.id;
              
              return (
                <div key={notebook.id} className="group flex flex-col">
                  {notebookEditing ? (
                    <div className="px-2 py-2 bg-white rounded-lg border border-reflect-border shadow-sm m-1">
                      <input 
                        autoFocus
                        value={editingNotebookName} 
                        onChange={(event) => setEditingNotebookName(event.target.value)} 
                        className="w-full text-xs bg-transparent border-none outline-none mb-2"
                      />
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditingNotebookId(null)} className="text-[10px] px-2 py-1 text-reflect-muted hover:text-reflect-text">取消</button>
                        <button 
                          onClick={() => { onUpdateNotebook(notebook.id, { name: editingNotebookName }); setEditingNotebookId(null); }}
                          className="text-[10px] bg-reflect-text text-white px-2 py-1 rounded"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className={`
                        relative group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors
                        ${!isCollapsed && notebookNotes.length > 0 ? 'text-reflect-text font-medium' : 'text-reflect-muted hover:bg-reflect-border/20 hover:text-reflect-text'}
                      `}
                      onClick={() => setCollapsed(prev => ({ ...prev, [notebook.id]: !prev[notebook.id] }))}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-3.5 flex items-center justify-center opacity-60">
                          {notebookNotes.length > 0 ? (isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />) : <div className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-[11px] truncate uppercase tracking-wider">{notebook.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                          onClick={(e) => { e.stopPropagation(); onCreateNoteInNotebook(notebook.id, null); }}
                          className="p-1 hover:bg-reflect-border/50 rounded"
                        >
                          <Plus size={12} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveNotebookMenuId(activeNotebookMenuId === notebook.id ? null : notebook.id); }}
                          className="p-1 hover:bg-reflect-border/50 rounded"
                        >
                          <MoreHorizontal size={12} />
                        </button>
                      </div>
                      {activeNotebookMenuId === notebook.id && (
                        <div className="absolute right-0 top-full mt-1 z-30 w-32 rounded-lg border border-reflect-border bg-white p-1 shadow-soft-lg">
                          <button onClick={() => { startNotebookEdit(notebook, 'rename'); setActiveNotebookMenuId(null); }} className="block w-full rounded px-2 py-1 text-left text-[11px] hover:bg-reflect-bg">重命名</button>
                          <button onClick={() => { onDeleteNotebook(notebook.id); setActiveNotebookMenuId(null); }} className="block w-full rounded px-2 py-1 text-left text-[11px] text-rose-600 hover:bg-rose-50">删除</button>
                        </div>
                      )}
                    </div>
                  )}
                  {!isCollapsed && (
                    <div className="flex flex-col">
                      {notebookNotes.map((note, idx) => renderNoteTree(note, idx, notebook.id, 0))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* Footer Actions */}
      <div className="mt-auto pt-2 space-y-0.5">
        <div className="h-px bg-reflect-border/30 mx-2 mb-2" />
        
        <button 
          onClick={() => onChangePage('settings')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
            activePage === 'settings' 
            ? 'bg-reflect-border/50 text-reflect-text' 
            : 'text-reflect-muted hover:bg-reflect-border/30 hover:text-reflect-text'
          }`}
        >
          <Settings size={15} className="opacity-50" />
          设置
        </button>

        <button 
          onClick={() => setShowTrash(!showTrash)}
          className="w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 text-[13px] font-medium text-reflect-muted hover:bg-reflect-border/30 hover:text-reflect-text rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Trash2 size={15} className="opacity-50" />
            回收站
          </div>
          {showTrash ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {showTrash && (
          <div className="mx-2 mt-2 p-2 bg-reflect-sidebar/50 rounded-lg border border-reflect-border/50 text-[11px] space-y-2">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">笔记</span>
              {trash.notes.length > 0 && (
                <button onClick={() => onPurgeTrash()} className="text-rose-600 hover:opacity-70 transition-opacity font-bold">清空全部</button>
              )}
            </div>
            {trash.notes.length === 0 && trash.notebooks.length === 0 && (
              <div className="text-reflect-muted opacity-50 text-center py-2">空</div>
            )}
            {trash.notes.map(note => (
              <div key={note.id} className="flex items-center justify-between group px-1">
                <span className="truncate opacity-70 flex-1 mr-2">{note.title}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => onRestoreNote(note.id)} className="text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity hover:underline">恢复</button>
                  <button onClick={() => onPurgeNote(note.id)} className="text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity hover:underline">彻底删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
