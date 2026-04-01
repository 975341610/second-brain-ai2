import { create } from 'zustand';
import { api } from '../lib/api';
import type {
  AppInfo,
  AskResponse,
  ChatMessage,
  ChatSession,
  HomeLayoutItem,
  ModelConfig,
  Note,
  NoteTemplate,
  Notebook,
  PluginManifest,
  PrivateVaultStatus,
  Task,
  TimelineItem,
  ToastMessage,
  TrashState,
  UpdateAvailability,
  UpdateState,
  WorkspaceSettingsData,
} from '../lib/types';
import { DEFAULT_CUSTOM_THEME, DEFAULT_HOME_LAYOUT, DEFAULT_WORKSPACE_SETTINGS, HOME_BOARD_IDS } from '../lib/types';

type StoredChatState = {
  sessions: ChatSession[];
  activeSessionId: string | null;
};

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

type SaveNotePayload = {
  id?: number;
  title: string;
  content: string;
  notebookId?: number | null;
  parentId?: number | null;
  icon?: string;
  silent?: boolean;
  noteType?: string;
  templateId?: number | null;
  isPrivate?: boolean;
  journalDate?: string | null;
  periodType?: string | null;
  startAt?: string | null;
  endAt?: string | null;
};

type JournalPeriodType = 'daily' | 'weekly' | 'monthly';

function createSession(title = '新会话'): ChatSession {
  return { id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, messages: [], updated_at: new Date().toISOString() };
}

function readStoredChats(): StoredChatState {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('second-brain-chat-sessions');
    } catch {
      // ignore storage cleanup errors
    }
  }
  const session = createSession();
  return { sessions: [session], activeSessionId: session.id };
}

function writeStoredChats(_sessions: ChatSession[], _activeSessionId: string | null) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('second-brain-chat-sessions');
    } catch {
      // ignore storage cleanup errors
    }
  }
}

function freshChatState(): StoredChatState {
  const session = createSession();
  return { sessions: [session], activeSessionId: session.id };
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

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) =>
    (a.notebook_id ?? 0) - (b.notebook_id ?? 0)
    || (a.parent_id ?? 0) - (b.parent_id ?? 0)
    || a.position - b.position
    || (a.path ?? '').localeCompare(b.path ?? '')
    || a.id - b.id,
  );
}

function upsertNote(notes: Note[], note: Note, originalId?: number): Note[] {
  const nextNotes = notes.filter((item) => item.id !== originalId && item.id !== note.id);
  nextNotes.push(note);
  return sortNotes(nextNotes);
}

function visibleRecentIds(notes: Note[], recentIds: number[]): number[] {
  const visibleIds = new Set(notes.filter((note) => !note.is_private).map((note) => note.id));
  return recentIds.filter((id) => visibleIds.has(id)).slice(0, 8);
}

function normalizeHomeLayout(value: unknown): HomeLayoutItem[] {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const normalized = entries
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const rawId = String((item as { id?: unknown }).id || '');
      if (!HOME_BOARD_IDS.includes(rawId as HomeLayoutItem['id'])) return null;
      if (seen.has(rawId)) return null;
      seen.add(rawId);
      return { id: rawId as HomeLayoutItem['id'], visible: (item as { visible?: unknown }).visible !== false };
    })
    .filter(Boolean) as HomeLayoutItem[];
  for (const id of HOME_BOARD_IDS) {
    if (!seen.has(id)) normalized.push({ id, visible: true });
  }
  return normalized;
}

