import { create } from 'zustand';
import { api } from '../lib/api';
import type { AskResponse, ChatMessage, ChatSession, ModelConfig, Note, Notebook, Task, ToastMessage, TrashState } from '../lib/types';

const CHAT_STORAGE_KEY = 'second-brain-chat-sessions';

type StoredChatState = {
  sessions: ChatSession[];
  activeSessionId: string | null;
};

function createSession(title = '新会话'): ChatSession {
  return { id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, messages: [], updated_at: new Date().toISOString() };
}

function readStoredChats(): StoredChatState {
  if (typeof window === 'undefined') {
    const session = createSession();
    return { sessions: [session], activeSessionId: session.id };
  }
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) {
      const session = createSession();
      return { sessions: [session], activeSessionId: session.id };
    }
    const parsed = JSON.parse(raw) as StoredChatState;
    if (!parsed.sessions?.length) {
      const session = createSession();
      return { sessions: [session], activeSessionId: session.id };
    }
    return parsed;
  } catch {
    const session = createSession();
    return { sessions: [session], activeSessionId: session.id };
  }
}

function writeStoredChats(sessions: ChatSession[], activeSessionId: string | null) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ sessions, activeSessionId }));
}

function latestAssistantFromSession(session: ChatSession | undefined): AskResponse | null {
  if (!session) return null;
  const assistantMessages = session.messages.filter((msg) => msg.role === 'assistant');
  const last = assistantMessages[assistantMessages.length - 1];
  if (!last) return null;
  return {
    answer: last.content,
    citations: last.citations || [],
    mode: last.mode || 'chat',
  };
}

const initialChats = readStoredChats();

