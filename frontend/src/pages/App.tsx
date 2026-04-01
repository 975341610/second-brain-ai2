import { CalendarRange, CheckCircle2, Bot, FileText, Info, X, XCircle } from 'lucide-react';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { HomeDashboard } from '../components/HomeDashboard';
import { Sidebar } from '../components/Sidebar';
import { useAppStore } from '../store/useAppStore';
import type { NoteTemplate, OutlineItem } from '../lib/types';

const AssistantPanel = lazy(() => import('../components/AssistantPanel').then((module) => ({ default: module.AssistantPanel })));
const EditorPanel = lazy(() => import('../components/EditorPanel').then((module) => ({ default: module.EditorPanel })));
const SettingsPanel = lazy(() => import('../components/SettingsPanel').then((module) => ({ default: module.SettingsPanel })));


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

function TimelinePage({ items, onSelectNote }: { items: ReturnType<typeof useAppStore.getState>['timelineItems']; onSelectNote: (noteId: number) => void }) {
  return (
    <section className="app-panel rounded-[28px] p-6 shadow-soft backdrop-blur">
      <div className="mb-5 flex items-center gap-2 text-sm font-medium app-text-secondary"><CalendarRange size={16} /> 时间轴</div>
      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => item.note_id && onSelectNote(item.note_id)}
            className="app-surface-muted flex w-full items-start gap-4 rounded-[22px] p-4 text-left"
          >
            <div className="app-surface-soft rounded-2xl px-3 py-2 text-lg">{item.icon || '📝'}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] app-text-muted">
                <span>{item.item_type === 'task' ? '任务' : item.note_type || '笔记'}</span>
                {item.status && <span>{item.status}</span>}
              </div>
              <div className="mt-1 truncate text-sm font-medium">{item.title}</div>
              <div className="mt-2 text-xs app-text-secondary">{new Date(item.timestamp).toLocaleString('zh-CN')}</div>
            </div>
          </button>
        ))}
        {items.length === 0 && <div className="app-surface-muted rounded-[22px] p-5 text-sm app-text-secondary">时间轴里还没有事件。</div>}
      </div>
    </section>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="app-panel rounded-[24px] p-6 shadow-soft backdrop-blur">
      <div className="text-sm app-text-secondary">正在加载{label}...</div>
    </div>
  );
}

