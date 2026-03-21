import React, { useState, useMemo } from 'react';
import { Note, NoteProperty } from '../lib/types';
import { 
  Table as TableIcon, 
  Kanban as KanbanIcon, 
  ChevronDown, 
  ChevronUp, 
  Search,
  Plus
} from 'lucide-react';

interface DatabaseViewProps {
  notes: Note[];
  onSelectNote: (noteId: number) => void;
  onUpdateNoteProperty: (noteId: number, propertyId: number, value: string) => void;
  onCreateNote: () => void;
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
    return notes.filter(note => 
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.properties.some(p => p.value.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [notes, searchQuery]);

  const sortedNotes = useMemo(() => {
    if (!sortConfig) return filteredNotes;
    return [...filteredNotes].sort((a, b) => {
      let aValue: any = a.title;
      let bValue: any = b.title;

      if (sortConfig.key !== 'title') {
        const aProp = a.properties.find(p => p.name === sortConfig.key);
        const bProp = b.properties.find(p => p.name === sortConfig.key);
        aValue = aProp ? aProp.value : '';
        bValue = bProp ? bProp.value : '';
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
    <div className="flex flex-col h-full bg-white">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setView('table')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${view === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <TableIcon size={14} />
              表格
            </button>
            <button 
              onClick={() => setView('kanban')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${view === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <KanbanIcon size={14} />
              看板
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input 
              type="text"
              placeholder="搜索数据库..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-gray-50 border-none rounded-lg text-sm focus:ring-1 focus:ring-gray-200 w-64"
            />
          </div>
        </div>
        <button 
          onClick={onCreateNote}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm"
        >
          <Plus size={16} />
          新建笔记
        </button>
      </div>

      {/* 视图内容 */}
      <div className="flex-1 overflow-auto p-8">
        {view === 'table' ? (
          <div className="inline-block min-w-full align-middle">
            <table className="min-w-full divide-y divide-gray-200 border-separate border-spacing-0 border rounded-xl overflow-hidden shadow-sm">
              <thead className="bg-gray-50/50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center gap-2">
                      名称
                      {sortConfig?.key === 'title' && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                    </div>
                  </th>
                  {allPropertyNames.map(name => (
                    <th 
                      key={name}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort(name)}
                    >
                      <div className="flex items-center gap-2">
                        {name}
                        {sortConfig?.key === name && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {sortedNotes.map((note) => (
                  <tr key={note.id} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <button onClick={() => onSelectNote(note.id)} className="flex items-center gap-2 hover:text-stone-600">
                        <span>{note.icon}</span>
                        <span>{note.title}</span>
                      </button>
                    </td>
                    {allPropertyNames.map(name => {
                      const prop = note.properties.find(p => p.name === name);
                      return (
                        <td key={name} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {prop ? (
                            <input 
                              type="text"
                              value={prop.value}
                              onChange={(e) => onUpdateNoteProperty(note.id, prop.id, e.target.value)}
                              className="bg-transparent border-none focus:ring-0 p-0 w-full"
                            />
                          ) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex gap-6 h-full overflow-x-auto pb-4">
            {Object.entries(kanbanGroups).map(([status, notes]) => (
              <div key={status} className="flex-shrink-0 w-72 flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      status === '已完成' ? 'bg-green-100 text-green-700' :
                      status === '进行中' ? 'bg-blue-100 text-blue-700' :
                      status === '未开始' ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {status}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">{notes.length}</span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2">
                  {notes.map(note => (
                    <div 
                      key={note.id}
                      onClick={() => onSelectNote(note.id)}
                      className="p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md hover:border-gray-200 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{note.icon}</span>
                        <h4 className="text-sm font-medium text-gray-900 truncate">{note.title}</h4>
                      </div>
                      <div className="space-y-1.5">
                        {note.properties.filter(p => p.name.toLowerCase() !== 'status' && p.name !== '状态').slice(0, 3).map(p => (
                          <div key={p.id} className="flex items-center gap-2 text-[11px]">
                            <span className="text-gray-400">{p.name}:</span>
                            <span className="text-gray-600 truncate">{p.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={onCreateNote}
                    className="flex items-center gap-2 w-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg text-sm transition-colors"
                  >
                    <Plus size={14} />
                    <span>新建</span>
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