function normalizeCustomTheme(value: unknown): WorkspaceSettingsData['custom_theme'] {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    paper: typeof source.paper === 'string' && source.paper.trim() ? source.paper : DEFAULT_CUSTOM_THEME.paper,
    panel_bg: typeof source.panel_bg === 'string' && source.panel_bg.trim() ? source.panel_bg : DEFAULT_CUSTOM_THEME.panel_bg,
    surface_bg: typeof source.surface_bg === 'string' && source.surface_bg.trim() ? source.surface_bg : DEFAULT_CUSTOM_THEME.surface_bg,
    border_color: typeof source.border_color === 'string' && source.border_color.trim() ? source.border_color : DEFAULT_CUSTOM_THEME.border_color,
    text_primary: typeof source.text_primary === 'string' && source.text_primary.trim() ? source.text_primary : DEFAULT_CUSTOM_THEME.text_primary,
    text_secondary: typeof source.text_secondary === 'string' && source.text_secondary.trim() ? source.text_secondary : DEFAULT_CUSTOM_THEME.text_secondary,
    text_muted: typeof source.text_muted === 'string' && source.text_muted.trim() ? source.text_muted : DEFAULT_CUSTOM_THEME.text_muted,
    accent_strong: typeof source.accent_strong === 'string' && source.accent_strong.trim() ? source.accent_strong : DEFAULT_CUSTOM_THEME.accent_strong,
    accent_contrast: typeof source.accent_contrast === 'string' && source.accent_contrast.trim() ? source.accent_contrast : DEFAULT_CUSTOM_THEME.accent_contrast,
  };
}

function normalizeWorkspaceSettings(data: Record<string, unknown> | undefined): WorkspaceSettingsData {
  return {
    theme_name: typeof data?.theme_name === 'string' && data.theme_name.trim() ? data.theme_name : DEFAULT_WORKSPACE_SETTINGS.theme_name,
    theme_mode: data?.theme_mode === 'forest' || data?.theme_mode === 'night' || data?.theme_mode === 'custom' ? data.theme_mode : DEFAULT_WORKSPACE_SETTINGS.theme_mode,
    wallpaper: data?.wallpaper === 'mouse-parallax' || data?.wallpaper === 'time-shift' ? data.wallpaper : DEFAULT_WORKSPACE_SETTINGS.wallpaper,
    font_mode: data?.font_mode === 'serif' || data?.font_mode === 'mono' ? data.font_mode : DEFAULT_WORKSPACE_SETTINGS.font_mode,
    motion_mode: data?.motion_mode === 'vivid' || data?.motion_mode === 'off' ? data.motion_mode : DEFAULT_WORKSPACE_SETTINGS.motion_mode,
    density: data?.density === 'compact' ? 'compact' : DEFAULT_WORKSPACE_SETTINGS.density,
    home_layout: normalizeHomeLayout(data?.home_layout),
    custom_theme: normalizeCustomTheme(data?.custom_theme),
    enabled_plugins: normalizeStringArray(data?.enabled_plugins),
  };
}

const initialChats = readStoredChats();

const defaultAppInfo: AppInfo = {
  name: 'Second Brain AI',
  version: '',
  repository: '',
  api_prefix: '/api',
  runtime_root: '',
  workspace_path: '',
  update_staging_path: '',
  plugin_packages_path: '',
  theme_assets_path: '',
};

const defaultModelConfig: ModelConfig = {
  provider: 'openclaw',
  api_key: '',
  base_url: 'https://api.openclaw.ai/v1',
  model_name: 'glm-4.7-flash',
};

const defaultPrivateVault: PrivateVaultStatus = {
  configured: false,
  unlocked: false,
};

const defaultUpdateState: UpdateState = {
  channel: 'stable',
  current_version: '',
  staged_version: null,
  package_path: null,
  package_kind: null,
  manifest: {},
  status: 'idle',
  last_error: '',
  updated_at: new Date(0).toISOString(),
};

const defaultUpdateAvailability: UpdateAvailability = {
  current_version: '',
  latest_version: '',
  update_available: false,
  release_url: '',
  manifest_url: '',
  published_at: '',
  release_name: '',
  release_notes: '',
  packages: [],
};

