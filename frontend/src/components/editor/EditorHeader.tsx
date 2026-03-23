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
    <div className="flex flex-col bg-transparent px-0 pt-6 pb-2 antialiased">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div 
            className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-reflect-muted opacity-40 cursor-default"
            title={lastSavedAt ? `同步于 ${lastSavedAt}` : undefined}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${savePhase === 'saving' ? 'bg-amber-400 animate-pulse' : isDirty ? 'bg-rose-400' : 'bg-emerald-400 opacity-50'}`} />
            <span>
              {savePhase === 'saving' ? '正在保存' : 
               savePhase === 'queued' ? '已加入队列' : 
               isDirty ? '未保存' : 
               '已同步'}
            </span>
          </div>
          
          {breadcrumbs && breadcrumbs.length > 1 && (
            <div className="flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity">
              {breadcrumbs.slice(0, -1).map((bc, idx) => (
                <div key={bc.id} className="flex items-center gap-1">
                  <button onClick={() => onSelectBreadcrumb?.(bc.id)} className="text-[9px] font-bold uppercase tracking-widest text-reflect-muted hover:text-reflect-accent transition truncate max-w-[80px]">
                    {bc.title}
                  </button>
                  <ChevronRight size={10} className="text-reflect-muted/30" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
           <div className="flex items-center bg-reflect-sidebar/40 rounded-lg p-0.5 border border-reflect-border/30">
            <button 
              onClick={() => onSetViewMode('edit')} 
              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'edit' ? 'bg-white text-reflect-text shadow-soft' : 'text-reflect-muted hover:text-reflect-text'}`}
            >
              编辑
            </button>
            <button 
              onClick={() => onSetViewMode('preview')} 
              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === 'preview' ? 'bg-white text-reflect-text shadow-soft' : 'text-reflect-muted hover:text-reflect-text'}`}
            >
              预览
            </button>
          </div>
          <button onClick={onSave} className="p-2 hover:bg-reflect-sidebar/60 rounded-full text-reflect-muted hover:text-reflect-text transition-colors"><Save size={14} /></button>
          <button onMouseEnter={onOutlineEnter} onMouseLeave={onOutlineLeave} className={`p-2 rounded-full transition-colors ${showOutline ? 'bg-reflect-sidebar text-reflect-text' : 'hover:bg-reflect-sidebar/60 text-reflect-muted'}`}><BookMarked size={14} /></button>
        </div>
      </div>
      
      <div className="flex items-baseline gap-4">
        <div className="text-3xl opacity-80 select-none grayscale hover:grayscale-0 transition-all cursor-pointer">
          {icon || '📄'}
        </div>
        <input
          className="flex-1 font-serif text-4xl italic font-medium text-reflect-text outline-none bg-transparent placeholder:text-reflect-muted/20"
          value={tempTitle}
          onChange={handleTitleChange}
          onFocus={() => {
            setIsFocused(true);
            onUpdateTitle(tempTitle, true);
          }}
          onBlur={handleTitleBlur}
          placeholder="新记录..."
        />
      </div>
    </div>
  );
}
