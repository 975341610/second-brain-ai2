import { useEffect, useMemo } from 'react';
import { AssistantPanel } from '../components/AssistantPanel';
import { EditorPanel } from '../components/EditorPanel';
import { Sidebar } from '../components/Sidebar';
import { TaskBoard } from '../components/TaskBoard';
import { useAppStore } from '../store/useAppStore';

export default function App() {
  const {
    notes,
    tasks,
    selectedNoteId,
    assistant,
    loading,
    modelConfig,
    loadInitialData,
    saveNote,
    selectNote,
    createTask,
    updateTaskStatus,
    askAssistant,
    uploadFiles,
    updateModelConfig,
  } = useAppStore();

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) || null, [notes, selectedNoteId]);
  const relatedNotes = useMemo(
    () => notes.filter((note) => selectedNote?.links.includes(note.id)).slice(0, 5),
    [notes, selectedNote],
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(248,214,135,0.45),_transparent_35%),linear-gradient(135deg,_#f4efe4,_#d9e7df_55%,_#f7f4ee)] p-4 text-stone-900 lg:p-6">
      <div className="mx-auto grid max-w-[1600px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <Sidebar
          notes={notes}
          tasks={tasks}
          selectedNoteId={selectedNoteId}
          onSelectNote={selectNote}
          onCreateNote={() => void saveNote({ title: 'Untitled', content: '# New note\n\nWrite here...' })}
          onUpload={(files) => void uploadFiles(files)}
        />

        <div className="grid gap-4">
          <EditorPanel note={selectedNote} relatedNotes={relatedNotes} onSave={saveNote} />
          <TaskBoard tasks={tasks} onCreateTask={createTask} onUpdateTaskStatus={updateTaskStatus} />
        </div>

        <AssistantPanel
          assistant={assistant}
          modelConfig={modelConfig}
          loading={loading}
          onAsk={askAssistant}
          onUpdateModelConfig={updateModelConfig}
        />
      </div>
    </main>
  );
}
