export type Note = {
  id: number;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  links: number[];
  created_at: string;
};

export type Task = {
  id: number;
  title: string;
  status: 'todo' | 'doing' | 'done';
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
