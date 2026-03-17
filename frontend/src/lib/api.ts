import type { AskResponse, ModelConfig, Note, Task } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;

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
  createNote: (payload: { title: string; content: string }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(payload) }),
  updateNote: (noteId: number, payload: { title?: string; content?: string }) =>
    request<Note>(`/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  listTasks: () => request<Task[]>('/tasks'),
  createTask: (payload: { title: string; status?: string }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (taskId: number, payload: { title?: string; status?: string }) =>
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
