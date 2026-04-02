import { create } from 'zustand';
import { openDB, type IDBPDatabase } from 'idb';
import { api } from '../lib/api';
import { PRESET_TEMPLATES } from '../lib/templates';
import type {
  AskResponse,
  ChatMessage,
  ChatSession,
  ModelConfig,
  Note,
  NoteSyncStatus,
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
const PRIVATE_TAGS = new Set(['私密', 'private']);
const noteSaveVersions = new Map<number, number>();
const pendingNoteSyncTimers = new Map<number, ReturnType<typeof setTimeout>>();
const pendingNoteSavePayloads = new Map<number, SaveNotePayload>();
const NOTE_SYNC_RETRY_MS = 3000;
let noteSyncOnlineListenerAttached = false;

function collectDescendantIds(notes: Note[], rootId: number): Set<number> {
  const ids = new Set<number>();
  const stack = [rootId];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    notes.forEach((item) => {
      if (item.parent_id === currentId && !ids.has(item.id)) {
        ids.add(item.id);
        stack.push(item.id);
      }
    });
  }
  return ids;
}

function syncSubtreeNotebook(notes: Note[], rootId: number, notebookId: number | null): Note[] {
  const descendantIds = collectDescendantIds(notes, rootId);
  if (descendantIds.size === 0) {
    return notes;
  }
  return notes.map((item) => descendantIds.has(item.id) ? { ...item, notebook_id: notebookId } : item);
}

function mergeSavedNoteIntoList(notes: Note[], savedNote: Note, previousId?: number): Note[] {
  const filteredNotes = notes.filter((item) => item.id !== savedNote.id && item.id !== previousId);
  const reparentedNotes = previousId !== undefined && previousId < 0
    ? filteredNotes.map((item) => item.parent_id === previousId ? { ...item, parent_id: savedNote.id, notebook_id: savedNote.notebook_id } : item)
    : filteredNotes;
  return [savedNote, ...syncSubtreeNotebook(reparentedNotes, savedNote.id, savedNote.notebook_id)];
}

const DB_NAME = 'second-brain-offline';
const STORE_NOTES = 'notes';
const STORE_NOTEBOOKS = 'notebooks';
const STORE_TASKS = 'tasks';
const STORE_CONFIG = 'config';
const PENDING_NOTE_SYNC_QUEUE_ID = 'pending-note-sync-queue';

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

type SaveNotePayload = {
  id?: number;
  title?: string;
  content?: string;
  notebookId?: number | null;
  parent_id?: number | null;
  icon?: string;
  is_title_manually_edited?: boolean;
  tags?: string[];
  silent?: boolean;
};

type PendingNoteSyncQueue = {
  id: string;
  payloads: SaveNotePayload[];
};

type SyncableNote = Note & {
  sync_status?: NoteSyncStatus;
  sync_error?: string | null;
};

function resolveTemplateDraft(templateName?: string | null) {
  const template = templateName ? PRESET_TEMPLATES.find((item) => item.name === templateName) : undefined;
  if (!template) {
    return {
      title: '未命名笔记',
      icon: '📝',
      content: '<h1></h1><p></p>',
      summary: '新建草稿',
    };
  }

  return {
    title: template.name,
    icon: template.icon,
    content: template.content.trim(),
    summary: template.description,
  };
}

function markNoteSyncState(notes: Note[], noteId: number, syncStatus: NoteSyncStatus, syncError: string | null = null): Note[] {
  return notes.map((item) => item.id === noteId ? { ...item, sync_status: syncStatus, sync_error: syncError } : item);
}

function applyPendingSyncState(notes: Note[]): Note[] {
  return notes.map((item) =>
    pendingNoteSavePayloads.has(item.id)
      ? { ...item, sync_status: 'queued', sync_error: null }
      : item
  );
}

function mergeRemoteNotesWithLocalPendingDrafts(remoteNotes: Note[], localNotes: Note[]): Note[] {
  const localDrafts = localNotes.filter((item) => item.id < 0);
  return applyPendingSyncState([...localDrafts, ...remoteNotes]);
}

function getPendingNoteSyncQueue(): PendingNoteSyncQueue {
  return {
    id: PENDING_NOTE_SYNC_QUEUE_ID,
    payloads: Array.from(pendingNoteSavePayloads.values()),
  };
}

