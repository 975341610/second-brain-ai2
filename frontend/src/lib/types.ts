export type ThemeMode = 'warm' | 'forest' | 'night' | 'custom';
export type WallpaperMode = 'gradient' | 'mouse-parallax' | 'time-shift';
export type FontMode = 'sans' | 'serif' | 'mono';
export type MotionMode = 'calm' | 'vivid' | 'off';
export type HomeBoardId = 'recent_notes' | 'task_board' | 'assistant' | 'knowledge_cards';

export type CustomThemeTokens = {
  paper: string;
  panel_bg: string;
  surface_bg: string;
  border_color: string;
  text_primary: string;
  text_secondary: string;
  text_muted: string;
  accent_strong: string;
  accent_contrast: string;
};

export type HomeLayoutItem = {
  id: HomeBoardId;
  visible: boolean;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  kind: string;
  capabilities: string[];
  manifest_path: string;
  enabled: boolean;
};

export const HOME_BOARD_IDS: HomeBoardId[] = ['recent_notes', 'task_board', 'assistant', 'knowledge_cards'];

export const DEFAULT_HOME_LAYOUT: HomeLayoutItem[] = HOME_BOARD_IDS.map((id) => ({ id, visible: true }));

export const DEFAULT_CUSTOM_THEME: CustomThemeTokens = {
  paper: '#f4f1ff',
  panel_bg: '#faf8ff',
  surface_bg: '#ffffff',
  border_color: '#ddd6fe',
  text_primary: '#2e1065',
  text_secondary: '#6d28d9',
  text_muted: '#8b5cf6',
  accent_strong: '#7c3aed',
  accent_contrast: '#ffffff',
};

export type WorkspaceSettingsData = {
  theme_name: string;
  theme_mode: ThemeMode;
  wallpaper: WallpaperMode;
  font_mode: FontMode;
  motion_mode: MotionMode;
  density: 'comfortable' | 'compact';
  home_layout: HomeLayoutItem[];
  custom_theme: CustomThemeTokens;
  enabled_plugins: string[];
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettingsData = {
  theme_name: '琥珀森林',
  theme_mode: 'warm',
  wallpaper: 'gradient',
  font_mode: 'sans',
  motion_mode: 'calm',
  density: 'comfortable',
  home_layout: DEFAULT_HOME_LAYOUT,
  custom_theme: DEFAULT_CUSTOM_THEME,
  enabled_plugins: [],
};

export type NoteType = 'note' | 'bullet_journal' | 'journal' | 'event' | 'template';

export type Note = {
  id: number;
  title: string;
  icon: string;
  content: string;
  summary: string;
  tags: string[];
  links: number[];
  notebook_id: number | null;
  position: number;
  created_at: string;
  deleted_at?: string | null;
  is_draft?: boolean;
  parent_id?: number | null;
  path?: string;
  revision?: string;
  children_count?: number;
  is_folder?: boolean;
  note_type?: NoteType | string;
  template_id?: number | null;
  is_private?: boolean;
  journal_date?: string | null;
  period_type?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  private_unlocked?: boolean;
};

export type OutlineItem = {
  id: string;
  text: string;
  level: number;
};

export type Notebook = {
  id: number;
  name: string;
  icon: string;
  created_at: string;
  deleted_at?: string | null;
};

export type TrashState = {
  notes: Note[];
  notebooks: Notebook[];
};

export type Task = {
  id: number;
  title: string;
  status: 'todo' | 'doing' | 'done';
  priority: 'low' | 'medium' | 'high';
  task_type: 'meeting' | 'work' | 'travel' | 'errand' | 'study' | 'personal';
  deadline: string | null;
  created_at: string;
};

export type Citation = {
  note_id: number | null;
  title: string;
  chunk_id: string;
  score: number;
  excerpt: string;
};

export type AskResponse = {
  answer: string;
  citations: Citation[];
  mode: string;
};

export type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  mode?: 'chat' | 'rag' | 'agent';
  created_at: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updated_at: string;
};

export type AppInfo = {
  name: string;
  version: string;
  repository: string;
  api_prefix: string;
  runtime_root: string;
  workspace_path: string;
  update_staging_path: string;
  plugin_packages_path: string;
  theme_assets_path: string;
};

export type ModelConfig = {
  provider: string;
  api_key: string;
  base_url: string;
  model_name: string;
};

export type NoteTemplate = {
  id: number;
  name: string;
  description: string;
  icon: string;
  note_type: NoteType | string;
  default_title: string;
  default_content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TimelineItem = {
  id: string;
  item_type: 'task' | 'note';
  title: string;
  icon: string;
  timestamp: string;
  end_at?: string | null;
  note_id?: number | null;
  task_id?: number | null;
  status?: string | null;
  note_type?: string | null;
  is_private?: boolean;
};

export type WorkspaceSettings = {
  data: WorkspaceSettingsData | Record<string, unknown>;
};

export type PrivateVaultStatus = {
  configured: boolean;
  unlocked: boolean;
};

export type UpdateAvailability = {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_url: string;
  manifest_url: string;
  published_at: string;
  release_name: string;
  release_notes: string;
  packages: Array<{
    name: string;
    kind?: string | null;
    download_url: string;
    sha256: string;
    size_bytes: number;
  }>;
};

export type UpdateState = {
  channel: string;
  current_version: string;
  staged_version?: string | null;
  package_path?: string | null;
  package_kind?: string | null;
  manifest: Record<string, unknown>;
  status: string;
  last_error: string;
  updated_at: string;
};


export type ToastMessage = {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
};
