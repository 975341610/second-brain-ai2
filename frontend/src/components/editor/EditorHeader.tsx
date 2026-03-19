import { BookMarked, BookOpenText, Clock3, GitBranchPlus, PencilLine, Save } from 'lucide-react';

type EditorHeaderProps = {
  icon: string;
  title: string;
  savePhase: 'idle' | 'queued' | 'saving';
  isDirty: boolean;
  lastSavedAt: string | null;
  showRelations: boolean;
  showOutline: boolean;
  viewMode: 'edit' | 'preview';
  onSave: () => void;
  onToggleRelations: () => void;
  onOutlineEnter: () => void;
  onOutlineLeave: () => void;
  onSetViewMode: (mode: 'edit' | 'preview') => void;
};

export function EditorHeader(props: EditorHeaderProps) {
  const { icon, title, savePhase, isDirty, lastSavedAt, showRelations, showOutline, viewMode, onSave, onToggleRelations, onOutlineEnter, onOutlineLeave, onSetViewMode } = props;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <div className="rounded-[16px] border border-stone-200 bg-white px-4 py-2.5 text-2xl">{icon}</div>
          <h2 className="font-display text-[2rem] leading-tight text-stone-900">{title}</h2>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
          <Clock3 size={14} />
          {savePhase === 'saving' ? '后台同步中...' : savePhase === 'queued' ? '内容已加入保存队列' : isDirty ? '有未保存修改' : lastSavedAt ? `已保存于 ${lastSavedAt}` : '内容已同步'}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onSave} className="editor-icon-button group"><Save size={16} /><span className="editor-icon-tooltip">{savePhase === 'saving' ? '同步中...' : '保存'}</span></button>
        <button onClick={onToggleRelations} className={`editor-icon-button group ${showRelations ? 'bg-stone-900 text-white' : ''}`}><GitBranchPlus size={16} /><span className="editor-icon-tooltip">引用与关联</span></button>
        <button onMouseEnter={onOutlineEnter} onMouseLeave={onOutlineLeave} className={`editor-icon-button group ${showOutline ? 'bg-stone-900 text-white' : ''}`}><BookMarked size={16} /><span className="editor-icon-tooltip">目录</span></button>
        <div className="flex items-center gap-2 rounded-[16px] bg-stone-50 p-1.5">
          <button onClick={() => onSetViewMode('edit')} className={`editor-icon-button group ${viewMode === 'edit' ? 'bg-stone-900 text-white' : ''}`}><PencilLine size={14} /><span className="editor-icon-tooltip">输入</span></button>
          <button onClick={() => onSetViewMode('preview')} className={`editor-icon-button group ${viewMode === 'preview' ? 'bg-stone-900 text-white' : ''}`}><BookOpenText size={14} /><span className="editor-icon-tooltip">阅读</span></button>
        </div>
      </div>
    </div>
  );
}