async function persistPendingNoteSyncQueue() {
  const payloads = Array.from(pendingNoteSavePayloads.values());
  if (payloads.length === 0) {
    await deleteCachedItem(STORE_CONFIG, PENDING_NOTE_SYNC_QUEUE_ID);
    return;
  }

  await setCachedItem<PendingNoteSyncQueue>(STORE_CONFIG, {
    id: PENDING_NOTE_SYNC_QUEUE_ID,
    payloads,
  });
}

async function hydratePendingNoteSyncQueue(saveNote: (payload: SaveNotePayload) => Promise<void>) {
  const configEntries = await getCachedData<PendingNoteSyncQueue>(STORE_CONFIG);
  const pendingQueue = configEntries.find((item) => item.id === PENDING_NOTE_SYNC_QUEUE_ID);
  if (!pendingQueue?.payloads?.length) {
    return;
  }

  pendingQueue.payloads.forEach((payload) => {
    if (typeof payload.id === 'number') {
      pendingNoteSavePayloads.set(payload.id, { ...payload, silent: true });
    }
  });

  const queuedIds = new Set(
    pendingQueue.payloads
      .map((payload) => payload.id)
      .filter((id): id is number => typeof id === 'number')
  );

  if (queuedIds.size > 0) {
    const queuedNotes = useAppStore.getState().notes.map((item) =>
      queuedIds.has(item.id)
        ? { ...item, sync_status: 'queued' as NoteSyncStatus, sync_error: null }
        : item
    );
    useAppStore.setState({ notes: queuedNotes });
    await setCachedData(STORE_NOTES, queuedNotes);
  }

  replayPendingNoteSyncQueue(saveNote);
}

function promotePendingSave(oldId: number, newId: number) {
  const pendingPayload = pendingNoteSavePayloads.get(oldId);
  if (pendingPayload) {
    pendingNoteSavePayloads.set(newId, { ...pendingPayload, id: newId });
    pendingNoteSavePayloads.delete(oldId);
    void persistPendingNoteSyncQueue();
  }

  const timer = pendingNoteSyncTimers.get(oldId);
  if (timer) {
    pendingNoteSyncTimers.set(newId, timer);
    pendingNoteSyncTimers.delete(oldId);
  }
}

function clearPendingRetry(noteId: number) {
  const timer = pendingNoteSyncTimers.get(noteId);
  if (timer) {
    clearTimeout(timer);
    pendingNoteSyncTimers.delete(noteId);
  }
}

function clearPendingNoteSync(noteIds: number[]) {
  let didChange = false;
  noteIds.forEach((noteId) => {
    clearPendingRetry(noteId);
    if (pendingNoteSavePayloads.delete(noteId)) {
      didChange = true;
    }
    noteSaveVersions.delete(noteId);
  });
  if (didChange) {
    void persistPendingNoteSyncQueue();
  }
}

function queueNoteRetry(noteId: number, saveNote: (payload: SaveNotePayload) => Promise<void>) {
  if (typeof window === 'undefined') {
    return;
  }

  clearPendingRetry(noteId);
  const queuedPayload = pendingNoteSavePayloads.get(noteId);
  if (!queuedPayload) {
    return;
  }

  const queuedNotes = markNoteSyncState(useAppStore.getState().notes, noteId, 'queued', null);
  useAppStore.setState({ notes: queuedNotes });
  void setCachedData(STORE_NOTES, queuedNotes);
  void persistPendingNoteSyncQueue();

  const timer = window.setTimeout(() => {
    pendingNoteSyncTimers.delete(noteId);
    const latestPayload = pendingNoteSavePayloads.get(noteId);
    if (!latestPayload) {
      return;
    }
    void saveNote({ ...latestPayload, silent: true });
  }, NOTE_SYNC_RETRY_MS);

  pendingNoteSyncTimers.set(noteId, timer);
}

function attachNoteSyncRetryOnReconnect(saveNote: (payload: SaveNotePayload) => Promise<void>) {
  if (typeof window === 'undefined' || noteSyncOnlineListenerAttached) {
    return;
  }

  window.addEventListener('online', () => {
    Array.from(pendingNoteSavePayloads.values()).forEach((payload) => {
      void saveNote({ ...payload, silent: true });
    });
  });
  noteSyncOnlineListenerAttached = true;
}

