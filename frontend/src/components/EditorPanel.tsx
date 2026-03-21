import { NotionEditor } from './notion/NotionEditor';
import type { Note } from '../lib/types';

type EditorPanelProps = {
  note: Note | null;
  notes: Note[];
  isSaving: boolean;
  onSave: (payload: { id?: number; title: string; content: string; icon?: string; parent_id?: number | null; tags?: string[]; is_title_manually_edited?: boolean; silent?: boolean }) => Promise<void>;
  onUpdateTags?: (noteId: number, tags: string[]) => Promise<void>;
  onCreateSubPage: (parentId: number) => void;
  onSelectNote: (noteId: number) => void;
  onNotify?: (text: string, tone?: 'success' | 'error' | 'info') => void;
  outline: { id: string; text: string; level: number }[];
  references: string[];
  relatedNotes: Note[];
};

export function EditorPanel(props: EditorPanelProps) {
  // Directly delegate to the new NotionEditor which now contains the modularized components
  return (
    <NotionEditor 
      note={props.note}
      notes={props.notes}
      onSave={props.onSave}
      onUpdateTags={props.onUpdateTags}
      onCreateSubPage={props.onCreateSubPage}
      onSelectNote={props.onSelectNote}
      onNotify={props.onNotify}
      outline={props.outline}
      references={props.references}
      relatedNotes={props.relatedNotes}
    />
  );
}
