import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import Youtube from '@tiptap/extension-youtube';
import DragHandle from '@tiptap/extension-drag-handle-react';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import { GripVertical, List, ListOrdered, Minus, MoreHorizontal, Plus, Trash2, Type } from 'lucide-react';
import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TextSelection } from '@tiptap/pm/state';
import { CellSelection, findCellPos, selectedRect, TableMap } from 'prosemirror-tables';
import { AudioNode, CalloutNode, DatabaseTableCell, DatabaseTableHeader, EmbedNode, ResizableImage, VideoNode } from '../lib/tiptapExtensions';
import type { Note } from '../lib/types';
import { EditorHeader } from './editor/EditorHeader';
import { SlashMenu } from './editor/SlashMenu';
import { TableMenus } from './editor/TableMenus';
import type { FloatingPosition, MediaSelection, SlashItem } from './editor/types';
import { createAudioHtml, createVideoHtml, genericEmbedUrl, highlightSlashLabel, uploadLocalMedia } from './editor/utils';

type EditorPanelProps = {
  note: Note | null;
  isSaving: boolean;
  onSave: (payload: { id?: number; title: string; content: string; icon?: string; silent?: boolean }) => Promise<void>;
  outline: { id: string; text: string; level: number }[];
  references: string[];
  relatedNotes: Note[];
};

type CellEditorState = {
  type: 'select' | 'date';
  cellPos: number;
  top: number;
  left: number;
  options?: string[];
  mode?: 'single' | 'multi';
  value?: string;
};

const defaultContent = '<h1>开始记录</h1><p>写下你的灵感、项目规划、读书摘录或研究结论。</p>';

function normalizeEditorContent(content?: string | null): string {
  const value = (content || '').trim();
  if (!value) return defaultContent;
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(value);
  if (looksLikeHtml) return value;
  return marked.parse(value, { async: false }) as string;
}

