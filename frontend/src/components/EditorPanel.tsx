import { AlertCircle, Lock, LockOpen, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { NotionEditor } from './notion/NotionEditor';
import type { Note } from '../lib/types';
import {
  decryptPrivateNoteSnapshot,
  encryptPrivateNoteSnapshot,
  getSessionPrivateSecret,
  isEncryptedPrivateContent,
  setSessionPrivateSecret,
  type PrivateNoteSnapshot,
} from '../lib/privateNotes';

const PRIVATE_TAGS = new Set(['私密', 'private']);
const PRIVATE_PLACEHOLDER_TITLE = '私密笔记';
const PRIVATE_PLACEHOLDER_ICON = '🔒';

function isPrivateNote(note: Note | null | undefined) {
  return !!note?.tags?.some((tag) => PRIVATE_TAGS.has(tag.toLowerCase()));
}

function buildPrivateTags(tags: string[]) {
  return [...tags.filter((tag) => !PRIVATE_TAGS.has(tag.toLowerCase())), '私密'];
}

function toPrivateSnapshot(note: Note): PrivateNoteSnapshot {
  return {
    title: note.title,
    content: note.content,
    icon: note.icon,
    is_title_manually_edited: note.is_title_manually_edited,
  };
}

function extractOutline(content: string) {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  return Array.from(doc.querySelectorAll('h1, h2, h3')).map((node) => ({
    id: node.id || node.textContent?.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-') || '',
    text: node.textContent || '',
    level: Number(node.tagName.replace('H', '')),
  }));
}

function extractReferences(content: string) {
  const text = new DOMParser().parseFromString(content, 'text/html').body.textContent || content;
  return Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g)).map((match) => match[1]);
}

type EditorPanelProps = {
  note: Note | null;
  notes: Note[];
  isSaving: boolean;
  onSave: (payload: { id?: number; title: string; content: string; icon?: string; parent_id?: number | null; tags?: string[]; is_title_manually_edited?: boolean; silent?: boolean }) => Promise<void>;
  onRetryNoteSync?: (noteId: number) => Promise<void>;
  onUpdateTags?: (noteId: number, tags: string[]) => Promise<void>;
  onCreateSubPage: (parentId: number) => void;
  onSelectNote: (noteId: number) => void;
  onNotify?: (text: string, tone?: 'success' | 'error' | 'info') => void;
  outline: { id: string; text: string; level: number }[];
  references: string[];
  relatedNotes: Note[];
};

