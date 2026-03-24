import { CheckCircle2, Bot, FileText, Info, MessageSquareText, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AssistantPanel } from '../components/AssistantPanel';
import { DatabaseView } from '../components/DatabaseView';
import { EditorPanel } from '../components/EditorPanel';
import { HomeDashboard } from '../components/HomeDashboard';
import { SettingsPanel } from '../components/SettingsPanel';
import { Sidebar } from '../components/Sidebar';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
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
  const [activePage, setActivePage] = useState<'home' | 'notes' | 'settings' | 'database'>('home');
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
    purgeTrash,
    selectNote,
    updateNoteTags,
    createTask,
    updateTaskStatus,
    deleteTask,
    clearCompletedTasks,
    askAssistant,
    askStreamingAssistant,
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
    <>
    <main className="min-h-screen bg-reflect-bg text-reflect-text font-sans antialiased lg:flex lg:gap-0">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-xl border px-6 py-4 text-sm shadow-soft-lg animate-in fade-in slide-in-from-bottom-4 duration-300 ${toastClasses}`}>
          {toastIcon}
          <span className="font-medium">{toast.text}</span>
          <button onClick={clearToast} className="ml-2 p-1 hover:bg-black/5 rounded-full transition-colors opacity-70">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="flex-1 flex flex-col lg:flex-row h-screen overflow-hidden">
        {/* Mobile Navigation (Tabs) */}
        <div className="lg:hidden p-4 grid grid-cols-2 gap-2">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button 
                key={tab.key} 
                onClick={() => setMobileTab(tab.key)} 
                className={`rounded-xl px-3 py-3 text-sm font-medium transition-all ${mobileTab === tab.key ? 'bg-reflect-text text-white' : 'bg-reflect-sidebar/50 text-reflect-muted'}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Icon size={15} /> 
                  {tab.label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Sidebar Navigation */}
        <div className={`
          ${mobileTab === 'notes' || activePage !== 'notes' ? 'block' : 'hidden lg:block'} 
          w-full lg:w-[320px] lg:border-r border-reflect-border/50 bg-reflect-sidebar/40
        `}>
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
              void saveNote({ 
                id: note.id, 
                title: payload.title ?? note.title, 
                content: note.content, 
                icon: payload.icon ?? note.icon,
                tags: payload.tags,
                is_title_manually_edited: payload.title !== undefined ? true : note.is_title_manually_edited
              });
            }}
            onUpdateNotebook={(notebookId, payload) => void updateNotebook(notebookId, payload)}
            onDeleteNotebook={(notebookId) => void deleteNotebook(notebookId)}
            onRestoreNotebook={(notebookId) => void restoreNotebook(notebookId)}
            onPurgeNotebook={(notebookId) => void purgeNotebook(notebookId)}
            onCreateNoteInNotebook={(notebookId, parentId) => createDraftNote(notebookId, parentId)}
            onMoveNote={(noteId, notebookId, position, parentId) => void moveNote(noteId, notebookId, position, parentId)}
            onBulkMoveNotes={(notebookId, parentId) => void bulkMoveNotes(notebookId, parentId)}
            onBulkDeleteNotes={() => void bulkDeleteNotes()}
            onDeleteNote={(noteId) => void deleteNote(noteId)}
            onRestoreNote={(noteId) => void restoreNote(noteId)}
            onPurgeNote={(noteId) => void purgeNote(noteId)}
            onPurgeTrash={() => void purgeTrash()}
            onUpload={(files) => void uploadFiles(files)}
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-reflect-bg relative">
          <div className="max-w-5xl mx-auto px-6 py-8 h-full">
            {activePage === 'home' && <HomeDashboard 
              recentNotes={recentNotes} 
              tasks={tasks} 
              assistant={assistant} 
              modelConfig={modelConfig} 
              sessions={chatSessions} 
              activeSessionId={activeChatSessionId} 
              onSelectNote={(noteId) => { selectNote(noteId); setActivePage('notes'); }} 
              onAsk={askStreamingAssistant} 
              onCreateTask={createTask} 
              onUpdateTaskStatus={updateTaskStatus} 
              onDeleteTask={deleteTask}
              onClearCompleted={clearCompletedTasks}
              onStartNewChat={startNewChat} 
              onSwitchSession={setActiveChatSession} 
              onClearSession={clearActiveChat} 
              onRenameSession={renameChatSession} 
              onDeleteSession={deleteChatSession} 
            />}
            {activePage === 'database' && (
              <DatabaseView 
                notes={notes} 
                onSelectNote={(noteId) => { selectNote(noteId); setActivePage('notes'); }}
                onCreateNote={() => createDraftNote()}
                onUpdateNoteProperty={async (noteId, propertyId, value) => {
                  await api.updateNoteProperty(noteId, propertyId, { value });
                  void loadInitialData();
                }}
              />
            )}
            {activePage === 'settings' && <SettingsPanel modelConfig={modelConfig} onUpdateModelConfig={updateModelConfig} />}
            {activePage === 'notes' && (
              <div className={`${mobileTab === 'editor' ? 'block' : 'hidden lg:block'} h-full`}>
                <EditorPanel 
                  note={selectedNote} 
                  notes={notes}
                  isSaving={isSavingNote} 
                  onSave={saveNote} 
                  onUpdateTags={updateNoteTags}
                  onCreateSubPage={(parentId) => createDraftNote(selectedNote?.notebook_id, parentId)}
                  onSelectNote={(noteId) => selectNote(noteId)}
                  onNotify={notify}
                  outline={outline} 
                  references={references} 
                  relatedNotes={relatedNotes} 
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating AI Trigger */}
      {activePage === 'notes' && (
        <>
          <button 
            onClick={() => setShowAssistantCard((value) => !value)} 
            className="fixed bottom-8 right-8 z-30 rounded-full bg-reflect-text p-4 text-white shadow-soft hover:scale-105 transition-transform"
          >
            <Bot size={20} />
          </button>
          {showAssistantCard && (
            <div className="fixed bottom-24 right-8 z-30 w-[400px] max-w-[calc(100vw-2rem)]">
              <AssistantPanel assistant={assistant} modelConfig={modelConfig} loading={loading} onAsk={askStreamingAssistant} sessions={chatSessions} activeSessionId={activeChatSessionId} onStartNewChat={startNewChat} onSwitchSession={setActiveChatSession} onClearSession={clearActiveChat} onRenameSession={renameChatSession} onDeleteSession={deleteChatSession} onUpdateModelConfig={async () => {}} />
            </div>
          )}
        </>
      )}
    </main>
    <div className="fixed bottom-4 left-4 z-50 text-[10px] text-stone-400 font-mono pointer-events-none opacity-50">
      v0.4.4-bugfix
    </div>
    </>
  );
}