export function EditorPanel({ note, isSaving, onSave, outline, references, relatedNotes }: EditorPanelProps) {
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showRelations, setShowRelations] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [cellEditor, setCellEditor] = useState<CellEditorState | null>(null);
  const [dateDraft, setDateDraft] = useState('');
  const autosaveTimerRef = useRef<number | null>(null);
  const lastSyncedNoteIdRef = useRef<number | null>(null);
  const isApplyingRemoteRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<string | null>(null);
  const savedBaselineRef = useRef<string>(normalizeEditorContent(note?.content));
  const [savePhase, setSavePhase] = useState<'idle' | 'queued' | 'saving'>('idle');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashPosition, setSlashPosition] = useState<FloatingPosition>({ left: 24, top: 24 });
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [selectedMedia, setSelectedMedia] = useState<MediaSelection>({ type: null, width: '100%' });
  const [tableActive, setTableActive] = useState(false);
  const [tableContextMenu, setTableContextMenu] = useState<FloatingPosition | null>(null);
  const tableSelectionRef = useRef<{ type: 'cell'; anchor: number; head: number } | { type: 'text'; from: number; to: number } | null>(null);
  const [tableInlineControls, setTableInlineControls] = useState<{ top: number; left: number; right: number; bottom: number } | null>(null);
  const [columnMenu, setColumnMenu] = useState<FloatingPosition | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeBlockHandle, setActiveBlockHandle] = useState(false);
  const [blockMenuPosition, setBlockMenuPosition] = useState<FloatingPosition | null>(null);
  const slashListRef = useRef<HTMLDivElement | null>(null);
  const editorPaneRef = useRef<HTMLDivElement | null>(null);
  const slashMenuRef = useRef<HTMLDivElement | null>(null);
  const blockMenuRef = useRef<HTMLDivElement | null>(null);
  const [editorHtml, setEditorHtml] = useState(normalizeEditorContent(note?.content));

  const updateCellAttrs = (cellPos: number, attrs: Record<string, unknown>, content?: string) => {
    if (!editor) return;
    const node = editor.state.doc.nodeAt(cellPos);
    if (!node) return;
    const tr = editor.state.tr.setNodeMarkup(cellPos, node.type, { ...node.attrs, ...attrs });
    editor.view.dispatch(tr);
    if (typeof content === 'string') {
      const from = cellPos + 1;
      const to = cellPos + node.nodeSize - 1;
      if (!content) {
        editor.chain().focus().deleteRange({ from, to }).run();
      } else {
        editor.chain().focus().insertContentAt({ from, to }, content).run();
      }
    }
  };

  const clampSlashPosition = (left: number, top: number) => {
    const pane = editorPaneRef.current;
    const menuWidth = slashMenuRef.current?.offsetWidth || 224;
    const menuHeight = slashMenuRef.current?.offsetHeight || 320;
    if (!pane) return { left, top };
    const maxLeft = Math.max(12, pane.clientWidth - menuWidth - 12);
    const maxTop = Math.max(12, pane.scrollTop + pane.clientHeight - menuHeight - 12);
    return { left: Math.min(Math.max(12, left), maxLeft), top: Math.min(Math.max(12, top), maxTop) };
  };

  const openSlashMenu = (left: number, top: number) => {
    const next = clampSlashPosition(left, top);
    setBlockMenuPosition(null);
    setTableContextMenu(null);
    setSlashPosition(next);
    setSlashQuery('');
    setSlashIndex(0);
    setShowSlashMenu(true);
  };

  const closeSlashMenu = () => {
    setShowSlashMenu(false);
    setSlashQuery('');
    setSlashIndex(0);
  };

  const clampFloatingPosition = (left: number, top: number, width = 220, height = 340) => {
    const pane = editorPaneRef.current;
    if (!pane) return { left, top };
    const maxLeft = Math.max(12, pane.clientWidth - width - 12);
    const maxTop = Math.max(12, pane.scrollTop + pane.clientHeight - height - 12);
    return {
      left: Math.min(Math.max(12, left), maxLeft),
      top: Math.min(Math.max(12, top), maxTop),
    };
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: true, autolink: true, defaultProtocol: 'https' }),
      ResizableImage.configure({ inline: false }),
      Highlight,
      Table.configure({ resizable: true }),
      TableRow,
      DatabaseTableHeader,
      DatabaseTableCell,
      Youtube.configure({ controls: true, nocookie: true }),
      AudioNode,
      VideoNode,
      EmbedNode,
      CalloutNode,
    ],
    content: normalizeEditorContent(note?.content),
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'tiptap-editor h-full min-h-[420px] overflow-y-auto px-5 py-4 outline-none' },
      handleDOMEvents: {
        click: (view, event) => {
          const target = event.target as HTMLElement | null;
          const cell = target?.closest('td,th') as HTMLElement | null;
          if (!cell) return false;
          const domPos = view.posAtDOM(cell, 0);
          const resolved = findCellPos(view.state.doc, domPos + 1) || findCellPos(view.state.doc, domPos);
          if (!resolved) return false;
          const cellNode = view.state.doc.nodeAt(resolved.pos);
          const propertyType = String(cellNode?.attrs.propertyType || 'text');
          const propertyMode = (cellNode?.attrs.propertyMode || 'single') as 'single' | 'multi';
          const propertyOptions = String(cellNode?.attrs.propertyOptions || '').split(',').map((item: string) => item.trim()).filter(Boolean);
          const paneRect = editorPaneRef.current?.getBoundingClientRect();
          const cellRect = cell.getBoundingClientRect();
          if (propertyType === 'checkbox') {
            event.preventDefault();
            const checked = !Boolean(cellNode?.attrs.checked);
            updateCellAttrs(resolved.pos, { checked }, checked ? '☑ 已完成' : '');
            return true;
          }
          if ((propertyType === 'select' || propertyType === 'date') && paneRect) {
            event.preventDefault();
            const selection = CellSelection.create(view.state.doc, resolved.pos);
            view.dispatch(view.state.tr.setSelection(selection));
            setCellEditor({
              type: propertyType,
              cellPos: resolved.pos,
              left: Math.max(12, cellRect.left - paneRect.left + (editorPaneRef.current?.scrollLeft || 0)),
              top: Math.max(12, cellRect.bottom - paneRect.top + (editorPaneRef.current?.scrollTop || 0) + 8),
              options: propertyOptions,
              mode: propertyMode,
              value: propertyType === 'date' ? String(cellNode?.attrs.dateValue || '') : String(cellNode?.attrs.selectValue || ''),
            });
            setDateDraft(String(cellNode?.attrs.dateValue || ''));
            return true;
          }
          const selection = CellSelection.create(view.state.doc, resolved.pos);
          view.dispatch(view.state.tr.setSelection(selection));
          return true;
        },
        dblclick: (view, event) => {
          const target = event.target as HTMLElement | null;
          const cell = target?.closest('td,th') as HTMLElement | null;
          if (!cell) return false;
          const domPos = view.posAtDOM(cell, 0);
          const resolved = findCellPos(view.state.doc, domPos + 1) || findCellPos(view.state.doc, domPos);
          if (!resolved) return false;
          const textPos = Math.min(resolved.pos + 1, view.state.doc.content.size);
          view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(textPos))));
          return true;
        },
        keydown: (view, event) => {
          const selection = view.state.selection;
          const $from = selection.$from;
          const inTable = Array.from({ length: $from.depth + 1 }).some((_, depth) => $from.node(depth).type.name === 'table');
          if (inTable && event.key === 'Enter' && selection instanceof CellSelection) {
            const cellPos = selection.$anchorCell.pos + 1;
            view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(cellPos))));
            return true;
          }
          if (inTable && event.key === 'Escape' && !(selection instanceof CellSelection)) {
            const resolved = findCellPos(view.state.doc, selection.from);
            if (resolved) {
              view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, resolved.pos)));
              return true;
            }
          }
          if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const paneRect = editorPaneRef.current?.getBoundingClientRect();
            const coords = view.coordsAtPos(view.state.selection.from);
            openSlashMenu(Math.max(12, coords.left - (paneRect?.left || 0) - 12), coords.top - (paneRect?.top || 0) + 24 + (editorPaneRef.current?.scrollTop || 0));
            return false;
          }
          if (showSlashMenu) {
            if (event.key === 'Escape') {
              closeSlashMenu();
              return true;
            }
            if (event.key === 'ArrowDown') {
              setSlashIndex((value) => Math.min(value + 1, filteredSlashItems.length - 1));
              return true;
            }
            if (event.key === 'ArrowUp') {
              setSlashIndex((value) => Math.max(value - 1, 0));
              return true;
            }
            if (event.key === 'Enter' && filteredSlashItems[slashIndex]) {
              runSlashAction(filteredSlashItems[slashIndex].action);
              return true;
            }
            if (event.key === 'Backspace') {
              const textBefore = view.state.doc.textBetween(Math.max(0, view.state.selection.from - 20), view.state.selection.from, '');
              const match = textBefore.match(/\/([^\s/]*)$/);
              if (!match) closeSlashMenu();
              else {
                setSlashQuery(match[1] || '');
                setSlashIndex(0);
              }
            } else if (event.key === ' ' || event.key === 'Tab') {
              closeSlashMenu();
            }
          }
          return false;
        },
        drop: (_view, event) => {
          const files = Array.from(event.dataTransfer?.files || []);
          if (files.length === 0) return false;
          event.preventDefault();
          files.forEach((file) => uploadLocalMedia(editor || null, file));
          return true;
        },
      },
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      if (activeEditor.isActive('image')) setSelectedMedia({ type: 'image', width: activeEditor.getAttributes('image').width || '100%' });
      else if (activeEditor.isActive('videoNode')) setSelectedMedia({ type: 'videoNode', width: activeEditor.getAttributes('videoNode').width || '100%' });
      else if (activeEditor.isActive('audioNode')) setSelectedMedia({ type: 'audioNode', width: activeEditor.getAttributes('audioNode').width || '100%' });
      else if (activeEditor.isActive('embedNode')) setSelectedMedia({ type: 'embedNode', width: activeEditor.getAttributes('embedNode').width || '100%' });
      else if (activeEditor.isActive('youtube')) setSelectedMedia({ type: 'youtube', width: '100%' });
      else setSelectedMedia({ type: null, width: '100%' });
      const selection = activeEditor.state.selection;
      const $from = selection.$from;
      const inTable = Array.from({ length: $from.depth + 1 }).some((_, depth) => $from.node(depth).type.name === 'table');
      setTableActive(inTable);
      if (inTable) {
        const pane = editorPaneRef.current;
        const selectedCell = pane?.querySelector('.selectedCell') as HTMLElement | null;
        const table = selectedCell?.closest('table') as HTMLElement | null;
        if (pane && table) {
          const paneRect = pane.getBoundingClientRect();
          const tableRect = table.getBoundingClientRect();
          setTableInlineControls({
            left: Math.max(12, tableRect.left - paneRect.left + pane.scrollLeft),
            right: Math.max(12, tableRect.right - paneRect.left + pane.scrollLeft),
            top: Math.max(12, tableRect.top - paneRect.top + pane.scrollTop),
            bottom: Math.max(12, tableRect.bottom - paneRect.top + pane.scrollTop),
          });
        }
      } else {
        setTableInlineControls(null);
      }
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (isApplyingRemoteRef.current) return;
      setEditorHtml(activeEditor.getHTML());
      if (showSlashMenu) {
        const selection = activeEditor.state.selection.from;
        const textBefore = activeEditor.state.doc.textBetween(Math.max(0, selection - 30), selection, '');
        const match = textBefore.match(/\/([^\s/]*)$/);
        if (!match) closeSlashMenu();
        else {
          setSlashQuery(match[1] || '');
          setSlashIndex(0);
          const paneRect = editorPaneRef.current?.getBoundingClientRect();
          const coords = activeEditor.view.coordsAtPos(selection);
          setSlashPosition(clampSlashPosition(Math.max(12, coords.left - (paneRect?.left || 0) - 12), coords.top - (paneRect?.top || 0) + 24 + (editorPaneRef.current?.scrollTop || 0)));
        }
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextContent = normalizeEditorContent(note?.content);
    const currentContent = editor.getHTML();
    const noteChanged = lastSyncedNoteIdRef.current !== (note?.id ?? null);
    const safeToApplyRemote = noteChanged || currentContent === nextContent || currentContent === savedBaselineRef.current;
    if (safeToApplyRemote && currentContent !== nextContent) {
      isApplyingRemoteRef.current = true;
      editor.commands.setContent(nextContent, { emitUpdate: false });
      setEditorHtml(nextContent);
      savedBaselineRef.current = nextContent;
      pendingSaveRef.current = null;
      saveInFlightRef.current = false;
      setSavePhase('idle');
      queueMicrotask(() => {
        isApplyingRemoteRef.current = false;
      });
    }
    lastSyncedNoteIdRef.current = note?.id ?? null;
    setLastSavedAt(note ? new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : null);
  }, [editor, note?.id, note?.content]);

  const html = editorHtml || normalizeEditorContent(note?.content);
  const summary = useMemo(() => note?.summary || '保存笔记后，这里会显示 AI 自动摘要。', [note]);
  const isDirty = html !== savedBaselineRef.current;

  const persistContent = async (content: string) => {
    if (!note) return;
    if (saveInFlightRef.current) {
      pendingSaveRef.current = content;
      setSavePhase('queued');
      return;
    }
    saveInFlightRef.current = true;
    setSavePhase('saving');
    try {
      await onSave({ id: note.id, title: note.title ?? '未命名笔记', content, icon: note.icon ?? '📝', silent: true });
      savedBaselineRef.current = content;
      setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      saveInFlightRef.current = false;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending && pending !== content) {
        setSavePhase('queued');
        void persistContent(pending);
      } else {
        setSavePhase('idle');
      }
    }
  };

  useEffect(() => {
    if (!editor || !note || !isDirty || isApplyingRemoteRef.current) {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      return;
    }
    autosaveTimerRef.current = window.setTimeout(async () => {
      const latestHtml = editor.getHTML();
      setEditorHtml(latestHtml);
      await persistContent(latestHtml);
    }, 1200);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
  }, [editor, isDirty, note?.id, html]);

  const slashItems: SlashItem[] = [
    { group: '基础', label: '正文', description: '插入普通文本段落', keywords: ['paragraph', 'text', 'body'], action: () => editor?.chain().focus().setParagraph().run() },
    { group: '结构', label: '标题 1', description: '一级标题，用于页面主题', keywords: ['h1', 'title', 'heading'], action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { group: '结构', label: '标题 2', description: '二级标题，用于章节', keywords: ['h2', 'subtitle', 'heading'], action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { group: '结构', label: '标题 3', description: '三级标题，用于小节', keywords: ['h3', 'heading'], action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { group: '结构', label: '无序列表', description: '插入项目符号列表', keywords: ['list', 'bullet'], action: () => editor?.chain().focus().toggleBulletList().run() },
    { group: '结构', label: '有序列表', description: '插入编号列表', keywords: ['ordered', 'number'], action: () => editor?.chain().focus().toggleOrderedList().run() },
    { group: '结构', label: '引用块', description: '强调引用内容', keywords: ['quote', 'blockquote'], action: () => editor?.chain().focus().toggleBlockquote().run() },
    { group: '结构', label: '分割线', description: '分隔不同段落区域', keywords: ['divider', 'line', 'hr'], action: () => editor?.chain().focus().setHorizontalRule().run() },
    { group: '内容', label: '表格', description: '插入 3x3 表格', keywords: ['table', 'grid'], action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { group: '内容', label: '代码块', description: '插入带格式的代码块', keywords: ['code', 'snippet'], action: () => editor?.chain().focus().toggleCodeBlock().run() },
    { group: '内容', label: '高亮块', description: '插入提示信息块', keywords: ['callout', 'note'], action: () => editor?.chain().focus().insertContent('<div data-callout="true">重点提示</div>').run() },
    { group: '内容', label: '链接', description: '插入可点击链接', keywords: ['link', 'url'], action: () => { const url = window.prompt('输入链接地址'); if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); } },
    { group: '内容', label: '双链引用', description: '插入笔记引用', keywords: ['reference', 'wiki'], action: () => editor?.chain().focus().insertContent('<p>[[关联笔记名]]</p>').run() },
    { group: '媒体', label: '图片', description: '插入在线图片地址', keywords: ['image', 'photo'], action: () => { const url = window.prompt('输入图片地址'); if (url) editor?.chain().focus().setImage({ src: url }).run(); } },
    { group: '媒体', label: '视频', description: '插入视频或媒体地址', keywords: ['video', 'media'], action: () => { const url = window.prompt('输入视频地址'); if (url) editor?.chain().focus().insertContent(createVideoHtml(url)).run(); } },
    { group: '媒体', label: '音频', description: '插入音频地址', keywords: ['audio', 'sound'], action: () => { const url = window.prompt('输入音频地址'); if (url) editor?.chain().focus().insertContent(createAudioHtml(url)).run(); } },
    { group: '媒体', label: 'YouTube', description: '插入 YouTube 视频', keywords: ['youtube'], action: () => { const url = window.prompt('输入 YouTube 地址'); if (url) editor?.chain().focus().setYoutubeVideo({ src: url, width: 640, height: 360 }).run(); } },
    { group: '媒体', label: '哔哩哔哩', description: '插入 B 站视频', keywords: ['bilibili', 'b站'], action: () => { const url = window.prompt('输入哔哩哔哩地址'); const embed = url ? genericEmbedUrl(url) : null; if (embed?.kind === 'iframe') editor?.chain().focus().insertContent(`<iframe data-embed="true" src="${embed.src}" width="100%" height="420"></iframe>`).run(); } },
    { group: '媒体', label: '本地媒体', description: '插入本地图片/视频/音频', keywords: ['local', 'file', 'upload'], action: () => document.getElementById('editor-local-media-input')?.click() },
  ];

  const filteredSlashItems = slashItems.filter((item) => {
    if (!slashQuery.trim()) return true;
    const query = slashQuery.toLowerCase();
    const text = `${item.label} ${item.keywords.join(' ')}`.toLowerCase();
    let cursor = 0;
    return query.split('').every((char) => {
      const index = text.indexOf(char, cursor);
      if (index === -1) return false;
      cursor = index + 1;
      return true;
    });
  });

  useEffect(() => {
    const active = slashListRef.current?.querySelector(`[data-slash-index="${slashIndex}"]`) as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest' });
  }, [slashIndex]);

  useEffect(() => {
    if (!showSlashMenu) return;
    setSlashPosition((current) => clampSlashPosition(current.left, current.top));
  }, [showSlashMenu, slashQuery, slashIndex]);

  useEffect(() => {
    setSlashIndex((value) => Math.min(value, Math.max(filteredSlashItems.length - 1, 0)));
  }, [filteredSlashItems.length]);

  useEffect(() => {
    if (!showSlashMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (slashMenuRef.current?.contains(target)) return;
      closeSlashMenu();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [showSlashMenu]);

  useEffect(() => {
    if (!tableContextMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const contextMenu = document.getElementById('table-context-menu');
      if (contextMenu?.contains(target)) return;
      setTableContextMenu(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [tableContextMenu]);

  useEffect(() => {
    if (!cellEditor) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const menu = document.getElementById('table-cell-editor');
      if (menu?.contains(target)) return;
      setCellEditor(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [cellEditor]);

  useEffect(() => {
    if (!columnMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const menu = document.getElementById('table-column-menu');
      if (menu?.contains(target)) return;
      setColumnMenu(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [columnMenu]);

  useEffect(() => {
    if (!blockMenuPosition) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (blockMenuRef.current?.contains(target)) return;
      setBlockMenuPosition(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [blockMenuPosition]);

  useEffect(() => {
    if (!blockMenuPosition) return;
    const handleWindowChange = () => setBlockMenuPosition(null);
    const pane = editorPaneRef.current;
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('blur', handleWindowChange);
    pane?.addEventListener('scroll', handleWindowChange);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('blur', handleWindowChange);
      pane?.removeEventListener('scroll', handleWindowChange);
    };
  }, [blockMenuPosition]);

  useEffect(() => {
    if (!blockMenuPosition) return;
    const handleWindowChange = () => setBlockMenuPosition(null);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('blur', handleWindowChange);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('blur', handleWindowChange);
    };
  }, [blockMenuPosition]);

  useEffect(() => {
    if (!showSlashMenu) return;
    const handleWindowChange = () => closeSlashMenu();
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('blur', handleWindowChange);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('blur', handleWindowChange);
    };
  }, [showSlashMenu]);

  useEffect(() => {
    if (!showSlashMenu || !editorPaneRef.current) return;
    const pane = editorPaneRef.current;
    const handleScroll = () => closeSlashMenu();
    pane.addEventListener('scroll', handleScroll);
    return () => pane.removeEventListener('scroll', handleScroll);
  }, [showSlashMenu]);

  useEffect(() => {
    closeSlashMenu();
    setBlockMenuPosition(null);
    setTableContextMenu(null);
    setCellEditor(null);
  }, [note?.id]);

  useEffect(() => {
    if (!editor) return;
    const onBlur = () => closeSlashMenu();
    editor.on('blur', onBlur);
    return () => {
      editor.off('blur', onBlur);
    };
  }, [editor]);

  useEffect(() => {
    if (!editorPaneRef.current) return;
    const pane = editorPaneRef.current;
    const updateIndicator = (event: DragEvent) => {
      const blocks = Array.from(pane.querySelectorAll('.tiptap-editor > *')) as HTMLElement[];
      if (blocks.length === 0) return;
      const paneRect = pane.getBoundingClientRect();
      const hovered = blocks.find((block) => {
        const rect = block.getBoundingClientRect();
        return event.clientY >= rect.top && event.clientY <= rect.bottom;
      }) || blocks[blocks.length - 1];
      const rect = hovered.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      setDropIndicator({ top: (before ? rect.top : rect.bottom) - paneRect.top + pane.scrollTop, left: rect.left - paneRect.left + 8, width: Math.max(120, rect.width - 16) });
    };
    const onDragOver = (event: DragEvent) => {
      pane.classList.add('dragging-block');
      updateIndicator(event);
    };
    const clearIndicator = () => {
      pane.classList.remove('dragging-block');
      setDropIndicator(null);
    };
    pane.addEventListener('dragover', onDragOver);
    pane.addEventListener('dragleave', clearIndicator);
    pane.addEventListener('drop', clearIndicator);
    return () => {
      pane.removeEventListener('dragover', onDragOver);
      pane.removeEventListener('dragleave', clearIndicator);
      pane.removeEventListener('drop', clearIndicator);
    };
  }, [editor]);


  const runSlashAction = (action: () => void) => {
    if (!editor) return;
    const from = editor.state.selection.from;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 50), from, '');
    const match = textBefore.match(/\/([^\s/]*)$/);
    if (match) {
      const slashStart = from - match[0].length;
      editor.chain().focus().deleteRange({ from: slashStart, to: from }).run();
      const pos = Math.max(0, slashStart);
      const transaction = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos));
      editor.view.dispatch(transaction);
    }
    action();
    closeSlashMenu();
  };

  const resizeSelectedMedia = (width: string) => {
    if (!editor) return;
    if (editor.isActive('image')) editor.chain().focus().updateAttributes('image', { width }).run();
    else if (editor.isActive('videoNode')) editor.chain().focus().updateAttributes('videoNode', { width }).run();
    else if (editor.isActive('audioNode')) editor.chain().focus().updateAttributes('audioNode', { width }).run();
    else if (editor.isActive('embedNode')) editor.chain().focus().updateAttributes('embedNode', { width }).run();
    setSelectedMedia((value) => ({ ...value, width }));
  };

  const deleteSelectedMedia = () => {
    if (!editor) return;
    if (editor.isActive('image') || editor.isActive('videoNode') || editor.isActive('audioNode') || editor.isActive('embedNode') || editor.isActive('youtube')) editor.chain().focus().deleteSelection().run();
  };

  const tableActions = [
    { label: '上方插行', action: () => editor?.chain().focus().addRowBefore().run() },
    { label: '下方插行', action: () => editor?.chain().focus().addRowAfter().run() },
    { label: '删除当前行', action: () => editor?.chain().focus().deleteRow().run() },
    { label: '左侧插列', action: () => editor?.chain().focus().addColumnBefore().run() },
    { label: '右侧插列', action: () => editor?.chain().focus().addColumnAfter().run() },
    { label: '删除当前列', action: () => editor?.chain().focus().deleteColumn().run() },
    { label: '切换表头', action: () => editor?.chain().focus().toggleHeaderRow().run() },
    { label: '切换列表头', action: () => editor?.chain().focus().toggleHeaderColumn().run() },
    { label: '切换单元格头', action: () => editor?.chain().focus().toggleHeaderCell().run() },
    { label: '合并单元格', action: () => editor?.chain().focus().mergeCells().run() },
    { label: '拆分单元格', action: () => editor?.chain().focus().splitCell().run() },
    { label: '删除表格', action: () => editor?.chain().focus().deleteTable().run() },
  ];

  const runTableAction = (action: () => void) => {
    if (editor && tableSelectionRef.current) {
      try {
        if (tableSelectionRef.current.type === 'cell') {
          editor.commands.setCellSelection({
            anchorCell: Math.min(tableSelectionRef.current.anchor, editor.state.doc.content.size),
            headCell: Math.min(tableSelectionRef.current.head, editor.state.doc.content.size),
          });
        } else {
          const pos = Math.min(tableSelectionRef.current.from, editor.state.doc.content.size);
          editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(Math.max(1, pos)))));
        }
      } catch {
        // Ignore stale selection restoration and run the action anyway.
      }
    }
    action();
    setTableContextMenu(null);
  };

  const restoreStoredTableSelection = () => {
    if (!editor || !tableSelectionRef.current) return;
    try {
      if (tableSelectionRef.current.type === 'cell') {
        editor.commands.setCellSelection({
          anchorCell: Math.min(tableSelectionRef.current.anchor, editor.state.doc.content.size),
          headCell: Math.min(tableSelectionRef.current.head, editor.state.doc.content.size),
        });
      } else {
        const pos = Math.min(tableSelectionRef.current.from, editor.state.doc.content.size);
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(Math.max(1, pos)))));
      }
    } catch {
      // Ignore stale selection restoration.
    }
  };

  const setColumnPropertyType = (propertyType: 'text' | 'number' | 'select' | 'date' | 'checkbox') => {
    restoreStoredTableSelection();
    if (!editor) return;
    try {
      const rect = selectedRect(editor.state);
      const map = TableMap.get(rect.table);
      const topIndex = rect.left;
      const bottomIndex = (map.height - 1) * map.width + rect.left;
      const anchorCell = rect.tableStart + map.map[topIndex];
      const headCell = rect.tableStart + map.map[bottomIndex];
      editor.commands.setCellSelection({ anchorCell, headCell });
      editor.chain().focus().setCellAttribute('propertyType', propertyType).run();
    } catch {
      editor.chain().focus().setCellAttribute('propertyType', propertyType).run();
    }
    setColumnMenu(null);
  };

  const setColumnSelectMode = (mode: 'single' | 'multi') => {
    if (!editor) return;
    try {
      const rect = selectedRect(editor.state);
      const map = TableMap.get(rect.table);
      const tr = editor.state.tr;
      for (let row = 0; row < map.height; row += 1) {
        const index = row * map.width + rect.left;
        const cellPos = rect.tableStart + map.map[index];
        const cellNode = tr.doc.nodeAt(cellPos);
        if (!cellNode) continue;
        tr.setNodeMarkup(cellPos, cellNode.type, { ...cellNode.attrs, propertyMode: mode });
      }
      editor.view.dispatch(tr);
    } catch {
      editor.chain().focus().setCellAttribute('propertyMode', mode).run();
    }
    setColumnMenu(null);
  };

  const configureColumnOptions = () => {
    const raw = window.prompt('设置选项，使用英文逗号分隔', '待办,进行中,已完成');
    if (!raw || !editor) return;
    try {
      const rect = selectedRect(editor.state);
      const map = TableMap.get(rect.table);
      const tr = editor.state.tr;
      for (let row = 0; row < map.height; row += 1) {
        const index = row * map.width + rect.left;
        const cellPos = rect.tableStart + map.map[index];
        const cellNode = tr.doc.nodeAt(cellPos);
        if (!cellNode) continue;
        tr.setNodeMarkup(cellPos, cellNode.type, { ...cellNode.attrs, propertyOptions: raw });
      }
      editor.view.dispatch(tr);
    } catch {
      editor.chain().focus().setCellAttribute('propertyOptions', raw).run();
    }
    setColumnMenu(null);
  };

  const renameCurrentColumn = () => {
    if (!editor || !tableSelectionRef.current) return;
    restoreStoredTableSelection();
    const selection = editor.state.selection;
    let cellPos: number | null = null;
    if (selection instanceof CellSelection) cellPos = selection.$anchorCell.pos;
    else {
      const resolved = findCellPos(editor.state.doc, selection.from);
      cellPos = resolved?.pos ?? null;
    }
    if (cellPos === null) return;
    const cellNode = editor.state.doc.nodeAt(cellPos);
    const currentText = cellNode?.textContent || '';
    const nextText = window.prompt('重命名字段', currentText)?.trim();
    if (!nextText) return;
    const from = cellPos + 1;
    const to = cellPos + (cellNode?.nodeSize || 2) - 1;
    editor.chain().focus().insertContentAt({ from, to }, nextText).run();
    setColumnMenu(null);
  };

  const runInlineTableAction = (action: () => void) => {
    restoreStoredTableSelection();
    action();
  };

  const getCurrentBlockRange = () => {
    if (!editor) return null;
    const { $from } = editor.state.selection;
    const depth = 1;
    const node = editor.state.doc.childAfter($from.pos).node || $from.node(depth);
    if (!node) return null;
    const start = $from.start(depth);
    const end = start + node.nodeSize;
    return { node, start, end };
  };

  const moveCurrentBlock = (direction: 'up' | 'down') => {
    if (!editor) return;
    const range = getCurrentBlockRange();
    if (!range) return;
    const topNodes: Array<{ node: any; start: number; end: number }> = [];
    let pos = 0;
    editor.state.doc.content.forEach((node) => {
      const start = pos + 1;
      const end = start + node.nodeSize;
      topNodes.push({ node, start, end });
      pos = end - 1;
      return false;
    });
    const index = topNodes.findIndex((item) => item.start === range.start);
    if (index === -1) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= topNodes.length) return;
    const ordered = [...topNodes];
    [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
    const fragment = ordered.map((item) => item.node.toJSON());
    editor.commands.setContent({ type: 'doc', content: fragment }, { emitUpdate: true });
  };

  const copyCurrentBlock = async () => {
    const range = getCurrentBlockRange();
    if (!range) return;
    await navigator.clipboard.writeText(range.node.textContent || '');
    setBlockMenuPosition(null);
  };

  const copyCurrentBlockLink = async () => {
    const range = getCurrentBlockRange();
    if (!range) return;
    const text = (range.node.textContent || 'block').slice(0, 24).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-');
    const url = `${window.location.origin}${window.location.pathname}#${text || 'block'}`;
    await navigator.clipboard.writeText(url);
    setBlockMenuPosition(null);
  };

  const duplicateCurrentBlock = () => {
    if (!editor) return;
    const range = getCurrentBlockRange();
    if (!range) return;
    editor.chain().focus().insertContentAt(range.end, range.node.toJSON()).run();
    setBlockMenuPosition(null);
  };

  const insertBelowCurrentBlock = (content: string | Record<string, unknown>) => {
    if (!editor) return;
    const range = getCurrentBlockRange();
    const position = range ? range.end : editor.state.selection.to;
    editor.chain().focus().insertContentAt(position, content).run();
    setBlockMenuPosition(null);
  };

  const clearCurrentBlockStyle = () => {
    if (!editor) return;
    editor.chain().focus().setParagraph().unsetAllMarks().run();
    setBlockMenuPosition(null);
  };

  const deleteCurrentBlock = () => {
    if (!editor) return;
    const range = getCurrentBlockRange();
    if (!range) return;
    editor.chain().focus().deleteRange({ from: range.start, to: range.end }).run();
    setBlockMenuPosition(null);
  };

  const blockActions = [
    { label: '转为正文', icon: <Type size={14} />, action: () => editor?.chain().focus().setParagraph().run() },
    { label: '转为标题 1', icon: <Type size={14} />, action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: '转为标题 2', icon: <Type size={14} />, action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: '转为无序列表', icon: <List size={14} />, action: () => editor?.chain().focus().toggleBulletList().run() },
    { label: '转为有序列表', icon: <ListOrdered size={14} />, action: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: '高亮样式', icon: <Type size={14} />, action: () => editor?.chain().focus().toggleHighlight().run() },
    { label: '提示块样式', icon: <Type size={14} />, action: () => editor?.chain().focus().insertContent('<div data-callout="true">重点提示</div>').run() },
    { label: '上移块', icon: <Type size={14} />, action: () => moveCurrentBlock('up') },
    { label: '下移块', icon: <Type size={14} />, action: () => moveCurrentBlock('down') },
    { label: '复制块', icon: <Type size={14} />, action: () => duplicateCurrentBlock() },
    { label: '复制块内容', icon: <Type size={14} />, action: () => void copyCurrentBlock() },
    { label: '复制块链接', icon: <Type size={14} />, action: () => void copyCurrentBlockLink() },
    { label: '在下方插入正文', icon: <Type size={14} />, action: () => insertBelowCurrentBlock('<p></p>') },
    { label: '在下方插入待办项', icon: <List size={14} />, action: () => insertBelowCurrentBlock('<ul><li data-type="taskItem">待办事项</li></ul>') },
    { label: '清空样式', icon: <Type size={14} />, action: () => clearCurrentBlockStyle() },
    { label: '删除块', icon: <Trash2 size={14} />, action: () => deleteCurrentBlock() },
  ];

  const runBlockAction = (action: () => void) => {
    action();
    setBlockMenuPosition(null);
  };

  const renderRelations = showRelations ? (
    <div className="absolute right-4 top-4 z-10 w-52 rounded-[18px] border border-stone-200 bg-white/95 p-4 shadow-soft">
      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-400">信息</div>
      <p className="mb-4 max-h-20 overflow-y-auto break-words text-sm leading-6 text-stone-500">{summary}</p>
      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-400">引用与关联</div>
      <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
        {references.map((ref) => <div key={ref} className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-700">[[{ref}]]</div>)}
        {relatedNotes.map((item) => <div key={item.id} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-stone-700">{item.icon} {item.title}</div>)}
        {references.length === 0 && relatedNotes.length === 0 && <div className="text-sm text-stone-400">暂无引用与关联。</div>}
      </div>
    </div>
  ) : null;

  const renderOutline = showOutline ? (
    <div className="absolute right-4 top-4 z-10 w-44 rounded-[18px] border border-stone-200 bg-white/95 p-4 shadow-soft" onMouseEnter={() => setShowOutline(true)} onMouseLeave={() => setShowOutline(false)}>
      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-400">目录</div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {outline.length === 0 && <div className="text-sm text-stone-400">当前没有标题层级。</div>}
        {outline.map((item) => <a key={item.id} href={`#${item.id}`} className="block text-sm text-stone-700">{'-'.repeat(Math.max(1, item.level))} {item.text}</a>)}
      </div>
    </div>
  ) : null;

  return (
    <section className="flex h-[min(84vh,1160px)] min-h-[780px] flex-col gap-3 overflow-hidden rounded-[22px] border border-stone-200/80 bg-[rgba(255,255,255,0.86)] p-5 shadow-[0_12px_30px_rgba(28,25,23,0.06)] backdrop-blur">
      <EditorHeader
        icon={note?.icon ?? '📝'}
        title={note?.title ?? '未命名笔记'}
        savePhase={savePhase}
        isDirty={isDirty}
        lastSavedAt={lastSavedAt}
        showRelations={showRelations}
        showOutline={showOutline}
        viewMode={viewMode}
        onSave={() => { const latestHtml = editor?.getHTML() || html; setEditorHtml(latestHtml); void persistContent(latestHtml); }}
        onToggleRelations={() => setShowRelations((value) => !value)}
        onOutlineEnter={() => setShowOutline(true)}
        onOutlineLeave={() => setShowOutline(false)}
        onSetViewMode={setViewMode}
      />

      {selectedMedia.type && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-stone-400">已选中媒体块：{selectedMedia.type}</div>
          <div className="flex items-center gap-3">
            <input type="range" min="30" max="100" step="5" value={Number.parseInt(selectedMedia.width, 10) || 100} onChange={(event) => resizeSelectedMedia(`${event.target.value}%`)} className="w-full" />
            <div className="min-w-[56px] rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{selectedMedia.width}</div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] border border-stone-200 bg-white">
        {viewMode === 'edit' ? (
          <div className="flex h-full">
            <div
              ref={editorPaneRef}
              className="editor-pane relative min-h-0 flex-1 overflow-auto pl-24 pr-44 xl:pl-28 xl:pr-52"
              onMouseMove={(event) => {
                const target = event.target as HTMLElement | null;
                const table = target?.closest('table') as HTMLElement | null;
                void table;
              }}
              onContextMenu={(event) => {
                const target = event.target as HTMLElement | null;
                const table = target?.closest('table');
                if (!table || !tableActive) return;
                event.preventDefault();
                const selection = editor?.state.selection;
                if (selection instanceof CellSelection) {
                  tableSelectionRef.current = {
                    type: 'cell',
                    anchor: selection.$anchorCell.pos,
                    head: selection.$headCell.pos,
                  };
                } else if (selection) {
                  tableSelectionRef.current = { type: 'text', from: selection.from, to: selection.to };
                }
                const paneRect = editorPaneRef.current?.getBoundingClientRect();
                setTableContextMenu({ left: Math.max(12, event.clientX - (paneRect?.left || 0) + (editorPaneRef.current?.scrollLeft || 0)), top: Math.max(12, event.clientY - (paneRect?.top || 0) + (editorPaneRef.current?.scrollTop || 0)) });
              }}
              onClick={(event) => {
                const target = event.target as HTMLElement | null;
                const header = target?.closest('th');
                if (!header) return;
                const rect = header.getBoundingClientRect();
                const paneRect = editorPaneRef.current?.getBoundingClientRect();
                if (!paneRect) return;
                const clickOnHandle = event.clientX >= rect.right - 28 && event.clientY <= rect.top + 28;
                if (clickOnHandle) {
                  const selection = editor?.state.selection;
                  if (selection instanceof CellSelection) {
                    tableSelectionRef.current = {
                      type: 'cell',
                      anchor: selection.$anchorCell.pos,
                      head: selection.$headCell.pos,
                    };
                  } else if (selection) {
                    tableSelectionRef.current = { type: 'text', from: selection.from, to: selection.to };
                  }
                  setColumnMenu({
                    left: Math.max(12, rect.right - paneRect.left + (editorPaneRef.current?.scrollLeft || 0) - 180),
                    top: Math.max(12, rect.bottom - paneRect.top + (editorPaneRef.current?.scrollTop || 0) + 8),
                  });
                }
              }}
              onMouseLeave={() => {
              }}
            >
              <input id="editor-local-media-input" type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadLocalMedia(editor || null, file); event.target.value = ''; }} />
              {editor && (
                <DragHandle editor={editor} className={`notion-drag-handle ${activeBlockHandle ? 'is-visible' : ''}`} nested onNodeChange={({ node }) => setActiveBlockHandle(Boolean(node))}>
                  <div className="notion-block-toolbar flex items-center gap-1 rounded-xl bg-white/92 p-1 text-stone-500 shadow-soft">
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); const paneRect = editorPaneRef.current?.getBoundingClientRect(); const nextLeft = (event.clientX - (paneRect?.left || 0)) + (editorPaneRef.current?.scrollLeft || 0); const nextTop = (event.clientY - (paneRect?.top || 0)) + (editorPaneRef.current?.scrollTop || 0) + 12; if (showSlashMenu) closeSlashMenu(); else openSlashMenu(nextLeft, nextTop); editor.chain().focus().run(); }} className="notion-block-button" aria-label="插入块">
                      <Plus size={14} />
                    </button>
                    <div className="notion-block-button cursor-grab" aria-label="拖拽块" data-drag-handle>
                      <GripVertical size={15} />
                    </div>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); const paneRect = editorPaneRef.current?.getBoundingClientRect(); const next = clampFloatingPosition((event.clientX - (paneRect?.left || 0)) + (editorPaneRef.current?.scrollLeft || 0), (event.clientY - (paneRect?.top || 0)) + (editorPaneRef.current?.scrollTop || 0) + 12); setBlockMenuPosition(next); editor.chain().focus().run(); }} className="notion-block-button" aria-label="块菜单">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </DragHandle>
              )}
              {renderRelations}
              {renderOutline}
              <SlashMenu visible={showSlashMenu} menuRef={slashMenuRef} listRef={slashListRef} position={slashPosition} query={slashQuery} items={filteredSlashItems} activeIndex={slashIndex} renderLabel={(label) => highlightSlashLabel(label, slashQuery)} onPick={runSlashAction} />
              {blockMenuPosition && (
                <div ref={blockMenuRef} onMouseDown={(event) => event.stopPropagation()} className="absolute z-40 min-w-[220px] rounded-[16px] border border-stone-200 bg-white p-2 shadow-soft" style={{ left: `${blockMenuPosition.left}px`, top: `${blockMenuPosition.top}px` }}>
                  <div className="mb-1 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-400">块菜单</div>
                  {blockActions.map((item) => (
                    <button key={item.label} onMouseDown={(event) => event.preventDefault()} onClick={() => runBlockAction(item.action)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100">
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <TableMenus contextMenu={tableContextMenu} actions={tableActions} onRunAction={runTableAction} />
              {tableActive && tableInlineControls && (
                <>
                  <button
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runInlineTableAction(() => editor?.chain().focus().addColumnAfter().run())}
                    className="table-inline-add"
                    style={{ left: `${tableInlineControls.right - 20}px`, top: `${tableInlineControls.top - 18}px` }}
                  >
                    + 列
                  </button>
                  <button
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runInlineTableAction(() => editor?.chain().focus().addRowAfter().run())}
                    className="table-inline-add"
                    style={{ left: `${tableInlineControls.left}px`, top: `${tableInlineControls.bottom + 10}px` }}
                  >
                    + 行
                  </button>
                </>
              )}
              {columnMenu && (
                <div id="table-column-menu" className="absolute z-30 min-w-[250px] rounded-[18px] border border-stone-200 bg-white p-3 shadow-soft" style={{ left: `${columnMenu.left}px`, top: `${columnMenu.top}px` }}>
                  <div className="mb-3 px-2">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-stone-400">字段配置</div>
                    <div className="mt-1 text-sm font-medium text-stone-700">当前列属性</div>
                  </div>

                  <div className="rounded-[16px] bg-stone-50/80 p-2">
                    <div className="mb-1 px-2 text-[11px] uppercase tracking-[0.16em] text-stone-400">字段名称</div>
                    <button onMouseDown={(event) => event.preventDefault()} onClick={() => renameCurrentColumn()} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white">重命名字段</button>
                  </div>

                  <div className="mt-3 rounded-[16px] bg-stone-50/80 p-2">
                    <div className="mb-1 px-2 text-[11px] uppercase tracking-[0.16em] text-stone-400">字段类型</div>
                    <div className="grid grid-cols-2 gap-1">
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => setColumnPropertyType('text')} className="rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white">Aa 文本</button>
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => setColumnPropertyType('number')} className="rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white"># 数字</button>
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => setColumnPropertyType('select')} className="rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white">◉ 选项</button>
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => setColumnPropertyType('date')} className="rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white">📅 日期</button>
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => setColumnPropertyType('checkbox')} className="rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white">☑ 勾选</button>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[16px] bg-stone-50/80 p-2">
                    <div className="mb-1 px-2 text-[11px] uppercase tracking-[0.16em] text-stone-400">结构操作</div>
                    <button onMouseDown={(event) => event.preventDefault()} onClick={() => { runTableAction(() => editor?.chain().focus().toggleHeaderColumn().run()); setColumnMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white">切换列表头</button>
                    <button onMouseDown={(event) => event.preventDefault()} onClick={() => { runTableAction(() => editor?.chain().focus().addColumnBefore().run()); setColumnMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white">在左侧插列</button>
                    <button onMouseDown={(event) => event.preventDefault()} onClick={() => { runTableAction(() => editor?.chain().focus().addColumnAfter().run()); setColumnMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-white">在右侧插列</button>
                    <button onMouseDown={(event) => event.preventDefault()} onClick={() => { runTableAction(() => editor?.chain().focus().deleteColumn().run()); setColumnMenu(null); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">删除当前列</button>
                  </div>
                  <div className="mt-3 rounded-[16px] bg-stone-50/80 p-2">
                    <div className="mb-1 px-2 text-[11px] uppercase tracking-[0.16em] text-stone-400">选项配置</div>
                    <div className="flex gap-2 px-1">
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => setColumnSelectMode('single')} className="rounded-xl px-3 py-2 text-left text-xs text-stone-700 hover:bg-white">单选</button>
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => setColumnSelectMode('multi')} className="rounded-xl px-3 py-2 text-left text-xs text-stone-700 hover:bg-white">多选</button>
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => configureColumnOptions()} className="rounded-xl px-3 py-2 text-left text-xs text-stone-700 hover:bg-white">设置选项</button>
                    </div>
                  </div>
                </div>
              )}
              {cellEditor && (
                <div id="table-cell-editor" className="absolute z-30 min-w-[220px] rounded-[16px] border border-stone-200 bg-white p-3 shadow-soft" style={{ left: `${cellEditor.left}px`, top: `${cellEditor.top}px` }}>
                  {cellEditor.type === 'date' ? (
                    <div>
                      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-stone-400">日期属性</div>
                      <input type="datetime-local" value={dateDraft} onChange={(event) => setDateDraft(event.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
                      <button onMouseDown={(event) => event.preventDefault()} onClick={() => { updateCellAttrs(cellEditor.cellPos, { dateValue: dateDraft }, dateDraft ? new Date(dateDraft).toLocaleString('zh-CN') : ''); setCellEditor(null); }} className="mt-3 w-full rounded-xl bg-stone-900 px-3 py-2 text-sm text-white">保存日期</button>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-stone-400">选项属性</div>
                      <div className="space-y-2">
                        {(cellEditor.options || []).map((option) => {
                          const current = (cellEditor.value || '').split(',').map((item) => item.trim()).filter(Boolean);
                          const selected = current.includes(option);
                          return (
                            <button
                              key={option}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                const next = cellEditor.mode === 'multi' ? (selected ? current.filter((item) => item !== option) : [...current, option]) : [option];
                                const value = next.join(', ');
                                updateCellAttrs(cellEditor.cellPos, { selectValue: value }, value);
                                if (cellEditor.mode !== 'multi') setCellEditor(null);
                                else setCellEditor({ ...cellEditor, value });
                              }}
                              className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${selected ? 'bg-emerald-50 text-emerald-700' : 'text-stone-700 hover:bg-stone-100'}`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {dropIndicator && <div className="editor-drop-indicator" style={{ top: `${dropIndicator.top}px`, left: `${dropIndicator.left}px`, width: `${dropIndicator.width}px` }} />}
              <EditorContent editor={editor} />
            </div>
          </div>
        ) : <div className="tiptap-preview h-full overflow-y-auto px-8 py-4" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </section>
  );
}
