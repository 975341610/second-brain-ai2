import type { AskResponse, ModelConfig, Note, Notebook, Task, TrashState } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : `${window.location.origin}/api`);

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }
  return response.json() as Promise<T>;
}

export const api = {
  listNotes: () => request<Note[]>('/notes'),
  listNotebooks: () => request<Notebook[]>('/notebooks'),
  createNotebook: (payload: { name: string; icon?: string }) => request<Notebook>('/notebooks', { method: 'POST', body: JSON.stringify(payload) }),
  updateNotebook: (notebookId: number, payload: { name?: string; icon?: string }) =>
    request<Notebook>(`/notebooks/${notebookId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteNotebook: (notebookId: number) => request(`/notebooks/${notebookId}`, { method: 'DELETE' }),
  restoreNotebook: (notebookId: number) => request<Notebook>(`/notebooks/${notebookId}/restore`, { method: 'POST' }),
  purgeNotebook: (notebookId: number) => request(`/notebooks/${notebookId}/purge`, { method: 'DELETE' }),
  createNote: (payload: { title: string; content: string; notebook_id?: number | null; icon?: string }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(payload) }),
  updateNote: (noteId: number, payload: { title?: string; content?: string; icon?: string }) =>
    request<Note>(`/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  moveNote: (noteId: number, payload: { notebook_id?: number | null; position: number }) =>
    request<Note>(`/notes/${noteId}/move`, { method: 'PATCH', body: JSON.stringify(payload) }),
  bulkMoveNotes: (payload: { note_ids: number[]; notebook_id?: number | null; position: number }) =>
    request<{ notes: Note[] }>('/notes/bulk-move', { method: 'POST', body: JSON.stringify(payload) }),
  bulkDeleteNotes: (payload: { note_ids: number[]; position?: number }) =>
    request<{ notes: Note[] }>('/notes/bulk-delete', { method: 'POST', body: JSON.stringify(payload) }),
  deleteNote: (noteId: number) => request(`/notes/${noteId}`, { method: 'DELETE' }),
  restoreNote: (noteId: number) => request<Note>(`/notes/${noteId}/restore`, { method: 'POST' }),
  purgeNote: (noteId: number) => request(`/notes/${noteId}/purge`, { method: 'DELETE' }),
  getTrash: () => request<TrashState>('/trash'),
  listTasks: () => request<Task[]>('/tasks'),
  createTask: (payload: { title: string; status?: string; priority?: string; task_type?: string; deadline?: string | null }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (taskId: number, payload: { title?: string; status?: string; priority?: string; task_type?: string; deadline?: string | null }) =>
    request<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  ask: (payload: { question: string; mode: 'chat' | 'rag' | 'agent' }) =>
    request<AskResponse>('/ask', { method: 'POST', body: JSON.stringify(payload) }),
  runAgent: (goal: string) => request('/agent', { method: 'POST', body: JSON.stringify({ goal }) }),
  getModelConfig: () => request<ModelConfig>('/model-config'),
  updateModelConfig: (payload: ModelConfig) =>
    request<ModelConfig>('/model-config', { method: 'POST', body: JSON.stringify(payload) }),
  upload: async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const response = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
};
