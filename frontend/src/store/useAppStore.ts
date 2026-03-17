import { create } from 'zustand';
import { api } from '../lib/api';
import type { AskResponse, ModelConfig, Note, Notebook, Task, ToastMessage, TrashState } from '../lib/types';

type AppState = {
  notes: Note[];
  notebooks: Notebook[];
  trash: TrashState;
  selectedNoteIds: number[];
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
  saveNote: (payload: { id?: number; title: string; content: string; notebookId?: number | null; icon?: string; silent?: boolean }) => Promise<void>;
  createNotebook: (name: string) => Promise<void>;
  updateNotebook: (notebookId: number, payload: { name?: string; icon?: string }) => Promise<void>;
  deleteNotebook: (notebookId: number) => Promise<void>;
  restoreNotebook: (notebookId: number) => Promise<void>;
  purgeNotebook: (notebookId: number) => Promise<void>;
  moveNote: (noteId: number, notebookId: number, position: number) => Promise<void>;
  toggleNoteSelection: (noteId: number) => void;
  clearNoteSelection: () => void;
  bulkMoveNotes: (notebookId: number) => Promise<void>;
  bulkDeleteNotes: () => Promise<void>;
  deleteNote: (noteId: number) => Promise<void>;
  restoreNote: (noteId: number) => Promise<void>;
  purgeNote: (noteId: number) => Promise<void>;
  createTask: (title: string) => Promise<void>;
  updateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
  askAssistant: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  updateModelConfig: (payload: ModelConfig) => Promise<void>;
  notify: (message: string) => void;
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
  notebooks: [],
  trash: { notes: [], notebooks: [] },
  selectedNoteIds: [],
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
      const [notes, notebooks, tasks, modelConfig, trash] = await Promise.all([api.listNotes(), api.listNotebooks(), api.listTasks(), api.getModelConfig(), api.getTrash()]);
      set({
        notes,
        notebooks,
        tasks,
        trash,
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
  saveNote: async ({ id, title, content, notebookId, icon, silent }) => {
    set({ isSavingNote: true });
    try {
      const note = id ? await api.updateNote(id, { title, content, icon }) : await api.createNote({ title, content, notebook_id: notebookId ?? get().notebooks[0]?.id ?? null, icon });
      const notes = id
        ? get().notes.map((item) => (item.id === note.id ? note : item))
        : [note, ...get().notes];
      set({ notes, selectedNoteId: note.id, toast: silent ? get().toast : { id: Date.now(), tone: 'success', text: id ? '笔记已保存。' : '新笔记已创建。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `保存失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    } finally {
      set({ isSavingNote: false });
    }
  },
  createNotebook: async (name) => {
    try {
      const notebook = await api.createNotebook({ name });
      set({ notebooks: [...get().notebooks, notebook], toast: { id: Date.now(), tone: 'success', text: '笔记本已创建。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `创建笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  updateNotebook: async (notebookId, payload) => {
    try {
      const notebook = await api.updateNotebook(notebookId, payload);
      set({ notebooks: get().notebooks.map((item) => (item.id === notebook.id ? notebook : item)), toast: { id: Date.now(), tone: 'success', text: '笔记本已更新。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `更新笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  deleteNotebook: async (notebookId) => {
    try {
      await api.deleteNotebook(notebookId);
      const [notebooks, notes, trash] = await Promise.all([api.listNotebooks(), api.listNotes(), api.getTrash()]);
      set({ notebooks, notes, trash, toast: { id: Date.now(), tone: 'success', text: '笔记本已移入垃圾桶。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `删除笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  restoreNotebook: async (notebookId) => {
    try {
      await api.restoreNotebook(notebookId);
      const [notebooks, notes, trash] = await Promise.all([api.listNotebooks(), api.listNotes(), api.getTrash()]);
      set({ notebooks, notes, trash, toast: { id: Date.now(), tone: 'success', text: '笔记本已恢复。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `恢复笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  purgeNotebook: async (notebookId) => {
    try {
      await api.purgeNotebook(notebookId);
      const [notebooks, notes, trash] = await Promise.all([api.listNotebooks(), api.listNotes(), api.getTrash()]);
      set({ notebooks, notes, trash, toast: { id: Date.now(), tone: 'success', text: '笔记本已永久删除。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `永久删除笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  moveNote: async (noteId, notebookId, position) => {
    try {
      const note = await api.moveNote(noteId, { notebook_id: notebookId, position });
      const notes = get().notes.filter((item) => item.id !== noteId);
      notes.push(note);
      notes.sort((a, b) => (a.notebook_id ?? 0) - (b.notebook_id ?? 0) || a.position - b.position);
      set({ notes, selectedNoteId: note.id, selectedNoteIds: get().selectedNoteIds.filter((id) => id !== noteId), toast: { id: Date.now(), tone: 'success', text: '笔记位置已更新。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `移动笔记失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  toggleNoteSelection: (noteId) => {
    const selected = get().selectedNoteIds;
    set({ selectedNoteIds: selected.includes(noteId) ? selected.filter((id) => id !== noteId) : [...selected, noteId] });
  },
  clearNoteSelection: () => set({ selectedNoteIds: [] }),
  bulkMoveNotes: async (notebookId) => {
    const noteIds = get().selectedNoteIds;
    if (noteIds.length === 0) return;
    try {
      await api.bulkMoveNotes({ note_ids: noteIds, notebook_id: notebookId, position: 0 });
      const notes = await api.listNotes();
      set({ notes, selectedNoteIds: [], toast: { id: Date.now(), tone: 'success', text: '已批量移动笔记。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `批量移动失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  bulkDeleteNotes: async () => {
    const noteIds = get().selectedNoteIds;
    if (noteIds.length === 0) return;
    try {
      await api.bulkDeleteNotes({ note_ids: noteIds });
      const [notes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
      set({ notes, trash, selectedNoteIds: [], toast: { id: Date.now(), tone: 'success', text: '已批量移入垃圾桶。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `批量删除失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  deleteNote: async (noteId) => {
    try {
      await api.deleteNote(noteId);
      const [notes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
      set({ notes, trash, selectedNoteId: get().selectedNoteId === noteId ? notes[0]?.id ?? null : get().selectedNoteId, toast: { id: Date.now(), tone: 'success', text: '笔记已移入垃圾桶。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `删除笔记失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  restoreNote: async (noteId) => {
    try {
      await api.restoreNote(noteId);
      const [notes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
      set({ notes, trash, toast: { id: Date.now(), tone: 'success', text: '笔记已恢复。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `恢复笔记失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  purgeNote: async (noteId) => {
    try {
      await api.purgeNote(noteId);
      const trash = await api.getTrash();
      set({ trash, toast: { id: Date.now(), tone: 'success', text: '笔记已永久删除。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `永久删除笔记失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
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
  notify: (message) => set({ toast: { id: Date.now(), tone: 'info', text: message } }),
  clearToast: () => set({ toast: null }),
}));
