import { BookMarked, BookOpenText, Clock3, GitBranchPlus, PencilLine, Save, ChevronRight, Tag, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import React, { useState, useEffect } from 'react';

type Breadcrumb = {
  id: number;
  title: string;
  icon: string;
};

type EditorHeaderProps = {
  icon: string;
  title: string;
  isTitleManuallyEdited: boolean;
  breadcrumbs?: Breadcrumb[];
  onSelectBreadcrumb?: (id: number) => void;
  savePhase: 'idle' | 'queued' | 'saving';
  isDirty: boolean;
  lastSavedAt: string | null;
  showRelations: boolean;
  showOutline: boolean;
  viewMode: 'edit' | 'preview';
  onSave: () => void;
  onUpdateTitle: (newTitle: string, isManual: boolean) => void;
  onToggleRelations: () => void;
  onOutlineEnter: () => void;
  onOutlineLeave: () => void;
  onSetViewMode: (mode: 'edit' | 'preview') => void;
};

export function EditorHeader(props: EditorHeaderProps) {
  const { 
    icon, title, isTitleManuallyEdited, breadcrumbs, onSelectBreadcrumb, 
    savePhase, isDirty, lastSavedAt, showRelations, showOutline, 
    viewMode, onSave, onUpdateTitle, onToggleRelations, onOutlineEnter, onOutlineLeave, onSetViewMode 
  } = props;

  const [tempTitle, setTempTitle] = useState(title);
  const [isFocused, setIsFocused] = useState(false);

  // 当外部标题变化且用户不在编辑时，同步本地标题
  useEffect(() => {
    if (!isFocused) {
      setTempTitle(title);
    }
  }, [title, isFocused]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setTempTitle(newVal);
    onUpdateTitle(newVal, true);
  };

  const handleTitleBlur = () => {
    setIsFocused(false);
    if (tempTitle !== title) {
      onUpdateTitle(tempTitle, true);
    }
  };

  return (
    <div className="flex flex-col border-b border-stone-100 bg-white px-8 lg:px-16 xl:px-32 py-1">
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2 overflow-hidden">
          {breadcrumbs && breadcrumbs.length > 1 && (
            <div className="flex items-center gap-1 overflow-hidden">
              {breadcrumbs.slice(0, -1).map((bc, idx) => (
                <div key={bc.id} className="flex items-center gap-1">
                  <button onClick={() => onSelectBreadcrumb?.(bc.id)} className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-stone-400 hover:bg-stone-50 hover:text-stone-600 transition truncate max-w-[100px]">
                    <span>{bc.icon}</span>
                    <span className="truncate">{bc.title}</span>
                  </button>
                  <ChevronRight size={10} className="text-stone-300 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
          <div 
            className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-stone-400 cursor-default group/sync"
            title={lastSavedAt ? `Synced at ${lastSavedAt}` : undefined}
          >
            <Clock3 size={10} />
            <span className="transition-all duration-200">
              {savePhase === 'saving' ? 'Saving...' : 
               savePhase === 'queued' ? 'Queued' : 
               isDirty ? 'Unsaved' : 
               'Synced'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onSave} className="p-1 hover:bg-stone-100 rounded-lg text-stone-500 transition-colors"><Save size={13} /></button>
          <button onClick={onToggleRelations} className={`p-1 rounded-lg transition-colors ${showRelations ? 'bg-stone-100 text-stone-900' : 'hover:bg-stone-100 text-stone-500'}`}><GitBranchPlus size={13} /></button>
          <button onMouseEnter={onOutlineEnter} onMouseLeave={onOutlineLeave} className={`p-1 rounded-lg transition-colors ${showOutline ? 'bg-stone-100 text-stone-900' : 'hover:bg-stone-100 text-stone-500'}`}><BookMarked size={13} /></button>
          <div className="w-[1px] h-3 bg-stone-200 mx-1" />
          <div className="flex items-center bg-stone-100 rounded-lg p-0.5">
            <button onClick={() => onSetViewMode('edit')} className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors ${viewMode === 'edit' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Edit</button>
            <button onClick={() => onSetViewMode('preview')} className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors ${viewMode === 'preview' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>Preview</button>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="group relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer text-xl">
          {icon}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <input
            className="text-lg font-bold tracking-tight text-stone-900 outline-none truncate leading-tight bg-transparent hover:bg-stone-50 focus:bg-white rounded transition-colors px-1 -ml-1 w-full"
            value={tempTitle}
            onChange={handleTitleChange}
            onFocus={() => {
              setIsFocused(true);
              onUpdateTitle(tempTitle, true);
            }}
            onBlur={handleTitleBlur}
            placeholder="未命名笔记"
          />
          
          {/* Compact Collapsible Tags removed as they are now in PropertyPanel */}
        </div>
      </div>
    </div>
  );
}
