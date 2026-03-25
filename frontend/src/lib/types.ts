export type NoteProperty = {
  id: number;
  note_id: number;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multi_select';
  value: string;
};

export type Note = {
  id: number;
  title: string;
  icon: string;
  content: string;
  summary: string;
  is_title_manually_edited: boolean;
  tags: string[];
  properties: NoteProperty[];
  links: number[];
  notebook_id: number | null;
  parent_id: number | null;
  position: number;
  created_at: string;
  deleted_at?: string | null;
  is_draft?: boolean;
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

export type ModelConfig = {
  provider: string;
  api_key: string;
  base_url: string;
  model_name: string;
};

export type ToastMessage = {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
};

export type UserStats = {
  exp: number;
  level: number;
  total_captures: number;
};