function replayPendingNoteSyncQueue(saveNote: (payload: SaveNotePayload) => Promise<void>) {
  if (typeof window === 'undefined') {
    return;
  }

  Array.from(pendingNoteSavePayloads.values()).forEach((payload) => {
    if (typeof payload.id === 'number') {
      queueNoteRetry(payload.id, saveNote);
    }
  });
}

function buildRetryPayloadFromNote(note: Note): SaveNotePayload {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    notebookId: note.notebook_id,
    parent_id: note.parent_id,
    icon: note.icon,
    is_title_manually_edited: note.is_title_manually_edited,
    tags: note.tags,
    silent: true,
  };
}

function isPrivateNote(note: Note | null | undefined) {
  return !!note?.tags?.some((tag) => PRIVATE_TAGS.has(tag.toLowerCase()));
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
  createDraftNote: (notebookId?: number | null, parentId?: number | null, templateName?: string | null) => void;
  retryPendingNoteSync: (noteId: number) => Promise<void>;
  saveNote: (payload: SaveNotePayload) => Promise<void>;
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
    attachNoteSyncRetryOnReconnect(get().saveNote);
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

    await hydratePendingNoteSyncQueue(get().saveNote);

    set({ loading: true, appStatus: 'LOADING_BACKEND' });
    try {
      // 1. 检查后端版本（作为可用性检查）
      // 这里的 API 现在已被后端豁免认证，应该始终能通
      const versionData = await api.getSystemVersion();
      set({ appStatus: 'LOADING_FRONTEND' });

      // 2. 并行加载所有数据
      const [remoteNotes, notebooks, tasks, modelConfig, trash, userStats, userAchievements, bgmTracks] = await Promise.all([
        api.listNotes(),
        api.listNotebooks(),
        api.listTasks(),
        api.getModelConfig(),
        api.getTrash(),
        api.getUserStats(),
        api.listUserAchievements(),
        api.listBgm(),
      ]);

      const mergedNotes = mergeRemoteNotesWithLocalPendingDrafts(remoteNotes, get().notes);

      // 异步更新缓存
      setCachedData(STORE_NOTES, mergedNotes);
      setCachedData(STORE_NOTEBOOKS, notebooks);
      setCachedData(STORE_TASKS, tasks);

      set({
        notes: mergedNotes,
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
        selectedNoteId: get().selectedNoteId || mergedNotes[0]?.id || null,
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
  createDraftNote: (notebookId, parentId, templateName) => {
    const targetNotebookId = notebookId ?? get().notebooks[0]?.id ?? null;
    const templateDraft = resolveTemplateDraft(templateName);
    // 使用绝对唯一的负数 ID：时间戳(ms) + 6位随机数
    // 负数 ID 仅用于前端草稿标识，转正后会被后端正数 ID 替换
    const draftId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000000));
    const draft: Note = {
      id: draftId,
      title: templateDraft.title,
      icon: templateDraft.icon,
      content: templateDraft.content,
      summary: templateDraft.summary,
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
  retryPendingNoteSync: async (noteId) => {
    const note = get().notes.find((item) => item.id === noteId);
    if (!note) {
      return;
    }

    pendingNoteSavePayloads.set(noteId, buildRetryPayloadFromNote(note));
    void persistPendingNoteSyncQueue();
    clearPendingRetry(noteId);
    const queuedNotes = markNoteSyncState(get().notes, noteId, 'queued', null);
    set({ notes: queuedNotes });
    setCachedData(STORE_NOTES, queuedNotes);
    void get().saveNote({ ...buildRetryPayloadFromNote(note), silent: true });
  },
  saveNote: async ({ id, title, content, notebookId, parent_id, icon, is_title_manually_edited, tags, silent }) => {
    set({ isSavingNote: true });
    let saveTargetId: number | null = null;
    try {
      const isDraft = typeof id === 'number' && id < 0;
      const currentNotes = get().notes;
      const currentNote = typeof id === 'number' ? currentNotes.find((item) => item.id === id) : undefined;

      if (isDraft && !currentNote) {
        return;
      }

      let resolvedParentId = parent_id ?? currentNote?.parent_id ?? null;
      let resolvedNotebookId = notebookId ?? currentNote?.notebook_id ?? get().notebooks[0]?.id ?? null;

      if (typeof resolvedParentId === 'number' && resolvedParentId < 0) {
        const draftParent = currentNotes.find((item) => item.id === resolvedParentId);
        if (draftParent) {
          const previousIds = new Set(get().notes.map((item) => item.id));
          await get().saveNote({
            id: draftParent.id,
            title: draftParent.title,
            content: draftParent.content,
            notebookId: draftParent.notebook_id,
            parent_id: draftParent.parent_id,
            icon: draftParent.icon,
            is_title_manually_edited: draftParent.is_title_manually_edited,
            tags: draftParent.tags,
            silent: true,
          });

          const promotedParent = get().notes.find((item) => !previousIds.has(item.id) && item.id > 0)
            ?? get().notes.find((item) => item.id > 0 && item.content === draftParent.content && item.icon === draftParent.icon && item.parent_id === draftParent.parent_id);

          resolvedParentId = promotedParent?.id ?? null;
          resolvedNotebookId = promotedParent?.notebook_id ?? resolvedNotebookId;
        } else {
          resolvedParentId = null;
        }
      }

      const noteIdForVersion = typeof id === 'number' ? id : Date.now();
      saveTargetId = noteIdForVersion;
      const version = (noteSaveVersions.get(noteIdForVersion) ?? 0) + 1;
      noteSaveVersions.set(noteIdForVersion, version);

      const optimisticBaseNote: SyncableNote = currentNote ?? {
        id: noteIdForVersion,
        title: '未命名笔记',
        icon: '📝',
        content: '<p></p>',
        summary: '',
        is_title_manually_edited: false,
        tags: [],
        properties: [],
        links: [],
        notebook_id: resolvedNotebookId,
        parent_id: resolvedParentId,
        position: 0,
        created_at: new Date().toISOString(),
        is_draft: isDraft,
        sync_status: 'queued',
        sync_error: null,
      };

      const optimisticNote: SyncableNote = {
        ...optimisticBaseNote,
        title: title ?? optimisticBaseNote.title,
        content: content ?? optimisticBaseNote.content,
        icon: icon ?? optimisticBaseNote.icon,
        notebook_id: resolvedNotebookId,
        parent_id: resolvedParentId,
        is_title_manually_edited: is_title_manually_edited ?? optimisticBaseNote.is_title_manually_edited,
        tags: tags ?? optimisticBaseNote.tags,
        sync_status: 'saving',
        sync_error: null,
      };

      pendingNoteSavePayloads.set(noteIdForVersion, {
        id: noteIdForVersion,
        title: optimisticNote.title,
        content: optimisticNote.content,
        notebookId: resolvedNotebookId,
        parent_id: resolvedParentId,
        icon: optimisticNote.icon,
        is_title_manually_edited: optimisticNote.is_title_manually_edited,
        tags: optimisticNote.tags,
        silent: true,
      });
      clearPendingRetry(noteIdForVersion);
      void persistPendingNoteSyncQueue();

      const optimisticNotes = mergeSavedNoteIntoList(get().notes, optimisticNote, typeof id === 'number' ? id : undefined);
      set({
        notes: optimisticNotes,
        selectedNoteId: typeof id === 'number' && get().selectedNoteId === id ? optimisticNote.id : get().selectedNoteId,
        toast: silent ? get().toast : { id: Date.now(), tone: 'success', text: id && !isDraft ? '笔记已保存。' : '新笔记已创建。' }
      });
      setCachedData(STORE_NOTES, optimisticNotes);

      const savedNote = !id || isDraft
        ? await api.createNote({
            title: optimisticNote.title,
            content: optimisticNote.content,
            notebook_id: resolvedNotebookId,
            parent_id: resolvedParentId,
            icon: optimisticNote.icon,
            is_title_manually_edited: optimisticNote.is_title_manually_edited,
            tags: optimisticNote.tags,
          })
        : await api.updateNote(id, {
            title: optimisticNote.title,
            content: optimisticNote.content,
            icon: optimisticNote.icon,
            parent_id: resolvedParentId,
            is_title_manually_edited: optimisticNote.is_title_manually_edited,
            tags: optimisticNote.tags
          });

      if ((noteSaveVersions.get(noteIdForVersion) ?? 0) !== version) {
        return;
      }

      if (isDraft && typeof id === 'number') {
        noteSaveVersions.set(savedNote.id, version);
        noteSaveVersions.delete(id);
        promotePendingSave(id, savedNote.id);
      }

      pendingNoteSavePayloads.delete(savedNote.id);
      pendingNoteSavePayloads.delete(noteIdForVersion);
      clearPendingRetry(savedNote.id);
      clearPendingRetry(noteIdForVersion);
      void persistPendingNoteSyncQueue();
      saveTargetId = savedNote.id;

      const syncedNote: SyncableNote = {
        ...savedNote,
        sync_status: 'synced',
        sync_error: null,
      };
      const finalNotes = mergeSavedNoteIntoList(get().notes, syncedNote, typeof id === 'number' ? id : undefined);
      const currentSelectedId = get().selectedNoteId;
      const shouldUpdateSelection = currentSelectedId === id || currentSelectedId === optimisticNote.id;

      let recentNoteIds = get().recentNoteIds;
      let selectedNoteIds = get().selectedNoteIds;
      if (isDraft && typeof id === 'number') {
        recentNoteIds = recentNoteIds.map((rid) => rid === id ? savedNote.id : rid);
        selectedNoteIds = selectedNoteIds.map((sid) => sid === id ? savedNote.id : sid);
      }

      set({
        notes: finalNotes,
        selectedNoteId: shouldUpdateSelection ? savedNote.id : currentSelectedId,
        recentNoteIds,
        selectedNoteIds,
        toast: silent ? get().toast : { id: Date.now(), tone: 'success', text: id && !isDraft ? '笔记已保存。' : '新笔记已创建。' }
      });

      setCachedData(STORE_NOTES, finalNotes);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '请稍后重试';
      const failedNoteId = saveTargetId ?? (typeof id === 'number' ? id : null);

      if (failedNoteId !== null) {
        const queuedNotes = markNoteSyncState(get().notes, failedNoteId, 'error', errorMessage);
        set({ notes: queuedNotes, toast: { id: Date.now(), tone: 'error', text: `保存失败：${errorMessage}` } });
        setCachedData(STORE_NOTES, queuedNotes);
        queueNoteRetry(failedNoteId, get().saveNote);
      } else {
        set({ toast: { id: Date.now(), tone: 'error', text: `保存失败：${errorMessage}` } });
      }
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
      setCachedData(STORE_NOTEBOOKS, notebooks);
      setCachedData(STORE_NOTES, notes);
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `删除笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  restoreNotebook: async (notebookId) => {
    try {
      await api.restoreNotebook(notebookId);
      const [notebooks, notes, trash] = await Promise.all([api.listNotebooks(), api.listNotes(), api.getTrash()]);
      set({ notebooks, notes, trash, toast: { id: Date.now(), tone: 'success', text: '笔记本已恢复。' } });
      setCachedData(STORE_NOTEBOOKS, notebooks);
      setCachedData(STORE_NOTES, notes);
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `恢复笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  purgeNotebook: async (notebookId) => {
    try {
      await api.purgeNotebook(notebookId);
      const [notebooks, notes, trash] = await Promise.all([api.listNotebooks(), api.listNotes(), api.getTrash()]);
      set({ notebooks, notes, trash, toast: { id: Date.now(), tone: 'success', text: '笔记本已永久删除。' } });
      setCachedData(STORE_NOTEBOOKS, notebooks);
      setCachedData(STORE_NOTES, notes);
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `永久删除笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  moveNote: async (noteId, notebookId, position, parentId) => {
    try {
      const note = await api.moveNote(noteId, { notebook_id: notebookId, position, parent_id: parentId });
      const notes = get().notes.filter((item) => item.id !== noteId);
      const updatedNotes = [...notes, note].map((item) => item.parent_id === note.id ? { ...item, notebook_id: note.notebook_id } : item);
      updatedNotes.sort((a, b) => (a.notebook_id ?? 0) - (b.notebook_id ?? 0) || ((a.parent_id ?? 0) - (b.parent_id ?? 0)) || a.position - b.position);
      set({
        notes: updatedNotes,
        selectedNoteId: note.id,
        selectedNoteIds: get().selectedNoteIds.filter((id) => id !== noteId),
        toast: { id: Date.now(), tone: 'success', text: '笔记位置已更新。' }
      });
      setCachedData(STORE_NOTES, updatedNotes);
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
      setCachedData(STORE_NOTES, notes);
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
        clearPendingNoteSync(Array.from(notesToFilter));
        await api.bulkDeleteNotes({ note_ids: realNoteIds });
        const [backendNotes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
        const localDrafts = get().notes.filter(n => n.id < 0 && !notesToFilter.has(n.id));
        const finalNotes = [...localDrafts, ...backendNotes.filter(n => !notesToFilter.has(n.id))];
        const currentSelectedId = get().selectedNoteId;
        const nextSelectedId = currentSelectedId && notesToFilter.has(currentSelectedId) ? (finalNotes[0]?.id ?? null) : currentSelectedId;

        set({ notes: finalNotes, trash, selectedNoteIds: [], selectedNoteId: nextSelectedId, toast: { id: Date.now(), tone: 'success', text: '已批量移入垃圾桶。' } });
        setCachedData(STORE_NOTES, finalNotes);
      } else {
        clearPendingNoteSync(Array.from(notesToFilter));
        const finalNotes = get().notes.filter(n => !notesToFilter.has(n.id));
        const currentSelectedId = get().selectedNoteId;
        const nextSelectedId = currentSelectedId && notesToFilter.has(currentSelectedId) ? (finalNotes[0]?.id ?? null) : currentSelectedId;
        set({ notes: finalNotes, selectedNoteIds: [], selectedNoteId: nextSelectedId, toast: { id: Date.now(), tone: 'success', text: '草稿已批量移除。' } });
        setCachedData(STORE_NOTES, finalNotes);
      }
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `批量删除失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  deleteNote: async (noteId) => {
    try {
      const getDescendantDraftIds = (parentId: number, notes: Note[]): number[] => {
        const children = notes.filter(n => n.parent_id === parentId && n.id < 0);
        let ids = children.map(c => c.id);
        for (const child of children) {
          ids = [...ids, ...getDescendantDraftIds(child.id, notes)];
        }
        return ids;
      };

      if (noteId < 0) {
        // Purely local draft deletion
        const allNotes = get().notes;
        const idsToRemove = new Set([noteId, ...getDescendantDraftIds(noteId, allNotes)]);

        clearPendingNoteSync(Array.from(idsToRemove));
        const finalNotes = allNotes.filter(n => !idsToRemove.has(n.id));
        const currentSelectedId = get().selectedNoteId;
        const nextSelectedId = currentSelectedId && idsToRemove.has(currentSelectedId) ? (finalNotes[0]?.id ?? null) : currentSelectedId;
        set({
          notes: finalNotes,
          selectedNoteId: nextSelectedId,
          selectedNoteIds: get().selectedNoteIds.filter((id) => !idsToRemove.has(id)),
          toast: { id: Date.now(), tone: 'success', text: '草稿已移除。' }
        });
        setCachedData(STORE_NOTES, finalNotes);
        return;
      }

      clearPendingNoteSync([noteId]);
      await api.deleteNote(noteId);

      const [backendNotes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);

      const allNotes = get().notes;
      const descendantIds = collectDescendantIds(allNotes, noteId);
      const draftIdsToRemove = new Set(Array.from(descendantIds).filter((id) => id < 0));
      clearPendingNoteSync([noteId, ...Array.from(descendantIds)]);

      const localDrafts = allNotes.filter(n => n.id < 0 && n.id !== noteId && !draftIdsToRemove.has(n.id));
      const finalNotes = [...localDrafts, ...backendNotes];
      const remainingIds = new Set(finalNotes.map((item) => item.id));
      const currentSelectedId = get().selectedNoteId;
      const nextSelectedId = currentSelectedId && !remainingIds.has(currentSelectedId) ? (finalNotes[0]?.id ?? null) : currentSelectedId;

      set({
        notes: finalNotes,
        trash,
        selectedNoteId: nextSelectedId,
        selectedNoteIds: get().selectedNoteIds.filter((id) => remainingIds.has(id)),
        toast: { id: Date.now(), tone: 'success', text: '笔记已移入垃圾桶。' }
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
      setCachedData(STORE_NOTES, notes);
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
    const selectedNote = get().notes.find((note) => note.id === get().selectedNoteId);
    if ((mode === 'rag' || mode === 'agent') && isPrivateNote(selectedNote)) {
      set({ toast: { id: Date.now(), tone: 'info', text: '私密笔记当前不会进入知识库检索或智能体上下文。' } });
      return;
    }
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
    const selectedNote = get().notes.find((note) => note.id === get().selectedNoteId);
    if (mode === 'rag' && isPrivateNote(selectedNote)) {
      set({ toast: { id: Date.now(), tone: 'info', text: '私密笔记当前不会进入知识库检索上下文。' } });
      return;
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
