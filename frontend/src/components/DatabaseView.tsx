import React, { useState, useMemo } from 'react';
import { Note, NoteProperty } from '../lib/types';
import {
  Table as TableIcon,
  Kanban as KanbanIcon,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  Lock
} from 'lucide-react';

interface DatabaseViewProps {
  notes: Note[];
  onSelectNote: (noteId: number) => void;
  onUpdateNoteProperty: (noteId: number, propertyId: number, value: string) => void;
  onCreateNote: () => void;
}

const PRIVATE_TAGS = new Set(['私密', 'private']);

function isPrivateNote(note: Note) {
  return note.tags.some((tag) => PRIVATE_TAGS.has(tag.toLowerCase()));
}

function getDisplayTitle(note: Note) {
  return isPrivateNote(note) ? '私密笔记' : note.title;
}

function getDisplayIcon(note: Note) {
  return isPrivateNote(note) ? null : note.icon;
}

function getDisplayPropertyValue(note: Note, value: string) {
  return isPrivateNote(note) ? '内容已锁定' : value;
}

export const DatabaseView: React.FC<DatabaseViewProps> = ({
  notes,
  onSelectNote,
  onUpdateNoteProperty,
  onCreateNote
}) => {
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      const titleText = getDisplayTitle(note).toLowerCase();
      const propertyText = isPrivateNote(note)
        ? '内容已锁定'
        : note.properties.map((p) => p.value).join(' ').toLowerCase();
      return titleText.includes(searchQuery.toLowerCase()) || propertyText.includes(searchQuery.toLowerCase());
    });
  }, [notes, searchQuery]);

  const sortedNotes = useMemo(() => {
    if (!sortConfig) return filteredNotes;
    return [...filteredNotes].sort((a, b) => {
      let aValue: any = getDisplayTitle(a);
      let bValue: any = getDisplayTitle(b);

      if (sortConfig.key !== 'title') {
        const aProp = a.properties.find(p => p.name === sortConfig.key);
        const bProp = b.properties.find(p => p.name === sortConfig.key);
        aValue = getDisplayPropertyValue(a, aProp ? aProp.value : '');
        bValue = getDisplayPropertyValue(b, bProp ? bProp.value : '');
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredNotes, sortConfig]);

  const allPropertyNames = useMemo(() => {
    const names = new Set<string>();
    notes.forEach(note => {
      note.properties.forEach(prop => names.add(prop.name));
    });
    return Array.from(names);
  }, [notes]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  // 看板视图的分组（基于名为 'Status' 的属性）
  const kanbanGroups = useMemo(() => {
    const groups: Record<string, Note[]> = {
      '未开始': [],
      '进行中': [],
      '已完成': [],
      '其他': []
    };

    sortedNotes.forEach(note => {
      const statusProp = note.properties.find(p => p.name.toLowerCase() === 'status' || p.name === '状态');
      const status = statusProp ? statusProp.value : '未开始';
      if (groups[status]) {
        groups[status].push(note);
      } else {
        groups['其他'].push(note);
      }
    });

    return groups;
  }, [sortedNotes]);

  return (
    <div className="flex flex-col h-full bg-reflect-bg antialiased">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-10 py-6 border-b border-reflect-border/20">
        <div className="flex items-center gap-6">
          <div className="flex bg-reflect-sidebar/40 p-0.5 rounded-lg border border-reflect-border/30">
            <button 
              onClick={() => setView('table')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'table' ? 'bg-white shadow-soft text-reflect-text' : 'text-reflect-muted hover:text-reflect-text'}`}
            >
              <TableIcon size={12} />
              List
            </button>
            <button 
              onClick={() => setView('kanban')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${view === 'kanban' ? 'bg-white shadow-soft text-reflect-text' : 'text-reflect-muted hover:text-reflect-text'}`}
            >
              <KanbanIcon size={12} />
              Board
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-reflect-muted/30 group-focus-within:text-reflect-accent transition-colors" size={13} />
            <input 
              type="text"
              placeholder="Search database..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-reflect-sidebar/20 border-none rounded-xl text-xs text-reflect-text focus:ring-1 focus:ring-reflect-border/40 w-72 placeholder:text-reflect-muted/30 transition-all"
            />
          </div>
        </div>
        <button 
          onClick={onCreateNote}
          className="flex items-center gap-2 px-5 py-2.5 bg-reflect-accent text-white rounded-xl text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all shadow-soft"
        >
          <Plus size={14} strokeWidth={3} />
          New Entry
        </button>
      </div>

      {/* 视图内容 */}
      <div className="flex-1 overflow-auto p-10">
        {view === 'table' ? (
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th 
                    className="px-6 py-4 text-left text-[9px] font-bold text-reflect-muted/40 uppercase tracking-[0.2em] cursor-pointer hover:text-reflect-muted"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center gap-2">
                      Title
                      {sortConfig?.key === 'title' && (sortConfig.direction === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                    </div>
                  </th>
                  {allPropertyNames.map(name => (
                    <th 
                      key={name}
                      className="px-6 py-4 text-left text-[9px] font-bold text-reflect-muted/40 uppercase tracking-[0.2em] cursor-pointer hover:text-reflect-muted"
                      onClick={() => handleSort(name)}
                    >
                      <div className="flex items-center gap-2">
                        {name}
                        {sortConfig?.key === name && (sortConfig.direction === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="space-y-4">
                {sortedNotes.map((note) => (
                  <tr key={note.id} className="group hover:bg-white/40 transition-all">
                    <td className="px-6 py-4 whitespace-nowrap bg-white/40 group-hover:bg-white border-y border-l border-reflect-border/20 rounded-l-2xl shadow-sm transition-all">
                      <button onClick={() => onSelectNote(note.id)} className="flex items-center gap-3">
                        <span className="text-xl grayscale group-hover:grayscale-0 transition-all">{isPrivateNote(note) ? <Lock size={16} /> : getDisplayIcon(note)}</span>
                        <span className="font-serif text-base italic font-medium text-reflect-text">{getDisplayTitle(note)}</span>
                      </button>
                    </td>
                    {allPropertyNames.map((name, idx) => {
                      const prop = note.properties.find(p => p.name === name);
                      const isLast = idx === allPropertyNames.length - 1;
                      return (
                        <td key={name} className={`px-6 py-4 whitespace-nowrap bg-white/40 group-hover:bg-white border-y border-reflect-border/20 shadow-sm transition-all ${isLast ? 'border-r rounded-r-2xl' : ''}`}>
                          {prop ? (
                            <input 
                              type="text"
                              value={getDisplayPropertyValue(note, prop.value)}
                              onChange={(e) => !isPrivateNote(note) && onUpdateNoteProperty(note.id, prop.id, e.target.value)}
                              readOnly={isPrivateNote(note)}
                              className="bg-transparent border-none focus:ring-0 p-0 w-full text-xs font-medium text-reflect-text/70"
                            />
                          ) : <span className="text-reflect-muted/20">-</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex gap-8 h-full overflow-x-auto pb-6">
            {Object.entries(kanbanGroups).map(([status, notes]) => (
              <div key={status} className="flex-shrink-0 w-80 flex flex-col gap-6">
                <div className="flex items-center justify-between px-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-reflect-muted">
                      {status}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-reflect-sidebar/50 text-reflect-muted rounded-full font-bold">{notes.length}</span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-3 scrollbar-hide">
                  {notes.map(note => (
                    <div 
                      key={note.id}
                      onClick={() => onSelectNote(note.id)}
                      className="p-5 bg-white border border-reflect-border/30 rounded-2xl shadow-soft hover:shadow-hover hover:-translate-y-0.5 cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-xl grayscale group-hover:grayscale-0 transition-all">{isPrivateNote(note) ? <Lock size={16} /> : getDisplayIcon(note)}</span>
                        <h4 className="font-serif text-base italic font-medium text-reflect-text truncate">{getDisplayTitle(note)}</h4>
                      </div>
                      <div className="space-y-2">
                        {note.properties.filter(p => p.name.toLowerCase() !== 'status' && p.name !== '状态').slice(0, 3).map(p => (
                          <div key={p.id} className="flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-reflect-muted/40 shrink-0">{p.name}:</span>
                            <span className="text-[11px] font-medium text-reflect-text/60 truncate">{getDisplayPropertyValue(note, p.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={onCreateNote}
                    className="flex items-center gap-2 w-full p-4 text-[10px] font-bold uppercase tracking-widest text-reflect-muted/40 hover:text-reflect-accent hover:bg-white/40 border border-dashed border-reflect-border/50 rounded-2xl transition-all"
                  >
                    <Plus size={12} />
                    <span>Create new</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
