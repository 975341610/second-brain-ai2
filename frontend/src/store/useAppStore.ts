import { create } from 'zustand';
import { api } from '../lib/api';
import type { AskResponse, ModelConfig, Note, Task } from '../lib/types';

type AppState = {
  notes: Note[];
  tasks: Task[];
  selectedNoteId: number | null;
  assistant: AskResponse | null;
  loading: boolean;
  modelConfig: ModelConfig;
  loadInitialData: () => Promise<void>;
  selectNote: (noteId: number) => void;
  saveNote: (payload: { id?: number; title: string; content: string }) => Promise<void>;
  createTask: (title: string) => Promise<void>;
  updateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
  askAssistant: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  updateModelConfig: (payload: ModelConfig) => Promise<void>;
};

const defaultModelConfig: ModelConfig = {
  provider: 'openclaw',
  api_key: '',
  base_url: 'https://api.openclaw.ai/v1',
  model_name: 'glm-4.7-flash',
};

export const useAppStore = create<AppState>((set, get) => ({
  notes: [],
  tasks: [],
  selectedNoteId: null,
  assistant: null,
  loading: false,
  modelConfig: defaultModelConfig,
  loadInitialData: async () => {
    set({ loading: true });
    try {
      const [notes, tasks, modelConfig] = await Promise.all([api.listNotes(), api.listTasks(), api.getModelConfig()]);
      set({
        notes,
        tasks,
        modelConfig,
        selectedNoteId: notes[0]?.id ?? null,
      });
    } finally {
      set({ loading: false });
    }
  },
  selectNote: (selectedNoteId) => set({ selectedNoteId }),
  saveNote: async ({ id, title, content }) => {
    const note = id ? await api.updateNote(id, { title, content }) : await api.createNote({ title, content });
    const notes = id
      ? get().notes.map((item) => (item.id === note.id ? note : item))
      : [note, ...get().notes];
    set({ notes, selectedNoteId: note.id });
  },
  createTask: async (title) => {
    const task = await api.createTask({ title, status: 'todo' });
    set({ tasks: [task, ...get().tasks] });
  },
  updateTaskStatus: async (taskId, status) => {
    const task = await api.updateTask(taskId, { status });
    set({ tasks: get().tasks.map((item) => (item.id === task.id ? task : item)) });
  },
  askAssistant: async (question, mode) => {
    set({ loading: true });
    try {
      const assistant = await api.ask({ question, mode });
      const tasks = mode === 'agent' ? await api.listTasks() : get().tasks;
      set({ assistant, tasks });
    } finally {
      set({ loading: false });
    }
  },
  uploadFiles: async (files) => {
    await api.upload(files);
    const notes = await api.listNotes();
    set({ notes, selectedNoteId: notes[0]?.id ?? null });
  },
  updateModelConfig: async (payload) => {
    const modelConfig = await api.updateModelConfig(payload);
    set({ modelConfig });
  },
}));
