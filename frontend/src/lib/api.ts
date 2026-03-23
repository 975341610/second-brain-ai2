import type { AskResponse, ModelConfig, Note, Notebook, NoteProperty, Task, TrashState } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

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
  createNote: (payload: { title: string; content: string; notebook_id?: number | null; icon?: string; parent_id?: number | null; is_title_manually_edited?: boolean; tags?: string[] }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(payload) }),
  updateNote: (noteId: number, payload: { title?: string; content?: string; icon?: string; parent_id?: number | null; is_title_manually_edited?: boolean; tags?: string[] }) =>
    request<Note>(`/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateNoteTags: (noteId: number, tags: string[]) =>
    request<Note>(`/notes/${noteId}/tags`, { method: 'PATCH', body: JSON.stringify(tags) }),
  moveNote: (noteId: number, payload: { notebook_id?: number | null; position: number; parent_id?: number | null }) =>
    request<Note>(`/notes/${noteId}/move`, { method: 'PATCH', body: JSON.stringify(payload) }),
  bulkMoveNotes: (payload: { note_ids: number[]; notebook_id?: number | null; position: number; parent_id?: number | null }) =>
    request<{ notes: Note[] }>('/notes/bulk-move', { method: 'POST', body: JSON.stringify(payload) }),
  bulkDeleteNotes: (payload: { note_ids: number[]; position?: number }) =>
    request<{ notes: Note[] }>('/notes/bulk-delete', { method: 'POST', body: JSON.stringify(payload) }),
  deleteNote: (noteId: number) => request(`/notes/${noteId}`, { method: 'DELETE' }),
  listNotesFiltered: (propertyName: string, propertyValue: string) => 
    request<Note[]>(`/notes?property_name=${encodeURIComponent(propertyName)}&property_value=${encodeURIComponent(propertyValue)}`),
  createNoteProperty: (noteId: number, payload: { name: string; type: string; value: string }) =>
    request<NoteProperty>(`/notes/${noteId}/properties`, { method: 'POST', body: JSON.stringify(payload) }),
  updateNoteProperty: (noteId: number, propertyId: number, payload: { name?: string; type?: string; value?: string }) =>
    request<NoteProperty>(`/notes/${noteId}/properties/${propertyId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteNoteProperty: (noteId: number, propertyId: number) =>
    request(`/notes/${noteId}/properties/${propertyId}`, { method: 'DELETE' }),
  restoreNote: (noteId: number) => request<Note>(`/notes/${noteId}/restore`, { method: 'POST' }),
  purgeNote: (noteId: number) => request(`/notes/${noteId}/purge`, { method: 'DELETE' }),
  purgeTrash: () => request('/trash/purge', { method: 'DELETE' }),
  getTrash: () => request<TrashState>('/trash'),
  listTasks: () => request<Task[]>('/tasks'),
  createTask: (payload: { title: string; status?: string; priority?: string; task_type?: string; deadline?: string | null }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (taskId: number, payload: { title?: string; status?: string; priority?: string; task_type?: string; deadline?: string | null }) =>
    request<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTask: (taskId: number) => request(`/tasks/${taskId}`, { method: 'DELETE' }),
  clearCompletedTasks: () => request('/tasks/clear-completed', { method: 'POST' }),
  ask: (payload: { question: string; mode: 'chat' | 'rag' | 'agent' }) =>
    request<AskResponse>('/ask', { method: 'POST', body: JSON.stringify(payload) }),
  runAgent: (goal: string) => request('/agent', { method: 'POST', body: JSON.stringify({ goal }) }),
  getModelConfig: () => request<ModelConfig>('/model-config'),
  updateModelConfig: (payload: ModelConfig) =>
    request<ModelConfig>('/model-config', { method: 'POST', body: JSON.stringify(payload) }),
  suggestTags: (content: string) => request<{ tags: string[] }>('/tags/suggest', { method: 'POST', body: JSON.stringify({ content }) }),
  streamInlineAI: async (payload: { prompt: string; context?: string; action: string }, onChunk: (chunk: string) => void) => {
    const response = await fetch(`${API_BASE}/ai/inline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  },
  streamChat: async (payload: { question: string; mode: string }, onChunk: (chunk: string) => void) => {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  },
  upload: async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const response = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  uploadMedia: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/media/upload`, { 
      method: 'POST', 
      body: formData 
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ url: string; name: string; size: number; type: string }>;
  },
  uploadMediaChunked: async (file: File) => {
    const CHUNK_SIZE = 512 * 1024; // 512KB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Init
    const initForm = new FormData();
    initForm.append('filename', file.name);
    initForm.append('size', file.size.toString());
    const initRes = await fetch(`${API_BASE}/media/upload/init`, { method: 'POST', body: initForm });
    if (!initRes.ok) throw new Error("Init upload failed");
    const { upload_id } = await initRes.json();

    // 2. Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      const chunkForm = new FormData();
      chunkForm.append('upload_id', upload_id);
      chunkForm.append('chunk_index', i.toString());
      chunkForm.append('file', chunk, file.name);

      const chunkRes = await fetch(`${API_BASE}/media/upload/chunk`, { method: 'POST', body: chunkForm });
      if (!chunkRes.ok) throw new Error(`Chunk ${i} upload failed`);
    }

    // 3. Complete
    const completeForm = new FormData();
    completeForm.append('upload_id', upload_id);
    completeForm.append('filename', file.name);
    completeForm.append('content_type', file.type);
    const finalRes = await fetch(`${API_BASE}/media/upload/complete`, { method: 'POST', body: completeForm });
    if (!finalRes.ok) throw new Error("Complete upload failed");
    
    return finalRes.json() as Promise<{ url: string; name: string; size: number; type: string }>;
  },
};
