import { create } from 'zustand';
import { api } from '../lib/api';
import type { AskResponse, ModelConfig, Note, Task, ToastMessage } from '../lib/types';

type AppState = {
  notes: Note[];
  tasks: Task[];
  selectedNoteId: number | null;
  assistant: AskResponse | null;
  loading: boolean;
  isSavingNote: boolean;
  isUploading: boolean;
  toast: ToastMessage | null;
  modelConfig: ModelConfig;
  loadInitialData: () => Promise<void>;
  selectNote: (noteId: number) => void;
  saveNote: (payload: { id?: number; title: string; content: string }) => Promise<void>;
  createTask: (title: string) => Promise<void>;
  updateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
  askAssistant: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  updateModelConfig: (payload: ModelConfig) => Promise<void>;
  clearToast: () => void;
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
  isSavingNote: false,
  isUploading: false,
  toast: null,
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
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `初始化失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    } finally {
      set({ loading: false });
    }
  },
  selectNote: (selectedNoteId) => set({ selectedNoteId }),
  saveNote: async ({ id, title, content }) => {
    set({ isSavingNote: true });
    try {
      const note = id ? await api.updateNote(id, { title, content }) : await api.createNote({ title, content });
      const notes = id
        ? get().notes.map((item) => (item.id === note.id ? note : item))
        : [note, ...get().notes];
      set({ notes, selectedNoteId: note.id, toast: { id: Date.now(), tone: 'success', text: id ? '笔记已保存。' : '新笔记已创建。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `保存失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    } finally {
      set({ isSavingNote: false });
    }
  },
  createTask: async (title) => {
    try {
      const task = await api.createTask({ title, status: 'todo' });
      set({ tasks: [task, ...get().tasks], toast: { id: Date.now(), tone: 'success', text: '任务已添加。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `创建任务失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  updateTaskStatus: async (taskId, status) => {
    try {
      const task = await api.updateTask(taskId, { status });
      set({
        tasks: get().tasks.map((item) => (item.id === task.id ? task : item)),
        toast: { id: Date.now(), tone: 'success', text: `任务已更新为${status === 'todo' ? '待开始' : status === 'doing' ? '进行中' : '已完成'}。` },
      });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `更新任务失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  askAssistant: async (question, mode) => {
    set({ loading: true });
    try {
      const assistant = await api.ask({ question, mode });
      const tasks = mode === 'agent' ? await api.listTasks() : get().tasks;
      set({ assistant, tasks, toast: { id: Date.now(), tone: 'success', text: mode === 'agent' ? '智能体规划已生成。' : 'AI 回答已返回。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `提问失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    } finally {
      set({ loading: false });
    }
  },
  uploadFiles: async (files) => {
    set({ isUploading: true });
    try {
      await api.upload(files);
      const notes = await api.listNotes();
      set({ notes, selectedNoteId: notes[0]?.id ?? null, toast: { id: Date.now(), tone: 'success', text: `已导入 ${files.length} 个文件。` } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `导入失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    } finally {
      set({ isUploading: false });
    }
  },
  updateModelConfig: async (payload) => {
    try {
      const modelConfig = await api.updateModelConfig(payload);
      set({ modelConfig, toast: { id: Date.now(), tone: 'success', text: '模型设置已保存。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `模型设置保存失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  clearToast: () => set({ toast: null }),
}));
