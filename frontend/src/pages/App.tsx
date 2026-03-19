import { CheckCircle2, Bot, FileText, Info, MessageSquareText, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AssistantPanel } from '../components/AssistantPanel';
import { EditorPanel } from '../components/EditorPanel';
import { HomeDashboard } from '../components/HomeDashboard';
import { SettingsPanel } from '../components/SettingsPanel';
import { Sidebar } from '../components/Sidebar';
import { useAppStore } from '../store/useAppStore';
import type { OutlineItem } from '../lib/types';

function extractOutline(content: string): OutlineItem[] {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  return Array.from(doc.querySelectorAll('h1, h2, h3')).map((node) => ({
    id: node.id || node.textContent?.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-') || '',
    text: node.textContent || '',
    level: Number(node.tagName.replace('H', '')),
  }));
}

function extractReferences(content: string): string[] {
  const text = new DOMParser().parseFromString(content, 'text/html').body.textContent || content;
  return Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g)).map((match) => match[1]);
}

export default function App() {
  const [mobileTab, setMobileTab] = useState<'notes' | 'editor'>('editor');
  const [activePage, setActivePage] = useState<'home' | 'notes' | 'settings'>('home');
  const [showAssistantCard, setShowAssistantCard] = useState(false);
  const {
    notes,
    notebooks,
    trash,
    tasks,
    selectedNoteId,
    selectedNoteIds,
    recentNoteIds,
    assistant,
    chatSessions,
    activeChatSessionId,
    loading,
    isSavingNote,
    isUploading,
    toast,
    modelConfig,
    loadInitialData,
    saveNote,
    createDraftNote,
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
    startNewChat,
    setActiveChatSession,
    clearActiveChat,
    renameChatSession,
    deleteChatSession,
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
  const recentNotes = useMemo(() => recentNoteIds.map((id) => notes.find((note) => note.id === id)).filter(Boolean) as typeof notes, [recentNoteIds, notes]);
  const relatedNotes = useMemo(() => notes.filter((note) => selectedNote?.links.includes(note.id)).slice(0, 5), [notes, selectedNote]);
  const outline = useMemo(() => extractOutline(selectedNote?.content || ''), [selectedNote?.content]);
  const references = useMemo(() => extractReferences(selectedNote?.content || ''), [selectedNote?.content]);
  const toastIcon = toast?.tone === 'success' ? <CheckCircle2 size={16} /> : toast?.tone === 'error' ? <XCircle size={16} /> : <Info size={16} />;
  const toastClasses = toast?.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : toast?.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-stone-200 bg-white text-stone-700';
  const mobileTabs = [
    { key: 'notes', label: '笔记', icon: FileText },
    { key: 'editor', label: '编辑', icon: FileText },
  ] as const;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(248,214,135,0.45),_transparent_35%),linear-gradient(135deg,_#f4efe4,_#d9e7df_55%,_#f7f4ee)] p-4 text-stone-900 lg:p-6">
      <div className="mx-auto mb-4 flex max-w-[1680px] items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          {isUploading && <span className="rounded-full bg-amber-600 px-3 py-2 text-white">文件导入中</span>}
          {loading && <span className="rounded-full bg-emerald-700 px-3 py-2 text-white">AI 正在处理中</span>}
        </div>
        {toast && <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-soft ${toastClasses}`}>{toastIcon}<span>{toast.text}</span><button onClick={clearToast} className="ml-1 opacity-70"><X size={14} /></button></div>}
      </div>

      <div className="mx-auto mb-4 grid max-w-[1680px] grid-cols-4 gap-2 xl:hidden">
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.key} onClick={() => setMobileTab(tab.key)} className={`rounded-2xl px-3 py-3 text-sm font-medium ${mobileTab === tab.key ? 'bg-stone-900 text-white' : 'bg-white/70 text-stone-600'}`}><div className="flex items-center justify-center gap-2"><Icon size={15} /> {tab.label}</div></button>;
        })}
      </div>

      <div className={`mx-auto grid max-w-[1680px] gap-3 ${activePage === 'notes' ? 'xl:grid-cols-[minmax(240px,2.1fr)_minmax(0,8fr)]' : 'xl:grid-cols-[320px_minmax(0,1fr)]'}`}>
        <div className={`${mobileTab === 'notes' || activePage !== 'notes' ? 'block' : 'hidden xl:block'}`}>
          <Sidebar
            activePage={activePage}
            onChangePage={setActivePage}
            notes={notes}
            notebooks={notebooks}
            trash={trash}
            tasks={tasks}
            selectedNoteId={selectedNoteId}
            selectedNoteIds={selectedNoteIds}
            onSelectNote={(noteId) => { selectNote(noteId); setMobileTab('editor'); setActivePage('notes'); }}
            onToggleNoteSelection={toggleNoteSelection}
            onClearSelection={clearNoteSelection}
            onCreateNote={() => createDraftNote()}
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
            onCreateNoteInNotebook={(notebookId) => createDraftNote(notebookId)}
            onMoveNote={(noteId, notebookId, position) => void moveNote(noteId, notebookId, position)}
            onBulkMoveNotes={(notebookId) => void bulkMoveNotes(notebookId)}
            onBulkDeleteNotes={() => void bulkDeleteNotes()}
            onDeleteNote={(noteId) => void deleteNote(noteId)}
            onRestoreNote={(noteId) => void restoreNote(noteId)}
            onPurgeNote={(noteId) => void purgeNote(noteId)}
            onUpload={(files) => void uploadFiles(files)}
          />
        </div>

        <div className="min-h-0 grid gap-4">
          {activePage === 'home' && <HomeDashboard recentNotes={recentNotes} tasks={tasks} assistant={assistant} modelConfig={modelConfig} sessions={chatSessions} activeSessionId={activeChatSessionId} onSelectNote={(noteId) => { selectNote(noteId); setActivePage('notes'); }} onAsk={askAssistant} onCreateTask={createTask} onUpdateTaskStatus={updateTaskStatus} onStartNewChat={startNewChat} onSwitchSession={setActiveChatSession} onClearSession={clearActiveChat} onRenameSession={renameChatSession} onDeleteSession={deleteChatSession} />}
          {activePage === 'settings' && <SettingsPanel modelConfig={modelConfig} onUpdateModelConfig={updateModelConfig} />}
          {activePage === 'notes' && (
            <div className={mobileTab === 'editor' ? 'block' : 'hidden xl:block'}>
                <EditorPanel note={selectedNote} isSaving={isSavingNote} onSave={saveNote} outline={outline} references={references} relatedNotes={relatedNotes} />
            </div>
          )}
        </div>
      </div>

      {activePage === 'notes' && (
        <>
          <button onClick={() => setShowAssistantCard((value) => !value)} className="fixed bottom-6 right-6 z-30 rounded-full bg-stone-900 p-4 text-white shadow-soft">
            <Bot size={20} />
          </button>
          {showAssistantCard && (
            <div className="fixed bottom-24 right-6 z-30 w-[340px] max-w-[calc(100vw-2rem)]">
              <AssistantPanel assistant={assistant} modelConfig={modelConfig} loading={loading} onAsk={askAssistant} sessions={chatSessions} activeSessionId={activeChatSessionId} onStartNewChat={startNewChat} onSwitchSession={setActiveChatSession} onClearSession={clearActiveChat} onRenameSession={renameChatSession} onDeleteSession={deleteChatSession} onUpdateModelConfig={async () => {}} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
