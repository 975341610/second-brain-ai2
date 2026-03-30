import { create } from 'zustand';
import { openDB, type IDBPDatabase } from 'idb';
import { api } from '../lib/api';
import type { 
  AskResponse, 
  ChatMessage, 
  ChatSession, 
  ModelConfig, 
  Note, 
  Notebook, 
  Task, 
  ToastMessage, 
  TrashState, 
  Citation, 
  UserStats,
  UserAchievement,
  AppStatus,
  BGMState,
} from '../lib/types';


const CHAT_STORAGE_KEY = 'second-brain-chat-sessions';

const DB_NAME = 'second-brain-offline';
const STORE_NOTES = 'notes';
const STORE_NOTEBOOKS = 'notebooks';
const STORE_TASKS = 'tasks';
const STORE_CONFIG = 'config';

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NOTES)) db.createObjectStore(STORE_NOTES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) db.createObjectStore(STORE_NOTEBOOKS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_TASKS)) db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_CONFIG)) db.createObjectStore(STORE_CONFIG, { keyPath: 'id' });
    },
  });
}

async function getCachedData<T>(storeName: string): Promise<T[]> {
  const db = await initDB();
  return db.getAll(storeName);
}

async function setCachedData<T>(storeName: string, items: T[]) {
  const db = await initDB();
  const tx = db.transaction(storeName, 'readwrite');
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

async function setCachedItem<T>(storeName: string, item: T) {
  const db = await initDB();
  await db.put(storeName, item);
}

async function deleteCachedItem(storeName: string, id: number) {
  const db = await initDB();
  await db.delete(storeName, id);
}

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
  appVersion: string;
  gitCommit: string;
  buildTime: string;
  exePath: string;
  userStats: UserStats | null;
  userAchievements: UserAchievement[];
  appStatus: AppStatus;
  bgm: BGMState;
  setAppStatus: (status: AppStatus) => void;
  loadInitialData: () => Promise<void>;
  loadBgmTracks: () => Promise<void>;
  toggleBgm: () => void;
  setBgmVolume: (volume: number) => void;
  nextTrack: () => void;
  updateUserTheme: (theme: string) => Promise<void>;
  updateUserWallpaper: (wallpaperUrl: string) => Promise<void>;
  selectNote: (noteId: number) => void;
    createDraftNote: (notebookId?: number | null, parentId?: number | null) => void;
    saveNote: (payload: { id?: number; title?: string; content?: string; notebookId?: number | null; parent_id?: number | null; icon?: string; is_title_manually_edited?: boolean; tags?: string[]; silent?: boolean }) => Promise<void>;
    updateNoteTags: (noteId: number, tags: string[]) => Promise<void>;
    createNotebook: (name: string) => Promise<void>;
    updateNotebook: (notebookId: number, payload: { name?: string; icon?: string }) => Promise<void>;
    deleteNotebook: (notebookId: number) => Promise<void>;
    restoreNotebook: (notebookId: number) => Promise<void>;
    purgeNotebook: (notebookId: number) => Promise<void>;
    moveNote: (noteId: number, notebookId: number, position: number, parentId?: number | null) => Promise<void>;
    toggleNoteSelection: (noteId: number) => void;
    clearNoteSelection: () => void;
    bulkMoveNotes: (notebookId: number, parentId?: number | null) => Promise<void>;
  bulkDeleteNotes: () => Promise<void>;
  deleteNote: (noteId: number) => Promise<void>;
  restoreNote: (noteId: number) => Promise<void>;
  purgeNote: (noteId: number) => Promise<void>;
  purgeTrash: () => Promise<void>;
  createTask: (payload: { title: string; priority: Task['priority']; task_type: Task['task_type']; deadline: string | null }) => Promise<void>;
  updateTaskStatus: (taskId: number, status: Task['status']) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  clearCompletedTasks: () => Promise<void>;
  askAssistant: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
  askStreamingAssistant: (question: string, mode: 'chat' | 'rag' | 'agent') => Promise<void>;
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
  appVersion: 'v0.5.4', // 默认版本，加载后会被覆盖
  gitCommit: 'unknown',
  buildTime: 'unknown',
  exePath: 'unknown',
  userStats: null,
  userAchievements: [],
  appStatus: 'INIT',
  bgm: {
    isPlaying: false,
    volume: 0.5,
    tracks: [],
    currentTrack: null,
  },
  setAppStatus: (status) => set({ appStatus: status }),
  loadInitialData: async () => {
    // 优先从缓存加载，实现离线瞬间看到内容
    const [cachedNotes, cachedNotebooks, cachedTasks] = await Promise.all([
      getCachedData<Note>(STORE_NOTES),
      getCachedData<Notebook>(STORE_NOTEBOOKS),
      getCachedData<Task>(STORE_TASKS)
    ]);

    if (cachedNotes.length > 0 || cachedNotebooks.length > 0) {
      set({
        notes: cachedNotes,
        notebooks: cachedNotebooks,
        tasks: cachedTasks,
        selectedNoteId: cachedNotes[0]?.id ?? null,
      });
    }

    set({ loading: true, appStatus: 'LOADING_BACKEND' });
    try {
      // 1. 检查后端版本（作为可用性检查）
      // 这里的 API 现在已被后端豁免认证，应该始终能通
      const versionData = await api.getSystemVersion();
      set({ appStatus: 'LOADING_FRONTEND' });

      // 2. 并行加载所有数据
      const [notes, notebooks, tasks, modelConfig, trash, userStats, userAchievements, bgmTracks] = await Promise.all([
        api.listNotes(),
        api.listNotebooks(),
        api.listTasks(),
        api.getModelConfig(),
        api.getTrash(),
        api.getUserStats(),
        api.listUserAchievements(),
        api.listBgm(),
      ]);

      // 异步更新缓存
      setCachedData(STORE_NOTES, notes);
      setCachedData(STORE_NOTEBOOKS, notebooks);
      setCachedData(STORE_TASKS, tasks);

      set({
        notes,
        notebooks,
        tasks,
        trash,
        modelConfig,
        userStats,
        userAchievements,
        appVersion: versionData?.version || get().appVersion,
        gitCommit: versionData?.git_commit || 'unknown',
        buildTime: versionData?.build_time || 'unknown',
        exePath: versionData?.executable || 'unknown',
        selectedNoteId: get().selectedNoteId || notes[0]?.id || null,
        assistant: latestAssistantFromSession(get().chatSessions.find((session) => session.id === get().activeChatSessionId)),
        bgm: { ...get().bgm, tracks: bgmTracks },
        appStatus: 'READY'
      });
    } catch (error) {
      console.warn('Network request failed during initialization:', error);
      
      // 如果是 401 错误，或者是由于没有配置 Token 导致的失败
      const isAuthError = error instanceof Error && (error.message.includes('Unauthorized') || error.message.includes('401'));
      
      if (isAuthError) {
        set({ appStatus: 'ERROR' });
        set({ toast: { id: Date.now(), tone: 'error', text: '鉴权失败：请在“设置 -> 模型设置”中配置访问令牌' } });
      } else {
        // 其他网络错误，如果本地有缓存则仍然允许进入 READY
        if (get().notes.length > 0) {
          set({ appStatus: 'READY' });
          set({ toast: { id: Date.now(), tone: 'info', text: '后端连接失败，当前正处于离线/缓存模式。' } });
        } else {
          set({ appStatus: 'ERROR' });
          set({ toast: { id: Date.now(), tone: 'error', text: `初始化失败：${error instanceof Error ? error.message : '网络请求失败'}` } });
        }
      }
    } finally {
      set({ loading: false });
    }
  },
  loadBgmTracks: async () => {
    try {
      const tracks = await api.listBgm();
      set((state) => ({ bgm: { ...state.bgm, tracks } }));
    } catch (error) {
      console.error('Failed to load BGM tracks:', error);
    }
  },
  toggleBgm: () => set((state) => {
    const nextIsPlaying = !state.bgm.isPlaying;
    let nextTrack = state.bgm.currentTrack;
    if (nextIsPlaying && !nextTrack && state.bgm.tracks.length > 0) {
      nextTrack = state.bgm.tracks[0];
    }
    return { bgm: { ...state.bgm, isPlaying: nextIsPlaying, currentTrack: nextTrack } };
  }),
  setBgmVolume: (volume) => set((state) => ({ bgm: { ...state.bgm, volume } })),
  nextTrack: () => set((state) => {
    if (state.bgm.tracks.length === 0) return state;
    const currentIndex = state.bgm.currentTrack ? state.bgm.tracks.indexOf(state.bgm.currentTrack) : -1;
    const nextIndex = (currentIndex + 1) % state.bgm.tracks.length;
    return { bgm: { ...state.bgm, currentTrack: state.bgm.tracks[nextIndex], isPlaying: true } };
  }),
  updateUserTheme: async (theme) => {
    try {
      const userStats = await api.updateUserTheme(theme);
      set({ userStats });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `主题切换失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  updateUserWallpaper: async (wallpaperUrl) => {
    try {
      const userStats = await api.updateUserWallpaper(wallpaperUrl);
      set({ userStats });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `壁纸设置失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  selectNote: (selectedNoteId) => set((state) => ({ selectedNoteId, recentNoteIds: [selectedNoteId, ...state.recentNoteIds.filter((id) => id !== selectedNoteId)].slice(0, 8) })),
  createDraftNote: (notebookId, parentId) => {
    const targetNotebookId = notebookId ?? get().notebooks[0]?.id ?? null;
    // 使用绝对唯一的负数 ID：时间戳(ms) + 6位随机数
    // 负数 ID 仅用于前端草稿标识，转正后会被后端正数 ID 替换
    const draftId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000000));
    const draft: Note = {
      id: draftId,
      title: '未命名笔记',
      icon: '📝',
      content: '<h1></h1><p></p>',
      summary: '新建草稿',
      is_title_manually_edited: false,
      tags: [],
      properties: [],
      links: [],
      notebook_id: targetNotebookId,
      parent_id: parentId ?? null,
      position: 0,
      created_at: new Date().toISOString(),
      is_draft: true,
    };
    set({ notes: [draft, ...get().notes], selectedNoteId: draftId, recentNoteIds: [draftId, ...get().recentNoteIds].slice(0, 8) });
  },
  saveNote: async ({ id, title, content, notebookId, parent_id, icon, is_title_manually_edited, tags, silent }) => {
    set({ isSavingNote: true });
    try {
      const isDraft = typeof id === 'number' && id < 0;
      const note = !id || isDraft
        ? await api.createNote({
            title: title ?? '未命名笔记',
            content: content ?? '',
            notebook_id: notebookId ?? get().notes.find((item) => item.id === id)?.notebook_id ?? get().notebooks[0]?.id ?? null,
            parent_id: parent_id ?? get().notes.find((item) => item.id === id)?.parent_id ?? null,
            icon: icon ?? '📝',
            is_title_manually_edited: is_title_manually_edited ?? false,
            tags,
          })
        : await api.updateNote(id, { 
            title, 
            content, 
            icon, 
            parent_id: parent_id ?? undefined,
            is_title_manually_edited,
            tags
          });
      
      const currentNotes = get().notes;
      
      // 核心修复：状态合并逻辑重构
      // 1. 移除旧的 ID (可能是草稿负数 ID，也可能是旧的正式 ID)
      // 2. 移除任何已经存在的、与后端返回的新 ID 冲突的项
      const filteredNotes = currentNotes.filter((item) => item.id !== id && item.id !== note.id);
      
      // 3. 处理子节点关联：如果父节点从草稿转正，更新所有子节点的 parent_id
      const finalNotes = isDraft && typeof id === 'number'
        ? [note, ...filteredNotes.map(n => n.parent_id === id ? { ...n, parent_id: note.id } : n)]
        : [note, ...filteredNotes];

      // 4. 排序：确保顺序一致性（笔记本内按 position，笔记本间按 ID 或顺序）
      // 这里暂时保持原样，仅在 moveNote 中排序，平时按创建/更新时间倒序（note 已经在最前）

      const currentSelectedId = get().selectedNoteId;
      // 只有在当前选中的正是被保存的笔记，或者是草稿转正时，才更新选中 ID
      const shouldUpdateSelection = (currentSelectedId === id) || isDraft;
      
      // 更新辅助状态
      let recentNoteIds = get().recentNoteIds;
      let selectedNoteIds = get().selectedNoteIds;
      if (isDraft && typeof id === 'number') {
        recentNoteIds = recentNoteIds.map(rid => rid === id ? note.id : rid);
        selectedNoteIds = selectedNoteIds.map(sid => sid === id ? note.id : sid);
      }
      
      set({ 
        notes: finalNotes, 
        selectedNoteId: shouldUpdateSelection ? note.id : currentSelectedId, 
        recentNoteIds,
        selectedNoteIds,
        toast: silent ? get().toast : { id: Date.now(), tone: 'success', text: id && !isDraft ? '笔记已保存。' : '新笔记已创建。' } 
      });

      setCachedData(STORE_NOTES, finalNotes);
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `保存失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    } finally {
      set({ isSavingNote: false });
    }
  },
  updateNoteTags: async (noteId, tags) => {
    try {
      const note = await api.updateNoteTags(noteId, tags);
      set((state) => ({
        notes: state.notes.map((item) => (item.id === note.id ? note : item)),
      }));
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `更新标签失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
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
  moveNote: async (noteId, notebookId, position, parentId) => {
    try {
      const note = await api.moveNote(noteId, { notebook_id: notebookId, position, parent_id: parentId });
      const notes = get().notes.filter((item) => item.id !== noteId);
      const updatedNotes = [...notes, note];
      updatedNotes.sort((a, b) => (a.notebook_id ?? 0) - (b.notebook_id ?? 0) || a.position - b.position);
      set({ 
        notes: updatedNotes, 
        selectedNoteId: note.id, 
        selectedNoteIds: get().selectedNoteIds.filter((id) => id !== noteId), 
        toast: { id: Date.now(), tone: 'success', text: '笔记位置已更新。' } 
      });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `移动笔记失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  toggleNoteSelection: (noteId) => {
    const selected = get().selectedNoteIds;
    set({ selectedNoteIds: selected.includes(noteId) ? selected.filter((id) => id !== noteId) : [...selected, noteId] });
  },
  clearNoteSelection: () => set({ selectedNoteIds: [] }),
  bulkMoveNotes: async (notebookId, parentId) => {
    const noteIds = get().selectedNoteIds;
    if (noteIds.length === 0) return;
    try {
      await api.bulkMoveNotes({ note_ids: noteIds, notebook_id: notebookId, position: 0, parent_id: parentId });
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
      const notesToFilter = new Set<number>(noteIds);
      const findChildren = (pids: number[]) => {
        const nextPids: number[] = [];
        get().notes.forEach(n => {
          if (n.parent_id && pids.includes(n.parent_id) && !notesToFilter.has(n.id)) {
            notesToFilter.add(n.id);
            nextPids.push(n.id);
          }
        });
        if (nextPids.length > 0) findChildren(nextPids);
      };
      findChildren(noteIds);

      const realNoteIds = noteIds.filter(id => id > 0);
      
      if (realNoteIds.length > 0) {
        await api.bulkDeleteNotes({ note_ids: realNoteIds });
      }
      
      const [backendNotes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
      
      // 修复“删除连坐”：在合并后端数据时，保留未被删除的本地草稿
      const localDrafts = get().notes.filter(n => n.id < 0 && !notesToFilter.has(n.id));
      const finalNotes = [...localDrafts, ...backendNotes.filter(n => !notesToFilter.has(n.id))];
      
      set({ notes: finalNotes, trash, selectedNoteIds: [], toast: { id: Date.now(), tone: 'success', text: '已批量移入垃圾桶。' } });
      setCachedData(STORE_NOTES, finalNotes);
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `批量删除失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  deleteNote: async (noteId) => {
    try {
      if (noteId > 0) {
        await api.deleteNote(noteId);
      }
      
      const [backendNotes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
      
      // 简单直观：后端返回什么，前端就显示什么。
      // 后端 repositories.py:192 已经处理了递归软删除，前端不需要重复计算子树。
      // 只有对于负数 ID（尚未持久化的草稿），后端不知道它们，需要前端手动过滤。
      // 修复“删除连坐”：在合并后端数据时，必须保留本地现有的其他草稿（负数 ID）
      const localDrafts = get().notes.filter(n => n.id < 0 && n.id !== noteId);
      const finalNotes = [...localDrafts, ...backendNotes];
      
      set({ 
        notes: finalNotes, 
        trash, 
        selectedNoteId: get().selectedNoteId === noteId ? finalNotes[0]?.id ?? null : get().selectedNoteId, 
        toast: { id: Date.now(), tone: 'success', text: noteId < 0 ? '草稿已移除。' : '笔记已移入垃圾桶。' } 
      });
      setCachedData(STORE_NOTES, finalNotes);
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
  purgeTrash: async () => {
    try {
      await api.purgeTrash();
      const trash = await api.getTrash();
      set({ trash, toast: { id: Date.now(), tone: 'success', text: '回收站已清空。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `清空回收站失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
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
  deleteTask: async (taskId) => {
    try {
      await api.deleteTask(taskId);
      const tasks = await api.listTasks();
      set({ tasks, toast: { id: Date.now(), tone: 'success', text: '任务已废弃。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `废弃任务失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  clearCompletedTasks: async () => {
    try {
      await api.clearCompletedTasks();
      const tasks = await api.listTasks();
      set({ tasks, toast: { id: Date.now(), tone: 'success', text: '已清理完成的任务。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `清理失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
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
  askStreamingAssistant: async (question, mode) => {
    if (mode === 'agent') {
      // For agent mode, use the non-streaming logic to handle task creation and structured response
      return get().askAssistant(question, mode);
    }
    set({ loading: true });
    try {
      const activeId = get().activeChatSessionId;
      const userMessage: ChatMessage = { id: Date.now(), role: 'user', content: question, mode, created_at: new Date().toISOString() };
      
      const assistantMessageId = Date.now() + 1;
      const assistantPlaceholder: ChatMessage = { id: assistantMessageId, role: 'assistant', content: '', mode, created_at: new Date().toISOString() };
      
      const sessionsWithUser = get().chatSessions.map((session) => 
        session.id === activeId 
          ? { 
              ...session, 
              messages: [...session.messages, userMessage, assistantPlaceholder], 
              updated_at: new Date().toISOString(), 
              title: session.messages.length === 0 ? question.slice(0, 16) || '新会话' : session.title 
            } 
          : session
      );
      
      set({ chatSessions: sessionsWithUser });

      let fullContent = '';
      let citations: Citation[] = [];
      let buffer = '';
      let citationsParsed = false;

      await api.streamChat({ question, mode }, (chunk) => {
        if (!citationsParsed && mode === 'rag') {
          buffer += chunk;
          if (buffer.includes('\n')) {
            const firstLine = buffer.slice(0, buffer.indexOf('\n'));
            if (firstLine.startsWith('__CITATIONS__:')) {
              try {
                const jsonStr = firstLine.replace('__CITATIONS__:', '');
                citations = JSON.parse(jsonStr);
                citationsParsed = true;
                const remaining = buffer.slice(buffer.indexOf('\n') + 1);
                fullContent = remaining;
                buffer = ''; // Clear buffer after extraction
              } catch (e) {
                console.error('Failed to parse citations', e);
                fullContent += buffer;
                citationsParsed = true;
                buffer = '';
              }
            } else {
              // Not a citation block
              fullContent += buffer;
              citationsParsed = true;
              buffer = '';
            }
          }
        } else {
          fullContent += chunk;
        }
        
        set((state) => ({
          chatSessions: state.chatSessions.map((s) => 
            s.id === activeId 
              ? {
                  ...s,
                  messages: s.messages.map((m) => m.id === assistantMessageId ? { ...m, content: fullContent, citations: citations.length > 0 ? citations : m.citations } : m)
                }
              : s
          )
        }));
      });

      const finalSessions = get().chatSessions;
      writeStoredChats(finalSessions, activeId);
      set({ assistant: latestAssistantFromSession(finalSessions.find(s => s.id === activeId)) });
      
      if (mode as string === 'agent') {
        const tasks = await api.listTasks();
        set({ tasks });
      }
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