type AppState = {
  appInfo: AppInfo;
  notes: Note[];
  notebooks: Notebook[];
  trash: TrashState;
  selectedNoteIds: number[];
  tasks: Task[];
  templates: NoteTemplate[];
  plugins: PluginManifest[];
  timelineItems: TimelineItem[];
  workspaceSettings: WorkspaceSettingsData;
  privateVault: PrivateVaultStatus;
  updateState: UpdateState;
  updateAvailability: UpdateAvailability;
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
  refreshTimeline: () => Promise<void>;
  refreshUpdateState: () => Promise<void>;
  checkUpdateAvailability: () => Promise<void>;
  uploadOfflineUpdate: (file: File) => Promise<void>;
  selectNote: (noteId: number) => void;
  createDraftNote: (notebookId?: number | null, parentId?: number | null) => void;
  createJournalNote: (periodType: JournalPeriodType, payload?: { notebookId?: number | null; parentId?: number | null; isPrivate?: boolean }) => Promise<void>;
  createNoteFromTemplate: (templateId: number, payload?: { notebookId?: number | null; parentId?: number | null; title?: string; isPrivate?: boolean; journalDate?: string | null; periodType?: string | null; startAt?: string | null; endAt?: string | null }) => Promise<void>;
  saveTemplate: (payload: { id?: number; name: string; description?: string; icon?: string; note_type?: string; default_title?: string; default_content?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  deleteTemplate: (templateId: number) => Promise<void>;
  saveNote: (payload: SaveNotePayload) => Promise<void>;
  createNotebook: (name: string) => Promise<void>;
  updateNotebook: (notebookId: number, payload: { name?: string; icon?: string }) => Promise<void>;
  deleteNotebook: (notebookId: number) => Promise<void>;
  restoreNotebook: (notebookId: number) => Promise<void>;
  purgeNotebook: (notebookId: number) => Promise<void>;
  moveNote: (noteId: number, notebookId: number | null, position: number, parentId?: number | null) => Promise<void>;
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
  updateWorkspaceSettings: (payload: Record<string, unknown>) => Promise<void>;
  unlockPrivateVault: (passphrase: string) => Promise<void>;
  lockPrivateVault: () => Promise<void>;
  stageUpdatePackage: (payload: { current_version?: string; staged_version?: string; package_path?: string; package_kind?: string; status?: string; manifest?: Record<string, unknown> }) => Promise<void>;
  applyUpdatePackage: () => Promise<void>;
  rollbackUpdatePackage: () => Promise<void>;
  startNewChat: () => void;
  setActiveChatSession: (sessionId: string) => void;
  clearActiveChat: () => void;
  renameChatSession: (sessionId: string, title: string) => void;
  deleteChatSession: (sessionId: string) => void;
  notify: (message: string) => void;
  clearToast: () => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  appInfo: defaultAppInfo,
  notes: [],
  notebooks: [],
  trash: { notes: [], notebooks: [] },
  selectedNoteIds: [],
  tasks: [],
  templates: [],
  plugins: [],
  timelineItems: [],
  workspaceSettings: DEFAULT_WORKSPACE_SETTINGS,
  privateVault: defaultPrivateVault,
  updateState: defaultUpdateState,
  updateAvailability: defaultUpdateAvailability,
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
      const [appInfo, notes, notebooks, tasks, modelConfig, trash, templates, plugins, timelineItems, workspaceSettings, privateVault, updateState] = await Promise.all([
        api.getAppInfo(),
        api.listNotes(),
        api.listNotebooks(),
        api.listTasks(),
        api.getModelConfig(),
        api.getTrash(),
        api.listTemplates(),
        api.listPlugins(),
        api.getTimeline(),
        api.getWorkspaceSettings(),
        api.getPrivateVaultStatus(),
        api.getUpdateState(),
      ]);
      const sortedNotes = sortNotes(notes);
      const safeSelected = sortedNotes.find((note) => !note.is_private)?.id ?? sortedNotes[0]?.id ?? null;
      const normalizedWorkspaceSettings = normalizeWorkspaceSettings(workspaceSettings.data);
      set({
        appInfo,
        notes: sortedNotes,
        notebooks,
        tasks,
        trash,
        templates,
        plugins,
        timelineItems,
        workspaceSettings: normalizedWorkspaceSettings,
        privateVault,
        updateState,
        updateAvailability: { ...get().updateAvailability, current_version: updateState.current_version || appInfo.version },
        modelConfig,
        selectedNoteId: get().selectedNoteId && sortedNotes.some((item) => item.id === get().selectedNoteId) ? get().selectedNoteId : safeSelected,
        recentNoteIds: visibleRecentIds(sortedNotes, get().recentNoteIds),
        assistant: latestAssistantFromSession(get().chatSessions.find((session) => session.id === get().activeChatSessionId)),
      });
      void get().checkUpdateAvailability();
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `初始化失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    } finally {
      set({ loading: false });
    }
  },
  refreshTimeline: async () => {
    try {
      const timelineItems = await api.getTimeline();
      set({ timelineItems });
    } catch {
      // ignore background refresh errors
    }
  },
  refreshUpdateState: async () => {
    try {
      const updateState = await api.getUpdateState();
      set((state) => ({ updateState, updateAvailability: { ...state.updateAvailability, current_version: updateState.current_version || state.appInfo.version } }));
    } catch {
      // ignore background refresh errors
    }
  },
  checkUpdateAvailability: async () => {
    try {
      const updateAvailability = await api.checkUpdateAvailability();
      set((state) => ({ updateAvailability: { ...updateAvailability, current_version: updateAvailability.current_version || state.updateState.current_version || state.appInfo.version } }));
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `检查更新失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  uploadOfflineUpdate: async (file) => {
    try {
      const updateState = await api.uploadOfflineUpdate(file);
      set((state) => ({ updateState, updateAvailability: { ...state.updateAvailability, current_version: updateState.current_version || state.appInfo.version }, toast: { id: Date.now(), tone: 'success', text: '更新包已上传。' } }));
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `更新包上传失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  selectNote: (selectedNoteId) => set((state) => {
    const note = state.notes.find((item) => item.id === selectedNoteId);
    const recentNoteIds = note && !note.is_private
      ? [selectedNoteId, ...state.recentNoteIds.filter((id) => id !== selectedNoteId)].slice(0, 8)
      : state.recentNoteIds;
    return { selectedNoteId, recentNoteIds };
  }),
  createDraftNote: (notebookId, parentId = null) => {
    const parent = parentId ? get().notes.find((item) => item.id === parentId) : null;
    const targetNotebookId = notebookId ?? parent?.notebook_id ?? get().notebooks[0]?.id ?? null;
    const siblingCount = get().notes.filter((item) => !item.deleted_at && item.notebook_id === targetNotebookId && (item.parent_id ?? null) === parentId).length;
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
      position: siblingCount + 1,
      created_at: new Date().toISOString(),
      is_draft: true,
      parent_id: parentId,
      path: parent?.path ? `${parent.path}/draft-${Math.abs(draftId)}` : `draft-${Math.abs(draftId)}`,
      revision: '',
      children_count: 0,
      is_folder: true,
      note_type: 'note',
      template_id: null,
      is_private: false,
      journal_date: null,
      period_type: null,
      start_at: null,
      end_at: null,
      private_unlocked: true,
    };
    set({ notes: upsertNote(get().notes, draft), selectedNoteId: draftId });
  },
  createJournalNote: async (periodType, payload) => {
    try {
      const note = await api.createJournalNote({
        period_type: periodType,
        notebook_id: payload?.notebookId,
        parent_id: payload?.parentId,
        is_private: payload?.isPrivate ?? false,
      });
      const [timelineItems, notes] = await Promise.all([api.getTimeline(), api.listNotes()]);
      set({
        notes: sortNotes(notes),
        timelineItems,
        selectedNoteId: note.id,
        toast: { id: Date.now(), tone: 'success', text: `已打开${periodType === 'daily' ? '今日日志' : periodType === 'weekly' ? '本周周记' : '本月月记'}。` },
      });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `创建 journal 失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  createNoteFromTemplate: async (templateId, payload) => {
    try {
      const note = await api.createNoteFromTemplate(templateId, {
        title: payload?.title,
        notebook_id: payload?.notebookId,
        parent_id: payload?.parentId,
        is_private: payload?.isPrivate,
        journal_date: payload?.journalDate,
        period_type: payload?.periodType,
        start_at: payload?.startAt,
        end_at: payload?.endAt,
      });
      const [timelineItems, notes] = await Promise.all([api.getTimeline(), api.listNotes()]);
      set({
        notes: sortNotes(notes),
        timelineItems,
        selectedNoteId: note.id,
        toast: { id: Date.now(), tone: 'success', text: '已通过模板创建笔记。' },
      });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `模板创建失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  saveTemplate: async (payload) => {
    try {
      const template = payload.id
        ? await api.updateTemplate(payload.id, payload)
        : await api.createTemplate(payload);
      const templates = payload.id
        ? get().templates.map((item) => item.id === template.id ? template : item)
        : [template, ...get().templates];
      set({ templates, toast: { id: Date.now(), tone: 'success', text: payload.id ? '模板已更新。' : '模板已创建。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `模板保存失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  deleteTemplate: async (templateId) => {
    try {
      await api.deleteTemplate(templateId);
      set({ templates: get().templates.filter((item) => item.id !== templateId), toast: { id: Date.now(), tone: 'success', text: '模板已删除。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `模板删除失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  saveNote: async ({ id, title, content, notebookId, parentId, icon, silent, noteType, templateId, isPrivate, journalDate, periodType, startAt, endAt }) => {
    set({ isSavingNote: true });
    try {
      const isDraft = typeof id === 'number' && id < 0;
      const existingNote = typeof id === 'number' ? get().notes.find((item) => item.id === id) : undefined;
      const note = !id || isDraft
        ? await api.createNote({
            title,
            content,
            notebook_id: notebookId ?? existingNote?.notebook_id ?? get().notebooks[0]?.id ?? null,
            parent_id: parentId ?? existingNote?.parent_id ?? null,
            icon,
            note_type: noteType ?? existingNote?.note_type ?? 'note',
            template_id: templateId ?? existingNote?.template_id ?? null,
            is_private: isPrivate ?? existingNote?.is_private ?? false,
            journal_date: journalDate ?? existingNote?.journal_date ?? null,
            period_type: periodType ?? existingNote?.period_type ?? null,
            start_at: startAt ?? existingNote?.start_at ?? null,
            end_at: endAt ?? existingNote?.end_at ?? null,
          })
        : await api.updateNote(id, {
            title,
            content,
            icon,
            note_type: noteType,
            template_id: templateId,
            is_private: isPrivate,
            journal_date: journalDate,
            period_type: periodType,
            start_at: startAt,
            end_at: endAt,
          });
      const notes = upsertNote(get().notes, note, id);
      const recentNoteIds = note.is_private ? get().recentNoteIds.filter((item) => item !== note.id) : [note.id, ...get().recentNoteIds.filter((item) => item !== note.id)].slice(0, 8);
      set({
        notes,
        recentNoteIds,
        selectedNoteId: note.id,
        toast: silent ? get().toast : { id: Date.now(), tone: 'success', text: id && !isDraft ? '笔记已保存。' : '新笔记已创建。' },
      });
      void get().refreshTimeline();
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
      set({ notebooks, notes: sortNotes(notes), trash, toast: { id: Date.now(), tone: 'success', text: '笔记本已移入垃圾桶。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `删除笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  restoreNotebook: async (notebookId) => {
    try {
      await api.restoreNotebook(notebookId);
      const [notebooks, notes, trash] = await Promise.all([api.listNotebooks(), api.listNotes(), api.getTrash()]);
      set({ notebooks, notes: sortNotes(notes), trash, toast: { id: Date.now(), tone: 'success', text: '笔记本已恢复。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `恢复笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  purgeNotebook: async (notebookId) => {
    try {
      await api.purgeNotebook(notebookId);
      const [notebooks, notes, trash] = await Promise.all([api.listNotebooks(), api.listNotes(), api.getTrash()]);
      set({ notebooks, notes: sortNotes(notes), trash, toast: { id: Date.now(), tone: 'success', text: '笔记本已永久删除。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `永久删除笔记本失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  moveNote: async (noteId, notebookId, position, parentId = null) => {
    try {
      const note = await api.moveNote(noteId, { notebook_id: notebookId, position, parent_id: parentId });
      set({
        notes: upsertNote(get().notes, note, noteId),
        selectedNoteId: note.id,
        selectedNoteIds: get().selectedNoteIds.filter((id) => id !== noteId),
        toast: { id: Date.now(), tone: 'success', text: '笔记位置已更新。' },
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
  bulkMoveNotes: async (notebookId) => {
    const noteIds = get().selectedNoteIds;
    if (noteIds.length === 0) return;
    try {
      await api.bulkMoveNotes({ note_ids: noteIds, notebook_id: notebookId, position: 0 });
      const notes = await api.listNotes();
      set({ notes: sortNotes(notes), selectedNoteIds: [], toast: { id: Date.now(), tone: 'success', text: '已批量移动笔记。' } });
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
      set({ notes: sortNotes(notes), trash, selectedNoteIds: [], toast: { id: Date.now(), tone: 'success', text: '已批量移入垃圾桶。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `批量删除失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  deleteNote: async (noteId) => {
    try {
      await api.deleteNote(noteId);
      const [notes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
      set({ notes: sortNotes(notes), trash, selectedNoteId: get().selectedNoteId === noteId ? notes.find((item) => !item.is_private)?.id ?? notes[0]?.id ?? null : get().selectedNoteId, toast: { id: Date.now(), tone: 'success', text: '笔记已移入垃圾桶。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `删除笔记失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  restoreNote: async (noteId) => {
    try {
      await api.restoreNote(noteId);
      const [notes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
      set({ notes: sortNotes(notes), trash, toast: { id: Date.now(), tone: 'success', text: '笔记已恢复。' } });
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
      const [tasks, timelineItems] = await Promise.all([api.listTasks(), api.getTimeline()]);
      set({ tasks, timelineItems, toast: { id: Date.now(), tone: 'success', text: '任务已添加。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `创建任务失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  updateTaskStatus: async (taskId, status) => {
    try {
      await api.updateTask(taskId, { status });
      const [tasks, timelineItems] = await Promise.all([api.listTasks(), api.getTimeline()]);
      set({
        tasks,
        timelineItems,
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
      const shouldPersistSession = mode !== 'agent' && !get().privateVault.unlocked;
      const userMessage: ChatMessage = { id: Date.now(), role: 'user', content: question, mode, created_at: new Date().toISOString() };
      const sessionsWithUser = get().chatSessions.map((session) => session.id === activeId ? { ...session, messages: [...session.messages, userMessage], updated_at: new Date().toISOString(), title: session.messages.length === 0 ? question.slice(0, 16) || '新会话' : session.title } : session);
      if (shouldPersistSession) writeStoredChats(sessionsWithUser, activeId);
      set({ chatSessions: sessionsWithUser });
      const assistant = await api.ask({ question, mode });
      const tasks = mode === 'agent' ? await api.listTasks() : get().tasks;
      const assistantMessage: ChatMessage = { id: Date.now() + 1, role: 'assistant', content: assistant.answer, citations: assistant.citations, mode: assistant.mode as 'chat' | 'rag' | 'agent', created_at: new Date().toISOString() };
      const updatedSessions = get().chatSessions.map((session) => session.id === activeId ? { ...session, messages: [...session.messages, assistantMessage], updated_at: new Date().toISOString() } : session);
      if (shouldPersistSession) writeStoredChats(updatedSessions, activeId);
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
      set({ notes: sortNotes(notes), selectedNoteId: notes.find((item) => !item.is_private)?.id ?? notes[0]?.id ?? null, toast: { id: Date.now(), tone: 'success', text: `已导入 ${files.length} 个文件。` } });
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
  updateWorkspaceSettings: async (payload) => {
    try {
      const normalizedPayload = normalizeWorkspaceSettings(payload);
      const workspaceSettings = await api.updateWorkspaceSettings(normalizedPayload);
      set({ workspaceSettings: normalizeWorkspaceSettings(workspaceSettings.data as Record<string, unknown>), toast: { id: Date.now(), tone: 'success', text: '工作区设置已保存。' } });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `工作区设置保存失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  unlockPrivateVault: async (passphrase) => {
    try {
      const privateVault = await api.unlockPrivateVault(passphrase);
      const [notes, trash] = await Promise.all([api.listNotes(), api.getTrash()]);
      const chatState = freshChatState();
      writeStoredChats(chatState.sessions, chatState.activeSessionId);
      set({
        privateVault,
        notes: sortNotes(notes),
        trash,
        chatSessions: chatState.sessions,
        activeChatSessionId: chatState.activeSessionId || chatState.sessions[0].id,
        assistant: null,
        toast: { id: Date.now(), tone: 'success', text: privateVault.configured ? '私密笔记已解锁。' : '私密保险箱已初始化。' },
      });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `解锁失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  lockPrivateVault: async () => {
    try {
      const privateVault = await api.lockPrivateVault();
      const notes = await api.listNotes();
      const selected = get().selectedNoteId ? notes.find((item) => item.id === get().selectedNoteId) : null;
      const chatState = freshChatState();
      writeStoredChats(chatState.sessions, chatState.activeSessionId);
      set({
        privateVault,
        notes: sortNotes(notes),
        selectedNoteId: selected?.is_private ? notes.find((item) => !item.is_private)?.id ?? null : get().selectedNoteId,
        chatSessions: chatState.sessions,
        activeChatSessionId: chatState.activeSessionId || chatState.sessions[0].id,
        assistant: null,
        toast: { id: Date.now(), tone: 'success', text: '私密笔记已锁定。' },
      });
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `锁定失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  stageUpdatePackage: async (payload) => {
    try {
      const updateState = await api.stageOfflineUpdate({
        package_path: payload.package_path ?? null,
        package_kind: payload.package_kind ?? null,
        staged_version: payload.staged_version ?? null,
      });
      set((state) => ({ updateState, updateAvailability: { ...state.updateAvailability, current_version: updateState.current_version || state.appInfo.version }, toast: { id: Date.now(), tone: 'success', text: '更新包已校验并暂存。' } }));
      void get().checkUpdateAvailability();
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `更新包登记失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  applyUpdatePackage: async () => {
    try {
      const response = await api.applyOfflineUpdate();
      set((state) => ({ updateState: response.update_state, updateAvailability: { ...state.updateAvailability, current_version: response.update_state.current_version || state.appInfo.version }, toast: { id: Date.now(), tone: 'success', text: response.detail } }));
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `启动更新失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
    }
  },
  rollbackUpdatePackage: async () => {
    try {
      const response = await api.rollbackOfflineUpdate();
      set((state) => ({ updateState: response.update_state, updateAvailability: { ...state.updateAvailability, current_version: response.update_state.current_version || state.appInfo.version }, toast: { id: Date.now(), tone: 'success', text: response.detail } }));
    } catch (error) {
      set({ toast: { id: Date.now(), tone: 'error', text: `启动回滚失败：${error instanceof Error ? error.message : '请稍后重试'}` } });
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