type AppState = {
  notes: Note[];
  notebooks: Notebook[];
  trash: TrashState;
  selectedNoteIds: number[];
  tasks: Task[];
  selectedNoteId: number | null;
  recentNoteIds: number[];
  assistant: AskResponse | null;
  chatSessions: ChatSession[];
  activeChatSessionId: string;
  loading: boolean;
  isSavingNote: boolean;
  isUploading: boolean;
  toast: ToastMessage | null;
  modelConfig: ModelConfig;
  loadInitialData: () => Promise<void>;
  selectNote: (noteId: number) => void;
  createDraftNote: (notebookId?: number | null) => void;
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
  createTask: (payload: { title: string; priority: Task['priority']; task_type: Task['task_type']; deadline: string | null }) => Promise<void>;
  updateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
  askAssistant: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  updateModelConfig: (payload: ModelConfig) => Promise<void>;
  startNewChat: () => void;
  setActiveChatSession: (sessionId: string) => void;
  clearActiveChat: () => void;
  renameChatSession: (sessionId: string, title: string) => void;
  deleteChatSession: (sessionId: string) => void;
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
  recentNoteIds: [],
  assistant: null,
  chatSessions: initialChats.sessions,
  activeChatSessionId: initialChats.activeSessionId || initialChats.sessions[0].id,
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
        assistant: latestAssistantFromSession(get().chatSessions.find((session) => session.id === get().activeChatSessionId)),
      });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `初始化失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    } finally {
      set({ loading: false });
    }
  },
  selectNote: (selectedNoteId) => set((state) => ({ selectedNoteId, recentNoteIds: [selectedNoteId, ...state.recentNoteIds.filter((id) => id !== selectedNoteId)].slice(0, 8) })),
  createDraftNote: (notebookId) => {
    const targetNotebookId = notebookId ?? get().notebooks[0]?.id ?? null;
    const draftId = -Date.now();
    const draft: Note = {
      id: draftId,
      title: '未命名笔记',
      icon: '📝',
      content: '<h1>新建笔记</h1><p>从这里开始记录你的想法。</p>',
      summary: '新建草稿',
      tags: [],
      links: [],
      notebook_id: targetNotebookId,
      position: 0,
      created_at: new Date().toISOString(),
      is_draft: true,
    };
    set({ notes: [draft, ...get().notes], selectedNoteId: draftId });
  },
  saveNote: async ({ id, title, content, notebookId, icon, silent }) => {
    set({ isSavingNote: true });
    try {
      const isDraft = typeof id === 'number' && id < 0;
      const note = !id || isDraft
        ? await api.createNote({ title, content, notebook_id: notebookId ?? get().notes.find((item) => item.id === id)?.notebook_id ?? get().notebooks[0]?.id ?? null, icon })
        : await api.updateNote(id, { title, content, icon });
      const currentNotes = get().notes;
      const withoutOriginal = typeof id === 'number' ? currentNotes.filter((item) => item.id !== id) : currentNotes;
      const hasTarget = withoutOriginal.some((item) => item.id === note.id);
      const notes = hasTarget
        ? withoutOriginal.map((item) => (item.id === note.id ? note : item))
        : [note, ...withoutOriginal];
      set({ notes, selectedNoteId: note.id, toast: silent ? get().toast : { id: Date.now(), tone: 'success', text: id && !isDraft ? '笔记已保存。' : '新笔记已创建。' } });
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
  createTask: async ({ title, priority, task_type, deadline }) => {
    try {
      await api.createTask({ title, status: 'todo', priority, task_type, deadline });
      const tasks = await api.listTasks();
      set({ tasks, toast: { id: Date.now(), tone: 'success', text: '任务已添加。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `创建任务失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  updateTaskStatus: async (taskId, status) => {
    try {
      await api.updateTask(taskId, { status });
      const tasks = await api.listTasks();
      set({
        tasks,
        toast: { id: Date.now(), tone: 'success', text: `任务已更新为${status === 'todo' ? '待开始' : status === 'doing' ? '进行中' : '已完成'}。` },
      });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `更新任务失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  askAssistant: async (question, mode) => {
    set({ loading: true });
    try {
      const activeId = get().activeChatSessionId;
      const userMessage: ChatMessage = { id: Date.now(), role: 'user', content: question, mode, created_at: new Date().toISOString() };
      const sessionsWithUser = get().chatSessions.map((session) => session.id === activeId ? { ...session, messages: [...session.messages, userMessage], updated_at: new Date().toISOString(), title: session.messages.length === 0 ? question.slice(0, 16) || '新会话' : session.title } : session);
      writeStoredChats(sessionsWithUser, activeId);
      set({ chatSessions: sessionsWithUser });
      const assistant = await api.ask({ question, mode });
      const tasks = mode === 'agent' ? await api.listTasks() : get().tasks;
      const assistantMessage: ChatMessage = { id: Date.now() + 1, role: 'assistant', content: assistant.answer, citations: assistant.citations, mode: assistant.mode as 'chat' | 'rag' | 'agent', created_at: new Date().toISOString() };
      const updatedSessions = get().chatSessions.map((session) => session.id === activeId ? { ...session, messages: [...session.messages, assistantMessage], updated_at: new Date().toISOString() } : session);
      writeStoredChats(updatedSessions, activeId);
      set({ assistant, tasks, chatSessions: updatedSessions, toast: { id: Date.now(), tone: 'success', text: mode === 'agent' ? '智能体规划已生成。' : 'AI 回答已返回。' } });
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
  startNewChat: () => {
    const session = createSession();
    const sessions = [session, ...get().chatSessions];
    writeStoredChats(sessions, session.id);
    set({ chatSessions: sessions, activeChatSessionId: session.id, assistant: null });
  },
  setActiveChatSession: (sessionId) => {
    const session = get().chatSessions.find((item) => item.id === sessionId);
    writeStoredChats(get().chatSessions, sessionId);
    set({ activeChatSessionId: sessionId, assistant: latestAssistantFromSession(session) });
  },
  clearActiveChat: () => {
    const sessions = get().chatSessions.map((session) => session.id === get().activeChatSessionId ? { ...session, messages: [], title: '新会话', updated_at: new Date().toISOString() } : session);
    writeStoredChats(sessions, get().activeChatSessionId);
    set({ chatSessions: sessions, assistant: null });
  },
  renameChatSession: (sessionId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const sessions = get().chatSessions.map((session) => session.id === sessionId ? { ...session, title: trimmed, updated_at: new Date().toISOString() } : session);
    writeStoredChats(sessions, get().activeChatSessionId);
    set({ chatSessions: sessions, toast: { id: Date.now(), tone: 'success', text: '会话已重命名。' } });
  },
  deleteChatSession: (sessionId) => {
    const remaining = get().chatSessions.filter((session) => session.id !== sessionId);
    const nextSessions = remaining.length > 0 ? remaining : [createSession()];
    const nextActive = get().activeChatSessionId === sessionId ? nextSessions[0].id : get().activeChatSessionId;
    writeStoredChats(nextSessions, nextActive);
    set({
      chatSessions: nextSessions,
      activeChatSessionId: nextActive,
      assistant: latestAssistantFromSession(nextSessions.find((session) => session.id === nextActive)),
      toast: { id: Date.now(), tone: 'success', text: '会话已删除。' },
    });
  },
  notify: (message) => set({ toast: { id: Date.now(), tone: 'info', text: message } }),
  clearToast: () => set({ toast: null }),
}));