export function EditorPanel(props: EditorPanelProps) {
  const [decryptedNotes, setDecryptedNotes] = useState<Record<number, PrivateNoteSnapshot>>({});
  const currentNoteNeedsSync = props.note && (props.note.sync_status === 'queued' || props.note.sync_status === 'error');
  const noteIsPrivate = isPrivateNote(props.note);
  const decryptedPrivateNote = props.note && noteIsPrivate ? decryptedNotes[props.note.id] ?? null : null;
  const noteIsUnlocked = !!decryptedPrivateNote;

  const displayNote = useMemo(() => {
    if (!props.note || !noteIsPrivate || !decryptedPrivateNote) {
      return props.note;
    }

    return {
      ...props.note,
      title: decryptedPrivateNote.title,
      content: decryptedPrivateNote.content,
      icon: decryptedPrivateNote.icon,
      is_title_manually_edited: decryptedPrivateNote.is_title_manually_edited,
    };
  }, [props.note, noteIsPrivate, decryptedPrivateNote]);

  const resolvedOutline = useMemo(() => {
    if (!displayNote || !noteIsPrivate || !noteIsUnlocked) {
      return props.outline;
    }
    return extractOutline(displayNote.content || '');
  }, [displayNote, noteIsPrivate, noteIsUnlocked, props.outline]);

  const resolvedReferences = useMemo(() => {
    if (!displayNote || !noteIsPrivate || !noteIsUnlocked) {
      return props.references;
    }
    return extractReferences(displayNote.content || '');
  }, [displayNote, noteIsPrivate, noteIsUnlocked, props.references]);

  const promptForNewSecret = () => {
    const existingSecret = getSessionPrivateSecret();
    if (existingSecret) {
      return existingSecret;
    }

    const first = window.prompt('为私密笔记设置本会话解锁密码');
    if (!first?.trim()) {
      props.onNotify?.('未设置解锁密码。', 'info');
      return null;
    }

    const second = window.prompt('请再次输入解锁密码');
    if (first !== second) {
      props.onNotify?.('两次输入的密码不一致。', 'error');
      return null;
    }

    setSessionPrivateSecret(first);
    return first;
  };

  const ensureUnlockSecret = () => {
    const existingSecret = getSessionPrivateSecret();
    if (existingSecret) {
      return existingSecret;
    }

    const input = window.prompt('输入私密笔记解锁密码');
    if (!input?.trim()) {
      props.onNotify?.('未输入解锁密码。', 'info');
      return null;
    }

    setSessionPrivateSecret(input);
    return input;
  };

  const saveEncryptedPrivateSnapshot = async (note: Note, snapshot: PrivateNoteSnapshot, tags = buildPrivateTags(note.tags)) => {
    const secret = getSessionPrivateSecret() ?? promptForNewSecret();
    if (!secret) {
      return false;
    }

    try {
      const encryptedContent = await encryptPrivateNoteSnapshot(snapshot, secret);
      await props.onSave({
        id: note.id,
        title: PRIVATE_PLACEHOLDER_TITLE,
        content: encryptedContent,
        icon: PRIVATE_PLACEHOLDER_ICON,
        parent_id: note.parent_id,
        tags,
        is_title_manually_edited: true,
        silent: true,
      });
      setDecryptedNotes((current) => ({ ...current, [note.id]: snapshot }));
      return true;
    } catch (error) {
      props.onNotify?.(`私密加密保存失败：${error instanceof Error ? error.message : '请稍后重试'}`, 'error');
      return false;
    }
  };

  const resolvePrivateSnapshot = async (note: Note) => {
    const cachedSnapshot = decryptedNotes[note.id];
    if (cachedSnapshot) {
      return cachedSnapshot;
    }

    if (!isEncryptedPrivateContent(note.content)) {
      return toPrivateSnapshot(note);
    }

    const secret = ensureUnlockSecret();
    if (!secret) {
      return null;
    }

    try {
      const snapshot = await decryptPrivateNoteSnapshot(note.content, secret);
      setDecryptedNotes((current) => ({ ...current, [note.id]: snapshot }));
      return snapshot;
    } catch (error) {
      setSessionPrivateSecret(null);
      props.onNotify?.(error instanceof Error ? error.message : '私密笔记解锁失败。', 'error');
      return null;
    }
  };

  const handleEnablePrivate = async () => {
    if (!props.note || noteIsPrivate) {
      return;
    }

    if (props.note.id < 0) {
      props.onNotify?.('请先保存笔记，再设置私密状态。', 'info');
      return;
    }

    const snapshot = toPrivateSnapshot(props.note);
    const updated = await saveEncryptedPrivateSnapshot(props.note, snapshot);
    if (!updated) {
      return;
    }

    props.onNotify?.('已设为私密笔记，并完成本地加密。', 'success');
  };

  const handleDisablePrivate = async () => {
    if (!props.note || !noteIsPrivate) {
      return;
    }

    const snapshot = await resolvePrivateSnapshot(props.note);
    if (!snapshot) {
      return;
    }

    try {
      await props.onSave({
        id: props.note.id,
        title: snapshot.title,
        content: snapshot.content,
        icon: snapshot.icon,
        parent_id: props.note.parent_id,
        tags: props.note.tags.filter((tag) => !PRIVATE_TAGS.has(tag.toLowerCase())),
        is_title_manually_edited: snapshot.is_title_manually_edited,
        silent: true,
      });
      setDecryptedNotes((current) => {
        const next = { ...current };
        delete next[props.note!.id];
        return next;
      });
      props.onNotify?.('已取消私密状态并恢复明文内容。', 'success');
    } catch (error) {
      props.onNotify?.(`取消私密失败：${error instanceof Error ? error.message : '请稍后重试'}`, 'error');
    }
  };

  const handleUnlock = async () => {
    if (!props.note) {
      return;
    }

    if (!isEncryptedPrivateContent(props.note.content)) {
      const legacySnapshot = toPrivateSnapshot(props.note);
      const upgraded = await saveEncryptedPrivateSnapshot(props.note, legacySnapshot);
      if (!upgraded) {
        return;
      }
      props.onNotify?.('旧版私密笔记已升级为加密存储，并在当前会话解锁。', 'success');
      return;
    }

    const snapshot = await resolvePrivateSnapshot(props.note);
    if (!snapshot) {
      return;
    }

    props.onNotify?.('当前会话已解锁私密笔记。', 'success');
  };

  const handleRelock = () => {
    if (!props.note) {
      return;
    }
    setDecryptedNotes((current) => {
      const next = { ...current };
      delete next[props.note!.id];
      return next;
    });
    props.onNotify?.('已重新上锁。', 'info');
  };

  const handlePrivateAwareSave = async (payload: { id?: number; title: string; content: string; icon?: string; parent_id?: number | null; tags?: string[]; is_title_manually_edited?: boolean; silent?: boolean }) => {
    if (!props.note || !noteIsPrivate) {
      return props.onSave(payload);
    }

    const baseSnapshot = decryptedPrivateNote ?? (displayNote ? toPrivateSnapshot(displayNote) : null);
    if (!baseSnapshot) {
      props.onNotify?.('请先解锁私密笔记，再继续编辑。', 'info');
      return;
    }

    const nextSnapshot: PrivateNoteSnapshot = {
      title: payload.title ?? baseSnapshot.title,
      content: payload.content ?? baseSnapshot.content,
      icon: payload.icon ?? baseSnapshot.icon,
      is_title_manually_edited: payload.is_title_manually_edited ?? baseSnapshot.is_title_manually_edited,
    };

    const nextTags = buildPrivateTags(payload.tags ?? props.note.tags);
    const updated = await saveEncryptedPrivateSnapshot(props.note, nextSnapshot, nextTags);
    if (!updated) {
      throw new Error('私密笔记加密保存失败');
    }
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {props.note && (
        <div className="mx-auto flex w-full max-w-[800px] items-center justify-between gap-3 rounded-xl border border-reflect-border/40 bg-reflect-sidebar/35 px-4 py-3 text-[12px] text-reflect-muted">
          <div className="flex items-center gap-2 min-w-0">
            {noteIsPrivate ? <Lock size={14} className="shrink-0" /> : <LockOpen size={14} className="shrink-0" />}
            <span className="truncate">
              {noteIsPrivate ? (noteIsUnlocked ? '当前为私密笔记，内容已在本会话解锁。' : '当前为私密笔记，内容已加密存储，需先解锁后查看。') : '当前笔记为普通模式。'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {noteIsPrivate ? (
              <>
                {noteIsUnlocked ? (
                  <button
                    onClick={handleRelock}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium hover:bg-reflect-sidebar/60 transition-colors"
                  >
                    <Lock size={12} />
                    重新上锁
                  </button>
                ) : (
                  <button
                    onClick={() => void handleUnlock()}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium hover:bg-reflect-sidebar/60 transition-colors"
                  >
                    <LockOpen size={12} />
                    立即解锁
                  </button>
                )}
                <button
                  onClick={() => void handleDisablePrivate()}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium hover:bg-reflect-sidebar/60 transition-colors"
                >
                  取消私密
                </button>
              </>
            ) : (
              <button
                onClick={() => void handleEnablePrivate()}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium hover:bg-reflect-sidebar/60 transition-colors"
              >
                <Lock size={12} />
                设为私密
              </button>
            )}
          </div>
        </div>
      )}

      {currentNoteNeedsSync && props.note && (
        <div className="mx-auto w-full max-w-[800px] rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-[12px] text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={14} className="shrink-0" />
            <span className="truncate">
              {props.note.sync_status === 'error' ? '当前笔记同步失败，正在等待重试。' : '当前笔记尚未同步到本地服务。'}
            </span>
          </div>
          <button
            onClick={() => props.onRetryNoteSync?.(props.note!.id)}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium hover:bg-amber-100 transition-colors"
          >
            <RefreshCw size={12} />
            立即重试
          </button>
        </div>
      )}

      {noteIsPrivate && props.note && !noteIsUnlocked ? (
        <div className="mx-auto flex h-full w-full max-w-[800px] flex-1 items-center justify-center rounded-2xl border border-reflect-border/40 bg-reflect-sidebar/25 px-8 py-16 text-center">
          <div className="max-w-md space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-reflect-sidebar/60 text-reflect-text">
              <Lock size={24} />
            </div>
            <div>
              <div className="text-lg font-semibold text-reflect-text">私密笔记已锁定</div>
              <div className="mt-2 text-sm text-reflect-muted">当前版本会将私密笔记正文与真实标题加密保存；只有输入解锁密码后，当前会话才会显示内容。</div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => void handleUnlock()}
                className="inline-flex items-center gap-2 rounded-xl bg-reflect-text px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                <LockOpen size={14} />
                解锁查看
              </button>
              <button
                onClick={() => void handleDisablePrivate()}
                className="inline-flex items-center gap-2 rounded-xl border border-reflect-border/50 px-4 py-2 text-sm font-medium text-reflect-muted hover:bg-reflect-sidebar/40 transition-colors"
              >
                取消私密
              </button>
            </div>
          </div>
        </div>
      ) : (
        <NotionEditor
          key={`${displayNote?.id ?? 'none'}-${noteIsUnlocked ? 'unlocked' : 'locked'}`}
          note={displayNote}
          notes={props.notes}
          onSave={handlePrivateAwareSave}
          onUpdateTags={props.onUpdateTags}
          onTogglePrivate={() => void (noteIsPrivate ? handleDisablePrivate() : handleEnablePrivate())}
          isPrivate={noteIsPrivate}
          canRevealPrivateContent={!noteIsPrivate || noteIsUnlocked}
          onCreateSubPage={props.onCreateSubPage}
          onSelectNote={props.onSelectNote}
          onNotify={props.onNotify}
          outline={resolvedOutline}
          references={resolvedReferences}
          relatedNotes={props.relatedNotes}
        />
      )}
    </div>
  );
}
