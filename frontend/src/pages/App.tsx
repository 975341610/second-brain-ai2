import { CheckCircle2, FileText, Info, ListTodo, MessageSquareText, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AssistantPanel } from '../components/AssistantPanel';
import { EditorPanel } from '../components/EditorPanel';
import { Sidebar } from '../components/Sidebar';
import { TaskBoard } from '../components/TaskBoard';
import { useAppStore } from '../store/useAppStore';

export default function App() {
  const [mobileTab, setMobileTab] = useState<'notes' | 'editor' | 'tasks' | 'assistant'>('editor');
  const {
    notes,
    notebooks,
    trash,
    tasks,
    selectedNoteId,
    selectedNoteIds,
    assistant,
    loading,
    isSavingNote,
    isUploading,
    toast,
    modelConfig,
    loadInitialData,
    saveNote,
    createNotebook,
    updateNotebook,
    deleteNotebook,
    restoreNotebook,
    purgeNotebook,
    moveNote,
    toggleNoteSelection,
    clearNoteSelection,
    bulkMoveNotes,
    bulkDeleteNotes,
    deleteNote,
    restoreNote,
    purgeNote,
    selectNote,
    createTask,
    updateTaskStatus,
    askAssistant,
    uploadFiles,
    updateModelConfig,
    notify,
    clearToast,
  } = useAppStore();

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => clearToast(), toast.tone === 'error' ? 1500 : 1200);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) || null, [notes, selectedNoteId]);
  const relatedNotes = useMemo(
    () => notes.filter((note) => selectedNote?.links.includes(note.id)).slice(0, 5),
    [notes, selectedNote],
  );
  const toastIcon = toast?.tone === 'success' ? <CheckCircle2 size={16} /> : toast?.tone === 'error' ? <XCircle size={16} /> : <Info size={16} />;
  const toastClasses = toast?.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : toast?.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-stone-200 bg-white text-stone-700';
  const mobileTabs = [
    { key: 'notes', label: '笔记', icon: FileText },
    { key: 'editor', label: '编辑', icon: FileText },
    { key: 'tasks', label: '任务', icon: ListTodo },
    { key: 'assistant', label: 'AI', icon: MessageSquareText },
  ] as const;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(248,214,135,0.45),_transparent_35%),linear-gradient(135deg,_#f4efe4,_#d9e7df_55%,_#f7f4ee)] p-4 text-stone-900 lg:p-6">
        <div className="mx-auto mb-4 flex max-w-[1600px] items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs font-medium">
          {isUploading && <span className="rounded-full bg-amber-600 px-3 py-2 text-white">文件导入中</span>}
          {loading && <span className="rounded-full bg-emerald-700 px-3 py-2 text-white">AI 正在处理中</span>}
          </div>
        {toast && (
          <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-soft ${toastClasses}`}>
            {toastIcon}
            <span>{toast.text}</span>
            <button onClick={clearToast} className="ml-1 opacity-70"><X size={14} /></button>
          </div>
        )}
      </div>
      <div className="mx-auto mb-4 grid max-w-[1600px] grid-cols-4 gap-2 xl:hidden">
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`rounded-2xl px-3 py-3 text-sm font-medium ${mobileTab === tab.key ? 'bg-stone-900 text-white' : 'bg-white/70 text-stone-600'}`}
            >
              <div className="flex items-center justify-center gap-2">
                <Icon size={15} /> {tab.label}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mx-auto grid max-w-[1600px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div className={mobileTab === 'notes' ? 'block xl:block' : 'hidden xl:block'}>
          <Sidebar
            notes={notes}
            notebooks={notebooks}
            trash={trash}
            tasks={tasks}
            selectedNoteId={selectedNoteId}
            selectedNoteIds={selectedNoteIds}
            onSelectNote={(noteId) => {
              selectNote(noteId);
              setMobileTab('editor');
            }}
            onToggleNoteSelection={toggleNoteSelection}
            onClearSelection={clearNoteSelection}
            onCreateNote={() => void saveNote({ title: '未命名笔记', content: '# 新建笔记\n\n从这里开始记录你的想法。' })}
            onCreateNotebook={(name) => void createNotebook(name)}
            onNotify={notify}
            onUpdateNote={(noteId, payload) => {
              const note = notes.find((item) => item.id === noteId);
              if (!note) return;
              void saveNote({ id: note.id, title: payload.title ?? note.title, content: note.content, icon: payload.icon ?? note.icon });
            }}
            onUpdateNotebook={(notebookId, payload) => void updateNotebook(notebookId, payload)}
            onDeleteNotebook={(notebookId) => void deleteNotebook(notebookId)}
            onRestoreNotebook={(notebookId) => void restoreNotebook(notebookId)}
            onPurgeNotebook={(notebookId) => void purgeNotebook(notebookId)}
            onCreateNoteInNotebook={(notebookId) => void saveNote({ title: '未命名笔记', content: '# 新建笔记\n\n从这里开始记录你的想法。', notebookId })}
            onMoveNote={(noteId, notebookId, position) => void moveNote(noteId, notebookId, position)}
            onBulkMoveNotes={(notebookId) => void bulkMoveNotes(notebookId)}
            onBulkDeleteNotes={() => void bulkDeleteNotes()}
            onDeleteNote={(noteId) => void deleteNote(noteId)}
            onRestoreNote={(noteId) => void restoreNote(noteId)}
            onPurgeNote={(noteId) => void purgeNote(noteId)}
            onUpload={(files) => void uploadFiles(files)}
          />
        </div>

        <div className={`min-h-0 grid gap-4 ${mobileTab === 'editor' || mobileTab === 'tasks' ? 'block xl:grid' : 'hidden xl:grid'}`}>
          <div className={mobileTab === 'editor' ? 'block' : 'hidden xl:block'}>
            <EditorPanel note={selectedNote} relatedNotes={relatedNotes} isSaving={isSavingNote} onSave={saveNote} />
          </div>
          <div className={mobileTab === 'tasks' ? 'block' : 'hidden xl:block'}>
            <TaskBoard tasks={tasks} onCreateTask={createTask} onUpdateTaskStatus={updateTaskStatus} />
          </div>
        </div>

        <div className={mobileTab === 'assistant' ? 'block xl:block' : 'hidden xl:block'}>
          <AssistantPanel
            assistant={assistant}
            modelConfig={modelConfig}
            loading={loading}
            onAsk={askAssistant}
            onUpdateModelConfig={updateModelConfig}
          />
        </div>
      </div>
    </main>
  );
}