export default function App() {
  const [mobileTab, setMobileTab] = useState<'notes' | 'editor'>('editor');
  const [activePage, setActivePage] = useState<'home' | 'notes' | 'timeline' | 'settings'>('home');
  const [showAssistantCard, setShowAssistantCard] = useState(false);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const {
    appInfo,
    notes,
    notebooks,
    trash,
    tasks,
    templates,
    plugins,
    timelineItems,
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
    workspaceSettings,
    privateVault,
    updateState,
    updateAvailability,
    loadInitialData,
    saveNote,
    createDraftNote,
    createJournalNote,
    createNoteFromTemplate,
    saveTemplate,
    deleteTemplate,
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
    updateWorkspaceSettings,
    unlockPrivateVault,
    lockPrivateVault,
    checkUpdateAvailability,
    uploadOfflineUpdate,
    stageUpdatePackage,
    applyUpdatePackage,
    rollbackUpdatePackage,
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
  const relatedNotes = useMemo(() => notes.filter((note) => !note.is_private && selectedNote?.links.includes(note.id)).slice(0, 5), [notes, selectedNote]);
  const outline = useMemo(() => extractOutline(selectedNote?.content || ''), [selectedNote?.content]);
  const references = useMemo(() => extractReferences(selectedNote?.content || ''), [selectedNote?.content]);
  const toastIcon = toast?.tone === 'success' ? <CheckCircle2 size={16} /> : toast?.tone === 'error' ? <XCircle size={16} /> : <Info size={16} />;
  const toastClasses = toast?.tone === 'success' ? 'app-toast-success' : toast?.tone === 'error' ? 'app-toast-error' : 'app-toast-info';
  const mobileTabs = [
    { key: 'notes', label: '笔记', icon: FileText },
    { key: 'editor', label: '编辑', icon: FileText },
  ] as const;
  const templateOptions = templates.filter((template) => template.note_type !== 'template');
  const customThemeVars = useMemo(() => ({
    '--custom-paper': workspaceSettings.custom_theme.paper,
    '--custom-panel-bg': workspaceSettings.custom_theme.panel_bg,
    '--custom-surface-bg': workspaceSettings.custom_theme.surface_bg,
    '--custom-border-color': workspaceSettings.custom_theme.border_color,
    '--custom-text-primary': workspaceSettings.custom_theme.text_primary,
    '--custom-text-secondary': workspaceSettings.custom_theme.text_secondary,
    '--custom-text-muted': workspaceSettings.custom_theme.text_muted,
    '--custom-accent-strong': workspaceSettings.custom_theme.accent_strong,
    '--custom-accent-contrast': workspaceSettings.custom_theme.accent_contrast,
    '--app-font-family': workspaceSettings.font_mode === 'serif' ? 'Georgia, serif' : workspaceSettings.font_mode === 'mono' ? '"IBM Plex Mono", monospace' : '"IBM Plex Sans", sans-serif',
    '--app-heading-font-family': workspaceSettings.font_mode === 'mono' ? '"IBM Plex Mono", monospace' : workspaceSettings.font_mode === 'sans' ? '"IBM Plex Sans", sans-serif' : 'Georgia, serif',
  } as React.CSSProperties), [workspaceSettings.custom_theme, workspaceSettings.font_mode]);

  return (
    <main className="app-shell min-h-screen p-4 lg:p-6" data-theme={workspaceSettings.theme_mode} data-wallpaper={workspaceSettings.wallpaper} data-motion={workspaceSettings.motion_mode} data-density={workspaceSettings.density} style={customThemeVars}>
      <div className="mx-auto mb-4 flex max-w-[1680px] items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          {isUploading && <span className="app-chip-warning rounded-full px-3 py-2">文件导入中</span>}
          {loading && <span className="app-chip-success rounded-full px-3 py-2">AI 正在处理中</span>}
          {privateVault.unlocked && <span className="app-chip-accent rounded-full px-3 py-2">私密保险箱已解锁</span>}
          {updateAvailability.update_available && <span className="app-chip-info rounded-full px-3 py-2">发现新版本 {updateAvailability.latest_version}</span>}
        </div>
        {toast && <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-soft ${toastClasses}`}>{toastIcon}<span>{toast.text}</span><button onClick={clearToast} className="ml-1 opacity-70"><X size={14} /></button></div>}
      </div>

      <div className="mx-auto mb-4 grid max-w-[1680px] grid-cols-4 gap-2 xl:hidden">
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.key} onClick={() => setMobileTab(tab.key)} className={`rounded-2xl px-3 py-3 text-sm font-medium ${mobileTab === tab.key ? 'app-primary-button' : 'app-surface-muted app-text-secondary'}`}><div className="flex items-center justify-center gap-2"><Icon size={15} /> {tab.label}</div></button>;
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
              void saveNote({
                id: note.id,
                title: payload.title ?? note.title,
                content: note.content,
                icon: payload.icon ?? note.icon,
                noteType: note.note_type,
                templateId: note.template_id,
                isPrivate: note.is_private,
                journalDate: note.journal_date,
                periodType: note.period_type,
                startAt: note.start_at,
                endAt: note.end_at,
              });
            }}
            onUpdateNotebook={(notebookId, payload) => void updateNotebook(notebookId, payload)}
            onDeleteNotebook={(notebookId) => void deleteNotebook(notebookId)}
            onRestoreNotebook={(notebookId) => void restoreNotebook(notebookId)}
            onPurgeNotebook={(notebookId) => void purgeNotebook(notebookId)}
            onCreateNoteInNotebook={(notebookId) => createDraftNote(notebookId)}
            onCreateChildNote={(noteId) => {
              const parent = notes.find((item) => item.id === noteId);
              if (!parent) return;
              createDraftNote(parent.notebook_id ?? undefined, noteId);
            }}
            onMoveNote={(noteId, notebookId, position, parentId) => void moveNote(noteId, notebookId, position, parentId)}
            onBulkMoveNotes={(notebookId) => void bulkMoveNotes(notebookId)}
            onBulkDeleteNotes={() => void bulkDeleteNotes()}
            onDeleteNote={(noteId) => void deleteNote(noteId)}
            onRestoreNote={(noteId) => void restoreNote(noteId)}
            onPurgeNote={(noteId) => void purgeNote(noteId)}
            onUpload={(files) => void uploadFiles(files)}
          />
        </div>

        <div className="min-h-0 grid gap-4">
          {activePage === 'home' && (
            <HomeDashboard
              recentNotes={recentNotes}
              tasks={tasks}
              assistant={assistant}
              modelConfig={modelConfig}
              sessions={chatSessions}
              activeSessionId={activeChatSessionId}
              layout={workspaceSettings.home_layout}
              onSelectNote={(noteId) => { selectNote(noteId); setActivePage('notes'); }}
              onOpenSettings={() => setActivePage('settings')}
              onAsk={askAssistant}
              onCreateTask={createTask}
              onUpdateTaskStatus={updateTaskStatus}
              onStartNewChat={startNewChat}
              onSwitchSession={setActiveChatSession}
              onClearSession={clearActiveChat}
              onRenameSession={renameChatSession}
              onDeleteSession={deleteChatSession}
              onReorderBoards={(layout) => void updateWorkspaceSettings({ ...workspaceSettings, home_layout: layout })}
            />
          )}
          {activePage === 'timeline' && <TimelinePage items={timelineItems} onSelectNote={(noteId) => { selectNote(noteId); setActivePage('notes'); }} />}
          {activePage === 'settings' && (
            <Suspense fallback={<PanelSkeleton label="设置面板" />}>
              <SettingsPanel
                appInfo={appInfo}
                modelConfig={modelConfig}
                templates={templates}
                plugins={plugins}
                workspaceSettings={workspaceSettings}
                privateVault={privateVault}
                updateState={updateState}
                updateAvailability={updateAvailability}
                onUpdateModelConfig={updateModelConfig}
                onUpdateWorkspaceSettings={updateWorkspaceSettings}
                onUnlockPrivateVault={unlockPrivateVault}
                onLockPrivateVault={lockPrivateVault}
                onSaveTemplate={saveTemplate}
                onDeleteTemplate={deleteTemplate}
                onCheckUpdateAvailability={checkUpdateAvailability}
                onUploadOfflineUpdate={uploadOfflineUpdate}
                onStageUpdatePackage={stageUpdatePackage}
                onApplyUpdatePackage={applyUpdatePackage}
                onRollbackUpdatePackage={rollbackUpdatePackage}
              />
            </Suspense>
          )}

          {activePage === 'notes' && (
            <div className="grid gap-4">
              <div className="app-panel rounded-[24px] p-4 shadow-soft backdrop-blur">
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => void createJournalNote('daily', { notebookId: selectedNote?.notebook_id ?? notebooks[0]?.id ?? null, parentId: null, isPrivate: false })} className="app-secondary-button rounded-2xl px-4 py-2 text-sm">今日日志</button>
                  <button onClick={() => void createJournalNote('weekly', { notebookId: selectedNote?.notebook_id ?? notebooks[0]?.id ?? null, parentId: null, isPrivate: false })} className="app-secondary-button rounded-2xl px-4 py-2 text-sm">本周周记</button>
                  <button onClick={() => void createJournalNote('monthly', { notebookId: selectedNote?.notebook_id ?? notebooks[0]?.id ?? null, parentId: null, isPrivate: false })} className="app-secondary-button rounded-2xl px-4 py-2 text-sm">本月月记</button>
                  <select value={templateId} onChange={(event) => setTemplateId(event.target.value ? Number(event.target.value) : '')} className="app-select rounded-2xl px-3 py-2 text-sm">
                    <option value="">从模板创建笔记</option>
                    {templateOptions.map((template: NoteTemplate) => <option key={template.id} value={template.id}>{template.icon} {template.name}</option>)}
                  </select>
                  <button onClick={() => templateId && void createNoteFromTemplate(Number(templateId), { notebookId: selectedNote?.notebook_id ?? notebooks[0]?.id ?? null, parentId: null })} className="app-primary-button rounded-2xl px-4 py-2 text-sm">创建</button>
                  {selectedNote && !selectedNote.is_draft && <button onClick={() => void saveTemplate({ name: `${selectedNote.title} 模板`, icon: selectedNote.icon, note_type: selectedNote.note_type || 'note', default_title: selectedNote.title, default_content: selectedNote.content, metadata: { is_private: selectedNote.is_private, journal_date: selectedNote.journal_date, period_type: selectedNote.period_type } })} className="app-secondary-button rounded-2xl px-4 py-2 text-sm">保存为模板</button>}
                  {selectedNote && <button onClick={() => void saveNote({ id: selectedNote.id, title: selectedNote.title, content: selectedNote.content, icon: selectedNote.icon, noteType: selectedNote.note_type || 'note', templateId: selectedNote.template_id ?? null, isPrivate: !selectedNote.is_private, journalDate: selectedNote.journal_date ?? null, periodType: selectedNote.period_type ?? null, startAt: selectedNote.start_at ?? null, endAt: selectedNote.end_at ?? null })} className={`rounded-2xl px-4 py-2 text-sm ${selectedNote.is_private ? 'app-chip-accent' : 'app-secondary-button'}`}>{selectedNote.is_private ? '取消私密' : '设为私密'}</button>}
                </div>
              </div>
              <div className={mobileTab === 'editor' ? 'block' : 'hidden xl:block'}>
                <Suspense fallback={<PanelSkeleton label="编辑器" />}>
                  <EditorPanel note={selectedNote} isSaving={isSavingNote} onSave={saveNote} outline={outline} references={references} relatedNotes={relatedNotes} templates={templates} />
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </div>

      {activePage === 'notes' && (
        <>
          <button onClick={() => setShowAssistantCard((value) => !value)} className="app-primary-button fixed bottom-6 right-6 z-30 rounded-full p-4 shadow-soft">
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
