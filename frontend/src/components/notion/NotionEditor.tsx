import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { FloatingMenu, BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import UnderlineExtension from '@tiptap/extension-underline';
import { Blockquote } from '@tiptap/extension-blockquote';
import { BulletList } from '@tiptap/extension-bullet-list';
import { OrderedList } from '@tiptap/extension-ordered-list';
import { ListItem } from '@tiptap/extension-list-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Table as TiptapTable } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import Youtube from '@tiptap/extension-youtube';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';

const lowlight = createLowlight(common);

import { 
  AudioNode, CalloutNode, DatabaseTableCell, DatabaseTableHeader, 
  EmbedNode, ResizableImage, TaskItem, TaskList, VideoNode, WikiLink,
  SlashCommands, FileNode, Heading
} from '../../lib/tiptapExtensions';

import { SlashItem, getSuggestionConfig } from './SlashMenu';
import { PropertyPanel } from '../editor/PropertyPanel';
import { EditorHeader } from '../editor/EditorHeader';
import { CodeBlockComponent } from '../editor/CodeBlockComponent';
import { api } from '../../lib/api';
import { uploadLocalMedia, genericEmbedUrl } from '../editor/utils';
import type { Note } from '../../lib/types';
import { useAppStore } from '../../store/useAppStore';

import {
  Type, Heading1, Heading2, Heading3, CheckSquare, List, ListOrdered,
  Quote, Minus, Plus, Table, FileCode, ImageIcon,
  Sparkles, Wand2, GripVertical, Bold, Italic, Underline, Code, Link2, Eraser,
  Rows, Columns, Trash2, Combine, Split, Settings2, Calendar, Hash, CheckCircle2,
  Bookmark as BookMarked
} from 'lucide-react';

interface NotionEditorProps {
  note: Note | null;
  notes: Note[];
  onSave: (payload: any) => Promise<void>;
  onUpdateTags?: (noteId: number, tags: string[]) => Promise<void>;
  onTogglePrivate?: () => void;
  isPrivate?: boolean;
  canRevealPrivateContent?: boolean;
  onCreateSubPage: (parentId: number) => void;
  onSelectNote: (noteId: number) => void;
  onNotify?: (text: string, tone?: 'success' | 'error' | 'info') => void;
  outline: any[];
  references: string[];
  relatedNotes: Note[];
}

export const NotionEditor: React.FC<NotionEditorProps> = ({
  note, notes, onSave, onUpdateTags, onTogglePrivate, isPrivate = false, canRevealPrivateContent = true, onCreateSubPage, onSelectNote, onNotify, outline, references, relatedNotes
}) => {
  const { userStats } = useAppStore();
  const hasWallpaper = !!userStats?.wallpaper_url;
  console.log("NotionEditor (V4 Table Upgrade) Loaded");
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showOutline, setShowOutline] = useState(false);
  const outlineTimeoutRef = useRef<any>(null);

  const handleOutlineEnter = useCallback(() => {
    if (outlineTimeoutRef.current) window.clearTimeout(outlineTimeoutRef.current);
    setShowOutline(true);
  }, []);

  const handleOutlineLeave = useCallback(() => {
    outlineTimeoutRef.current = window.setTimeout(() => {
      setShowOutline(false);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (outlineTimeoutRef.current) window.clearTimeout(outlineTimeoutRef.current);
    };
  }, []);

  const [isAIStreaming, setIsAIStreaming] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [savePhase, setSavePhase] = useState<'idle' | 'queued' | 'saving' | 'error'>('idle');
  const [propertyMenuNode, setPropertyMenuNode] = useState<{ pos: number; rect: DOMRect } | null>(null);
  const [activeTableRect, setActiveTableRect] = useState<DOMRect | null>(null);
  const [activeRowRect, setActiveRowRect] = useState<DOMRect | null>(null);
  const [activeTablePos, setActiveTablePos] = useState<number | null>(null);
  const [activeRowPos, setActiveRowPos] = useState<number | null>(null);
  const [hoveredRowIndex, setHoveredRowIndex] = useState<number | null>(null);
  const [clickedRowIndex, setClickedRowIndex] = useState<number | null>(null);
  
  // Use a ref to track the last hovered elements to avoid redundant state updates
  const lastHoveredRef = useRef<{ table: HTMLElement | null; tr: HTMLElement | null }>({ table: null, tr: null });
  
  const editorRef = useRef<any>(null);

  const updateTableRect = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor || viewMode === 'preview') {
      setActiveTableRect(null);
      setActiveRowRect(null);
      return;
    }

    try {
      // 优先从原生 DOM 选区寻找，这是最直接且不依赖 Tiptap 状态的方法
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const tableElement = container.nodeType === Node.ELEMENT_NODE 
          ? (container as HTMLElement).closest('table')
          : container.parentElement?.closest('table');

        if (tableElement) {
          const rect = tableElement.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setActiveTableRect(rect);
            
            // 追踪当前行
            const rowElement = container.nodeType === Node.ELEMENT_NODE 
              ? (container as HTMLElement).closest('tr')
              : container.parentElement?.closest('tr');
            
            if (rowElement) {
              setActiveRowRect(rowElement.getBoundingClientRect());
            } else {
              setActiveRowRect(null);
            }
            return;
          }
        }
      }

      // 备选方案：通过 Tiptap 检查
      if (currentEditor.isActive('table')) {
        // 寻找编辑器内包含特定类名的表格
        const tableDOM = currentEditor.view.dom.querySelector('table:has(.selectedCell), table.prose-mirror-selected-node');
        if (tableDOM) {
          const rect = tableDOM.getBoundingClientRect();
          setActiveTableRect(rect);
          
          const rowDOM = currentEditor.view.dom.querySelector('tr:has(.selectedCell)');
          if (rowDOM) {
            setActiveRowRect(rowDOM.getBoundingClientRect());
          } else {
            setActiveRowRect(null);
          }
          return;
        }
      }
    } catch (e) {
      console.error("Table detection failed", e);
    }

    setActiveTableRect(null);
    setActiveRowRect(null);
  }, [viewMode]);


  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lastSyncedNoteIdRef = useRef<number | null>(null);
  const noteRef = useRef<Note | null>(note);
  const onCreateSubPageRef = useRef(onCreateSubPage);

  // Keep refs up to date to avoid re-calculating slashItems too often
  useEffect(() => {
    noteRef.current = note;
    onCreateSubPageRef.current = onCreateSubPage;
  }, [note, onCreateSubPage]);

  // Define handleAIAction inside the component to use it in slashItems
  const handleAIAction = useCallback(async (action: string, customPrompt?: string) => {
    if (isPrivate) {
      onNotify?.('私密笔记暂不支持将内容发送给 AI。', 'info');
      return;
    }
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const { from, to } = currentEditor.state.selection;
    const selectedText = currentEditor.state.doc.textBetween(from, to, ' ');
    const context = currentEditor.getText().slice(0, 1000);
    
    setIsAIStreaming(true);

    let currentPos = to;
    if (action !== 'continue' && action !== 'ask') {
      currentEditor.chain().focus().deleteSelection().run();
      currentPos = from;
    }

    try {
      const prompt = customPrompt || selectedText;
      await api.streamInlineAI({ prompt, context, action }, (chunk) => {
        currentEditor.chain().focus().insertContentAt(currentPos, chunk).run();
        currentPos += chunk.length;
      });
      onNotify?.('AI 生成完成', 'success');
    } catch (error) {
      console.error('AI streaming failed:', error);
      onNotify?.('AI 生成失败，请检查网络或配置', 'error');
    } finally {
      setIsAIStreaming(false);
    }
  }, [isPrivate, onNotify]);

  // Use a ref to store the latest slash items to avoid re-creating extensions
  const slashItemsRef = useRef<SlashItem[]>([]);

  const slashItems: SlashItem[] = useMemo(() => [
    { group: '基础', label: '正文', description: '插入普通文本段落', icon: <Type size={18} />, keywords: ['p', 'text', 'zw'], action: (c) => c.setParagraph() },
    { group: '基础', label: '表格', description: '插入飞书级强大表格', icon: <Table size={18} className="text-blue-600" />, keywords: ['table', 'bg', 'bg'], action: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
    { group: '标题', label: '标题 1', description: '最大的标题', icon: <Heading1 size={18} />, keywords: ['h1', 'bt1'], action: (c) => c.toggleHeading({ level: 1 }) },
    { group: '标题', label: '标题 2', description: '中等标题', icon: <Heading2 size={18} />, keywords: ['h2', 'bt2'], action: (c) => c.toggleHeading({ level: 2 }) },
    { group: '标题', label: '标题 3', description: '小标题', icon: <Heading3 size={18} />, keywords: ['h3', 'bt3'], action: (c) => c.toggleHeading({ level: 3 }) },
    { group: '列表', label: '任务列表', description: '带复选框的任务', icon: <CheckSquare size={18} />, keywords: ['todo', 'task', 'rw'], action: (c) => c.toggleTaskList() },
    { group: '列表', label: '无序列表', description: '普通的圆点列表', icon: <List size={18} />, keywords: ['ul', 'list', 'lb'], action: (c) => c.toggleBulletList() },
    { group: '列表', label: '有序列表', description: '带数字的列表', icon: <ListOrdered size={18} />, keywords: ['ol', 'number', 'lb'], action: (c) => c.toggleOrderedList() },
    { group: '内容', label: '引用', description: '插入一段引用', icon: <Quote size={18} />, keywords: ['quote', 'yy'], action: (c) => c.toggleBlockquote() },
    { group: '内容', label: '代码块', description: '带语法的代码块', icon: <FileCode size={18} />, keywords: ['code', 'dm'], action: (c) => c.toggleCodeBlock() },
    { group: '内容', label: '分割线', description: '水平分割线', icon: <Minus size={18} />, keywords: ['hr', 'fgx'], action: (c) => c.setHorizontalRule() },
    { group: '高级', label: '子页面', description: '在当前位置新建子页面', icon: <Plus size={18} className="text-amber-600" />, keywords: ['page', 'sub', 'zym'], action: () => {
      const currentNote = noteRef.current;
      if (currentNote) onCreateSubPageRef.current(currentNote.id);
    }},
    { group: '高级', label: '提示块', description: 'Callout 强调块', icon: <Type size={18} className="text-blue-500" />, keywords: ['callout', 'ts'], action: (c) => c.insertContent('<div data-callout="true"><p>新的提示内容</p></div>') },
    { group: '媒体', label: '图片', description: '上传或插入图片', icon: <ImageIcon size={18} />, keywords: ['image', 'tp'], action: (c) => {
      const url = window.prompt('请输入图片 URL 或点击下方上传图标');
      if (url) c.setImage({ src: url });
    }},
    { group: '媒体', label: '文件', description: '上传或插入文件', icon: <Plus size={18} />, keywords: ['file', 'wj', 'fujian'], action: () => {
      document.getElementById('editor-local-media-input')?.click();
    }},
    { group: 'AI', label: 'AI 续写', description: '基于上文继续生成内容', icon: <Sparkles size={18} className="text-purple-500" />, keywords: ['ai', 'xx'], action: () => handleAIAction('continue') },
    { group: 'AI', label: 'AI 总结', description: '总结选中内容', icon: <Wand2 size={18} className="text-purple-500" />, keywords: ['ai', 'zj'], action: () => handleAIAction('summarize') },
  ], [handleAIAction]);

  useEffect(() => {
    slashItemsRef.current = slashItems;
  }, [slashItems]);

  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: false, // Disable default heading to use our Heading with ID support
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      link: false,
      underline: false,
    }),
    Heading.configure({ levels: [1, 2, 3] }),
    BulletList.configure({
      HTMLAttributes: { class: 'notion-bullet-list' },
    }),
    OrderedList.configure({
      HTMLAttributes: { class: 'notion-ordered-list' },
    }),
    ListItem,
    Blockquote.configure({
      HTMLAttributes: { class: 'notion-blockquote' },
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockComponent);
      },
    }).configure({
      lowlight,
    }),
    Link.configure({ openOnClick: true, autolink: true }),
    Highlight,
    UnderlineExtension,
    TiptapTable.configure({ resizable: true }),
    TableRow,
    DatabaseTableHeader,
    DatabaseTableCell,
    Youtube.configure({ controls: true, nocookie: true, autoplay: false }),
    AudioNode,
    VideoNode,
    EmbedNode,
    FileNode,
    CalloutNode,
    WikiLink,
    TaskList,
    TaskItem.configure({ nested: true }),
    ResizableImage.configure({ inline: false }),
    SlashCommands.configure({
      suggestion: getSuggestionConfig(slashItemsRef)
    })
  ], []); // Constant extensions reference

  const editor = useEditor({
    extensions,
    content: note?.content || '',
    immediatelyRender: false,
    editorProps: {
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        
        // Handle table header property menu click
        const th = target.closest('th');
        if (th) {
          const rect = th.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          
          // If clicked in the top-right corner (approx 40x40 area)
          if (x > rect.width - 40 && y < 40) {
            console.log("Table header menu clicked via DOM", { x, y, width: rect.width });
            try {
              const pos = view.posAtDOM(th, 0);
              setPropertyMenuNode({ pos, rect });
              return true;
            } catch (err) {
              console.error("Failed to get pos for header menu", err);
            }
          }
        }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          uploadLocalMedia(editorRef.current, file);
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain') || '';
        if (!text) return false;
        
        const embed = genericEmbedUrl(text);
        if (embed) {
          if (embed.kind === 'youtube') {
            editorRef.current?.commands.setYoutubeVideo({ src: embed.src });
            return true;
          } else if (embed.kind === 'iframe') {
            editorRef.current?.commands.insertContent({
              type: 'embedNode',
              attrs: { src: embed.src }
            });
            return true;
          }
        }
        return false;
      },
      attributes: {
        class: 'tiptap-notion tiptap-editor prose prose-reflect focus:outline-none min-h-[500px] w-full max-w-[800px] mx-auto pt-0 px-8 mb-32 font-serif text-reflect-text selection:bg-reflect-accent/10'
      }
    }
  }, []); // Remove note?.id dependency to prevent editor recreation on ID change (e.g. draft promotion)

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;

    // Sync editable status with viewMode
    editor.setEditable(viewMode === 'edit');

    const handleMouseMove = (e: MouseEvent) => {
      if (viewMode !== 'edit') return;
      const target = e.target as HTMLElement;
      
      // 寻找表格和行
      const table = target.closest('table');
      const tr = target.closest('tr');

      let rowIndex = -1;
      let rowRect: DOMRect | null = null;

      if (tr) {
        rowRect = tr.getBoundingClientRect();
        // 获取行索引
        const tbody = tr.parentElement;
        if (tbody) {
          rowIndex = Array.from(tbody.children).indexOf(tr);
        }
      }

      // Check if the hovered elements have actually changed before updating state
      if (table !== lastHoveredRef.current.table || tr !== lastHoveredRef.current.tr) {
        lastHoveredRef.current = { table, tr };
        
        if (table) {
          setActiveTableRect(table.getBoundingClientRect());
          
          // 获取表格位置
          try {
            const tablePos = editor.view.posAtDOM(table, 0);
            setActiveTablePos(tablePos);
          } catch (e) {}

          if (tr) {
            setActiveRowRect(tr.getBoundingClientRect());
            setHoveredRowIndex(rowIndex);
            // 获取行位置
            try {
              const rowPos = editor.view.posAtDOM(tr, 0);
              setActiveRowPos(rowPos);
            } catch (e) {}
          } else {
            setActiveRowRect(null);
            setHoveredRowIndex(null);
            setActiveRowPos(null);
          }
        } else {
          // 如果不在表格内，检查是否在控制按钮内
          const isOverControls = target.closest('.table-controls-container') || target.closest('.row-side-handle');
          if (!isOverControls) {
            setActiveTableRect(null);
            setActiveRowRect(null);
            setHoveredRowIndex(null);
            setClickedRowIndex(null); // 鼠标移出表格且不在按钮上时，重置点击状态
            setActiveTablePos(null);
            setActiveRowPos(null);
          }
        }
      }
    };

    const handleUpdate = () => {
      if (!editorRef.current) return;
      
      // 在执行 UI 更新前，确保选区合法。
      const { selection } = editor.state;
      if (selection instanceof TextSelection && selection.$cursor === null) {
        const $from = selection.$from;
        if ($from.parent.type.name === 'tableRow') {
          try {
            const row = $from.parent;
            if (row.firstChild) {
              const firstCellPos = $from.pos + 1;
              editor.commands.setTextSelection(firstCellPos);
            }
          } catch (e) {}
        }
      }

      updateTableRect();
      
      const { $from } = selection;
      if (!editor.isActive('table')) {
        setPropertyMenuNode(null);
        setHoveredRowIndex(null);
        setClickedRowIndex(null);
      }
    };

    const handleScrollAndResize = () => updateTableRect();

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    editor.on('focus', handleUpdate);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScrollAndResize, true);
    window.addEventListener('resize', handleScrollAndResize);

    // 初始执行一次（需要在卸载时清理，避免卸载后 setState）
    const initUpdateTimer = window.setTimeout(handleUpdate, 100);

    return () => {
      window.clearTimeout(initUpdateTimer);
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
      editor.off('focus', handleUpdate);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScrollAndResize, true);
      window.removeEventListener('resize', handleScrollAndResize);
    };
  }, [editor, updateTableRect, viewMode]);

  // Sync with Note content — 只在切换笔记时（note.id 变化）同步内容
  // 同一篇笔记的自动保存回流绝对不允许覆盖编辑器当前内容
  // 在单人编辑场景下，编辑器内存状态是唯一事实来源
  useEffect(() => {
    if (!editor || !note) return;
    
    // 识别“草稿转正”：如果 ID 从负数变正数，认为是同一篇笔记，不触发重置
    const isDraftPromotion = typeof lastSyncedNoteIdRef.current === 'number' && 
                             lastSyncedNoteIdRef.current < 0 && 
                             note.id > 0;
                             
    if (lastSyncedNoteIdRef.current === note.id || isDraftPromotion) {
      lastSyncedNoteIdRef.current = note.id; // 只更新引用 ID
      return;
    }

    // 只有在确定是切换到完全不同的笔记时，才全量同步内容
    // 强制同步一次内容，并重置上次同步 ID
    let content = note.content || '<p></p>';
    
    // Sanitization: Remove any orphan blob URLs from previous failed sessions
    if (content.includes('src="blob:')) {
      const doc = new DOMParser().parseFromString(content, 'text/html');
      doc.querySelectorAll('[src^="blob:"]').forEach(el => {
        el.setAttribute('src', '');
        el.setAttribute('data-broken-upload', 'true');
      });
      content = doc.body.innerHTML;
    }
    
    editor.commands.setContent(content);
    lastSyncedNoteIdRef.current = note.id;
    setLastSavedAt(new Date().toLocaleTimeString());
    
  }, [note?.id, editor]); // ← 关键：只依赖 note.id，不依赖整个 note 对象

  // Auto-save logic with Debounce and Ref Lock (v0.3.41)
  const isSavingRef = useRef<number | null>(null);
  const onSaveRef = useRef(onSave);
  const isUnmountedRef = useRef(false);
  const latestSaveRequestRef = useRef(0);

  useEffect(() => {
    if (!note) {
      setIsDirty(false);
      setSavePhase('idle');
      return;
    }

    if (note.sync_status === 'error') {
      setSavePhase('error');
      return;
    }

    if (note.sync_status === 'queued') {
      setSavePhase('queued');
      return;
    }

    if (note.sync_status === 'saving') {
      setSavePhase('saving');
      return;
    }

    if (!isDirty) {
      setSavePhase('idle');
    }
  }, [note?.id, note?.sync_status, isDirty]);


  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
    };
  }, []);
  
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!editor || !note) return;

    let timer: ReturnType<typeof setTimeout>;
    let isModified = false;

    // Use closure variable 'note' which refers to the note of THIS render
    const currentSessionNoteId = note.id;

    const executeSave = async (isSync = false) => {
      if (!isModified && !isSync) return;

      // Allow saving even if unmounted, just skip React state updates
      const currentContent = editor.getHTML();
      const currentText = editor.getText().trim();

      let newTitle = note.title || '未命名笔记';
      const isTitleEdited = note.is_title_manually_edited || false;

      if (!isTitleEdited && currentText) {
        const firstLine = currentText.split('\n')[0].trim();
        if (firstLine) newTitle = firstLine.slice(0, 100);
      }

      if (currentContent === note.content && newTitle === note.title) {
        isModified = false;
        setIsDirty(false);
        if (note.sync_status !== 'error' && note.sync_status !== 'queued' && note.sync_status !== 'saving') {
          setSavePhase('idle');
        }
        return;
      }

      const requestId = latestSaveRequestRef.current + 1;
      latestSaveRequestRef.current = requestId;
      isSavingRef.current = currentSessionNoteId;
      if (!isUnmountedRef.current && noteRef.current?.id === currentSessionNoteId) {
        setIsSaving(true);
        setSavePhase('saving');
      }

      try {
        await onSaveRef.current({
          id: currentSessionNoteId,
          content: currentContent,
          title: newTitle,
          icon: note.icon,
          parent_id: note.parent_id,
          is_title_manually_edited: isTitleEdited,
          silent: true
        });

        if (latestSaveRequestRef.current !== requestId) {
          return;
        }

        isModified = false;
        if (!isUnmountedRef.current && noteRef.current?.id === currentSessionNoteId) {
          setIsDirty(false);
          setLastSavedAt(new Date().toLocaleTimeString());
          if (noteRef.current?.sync_status !== 'error') {
            setSavePhase('idle');
          }
        }
      } catch (error) {
        console.error('Auto-save failed', error);
        if (!isUnmountedRef.current && noteRef.current?.id === currentSessionNoteId) {
          setSavePhase('error');
        }
      } finally {
        if (isSavingRef.current === currentSessionNoteId) isSavingRef.current = null;
        if (!isUnmountedRef.current && noteRef.current?.id === currentSessionNoteId) setIsSaving(false);
      }
    };

    const handleSave = async () => {
      if (isSavingRef.current === currentSessionNoteId) {
        timer = setTimeout(handleSave, 1000);
        return;
      }
      await executeSave();
    };

    const onUpdate = () => {
      isModified = true;
      setIsDirty(true);
      setSavePhase('queued');
      clearTimeout(timer);
      timer = setTimeout(handleSave, 1500);
    };

    const flushPendingChanges = () => {
      if (isModified) {
        void executeSave(true);
      }
    };

    editor.on('update', onUpdate);
    window.addEventListener('pagehide', flushPendingChanges);
    window.addEventListener('beforeunload', flushPendingChanges);

    return () => {
      clearTimeout(timer);
      editor.off('update', onUpdate);
      window.removeEventListener('pagehide', flushPendingChanges);
      window.removeEventListener('beforeunload', flushPendingChanges);

      // Cleanup happens BEFORE the next render's useEffect.
      // So editor content is still the old one. We MUST save it!
      if (isModified) {
        executeSave(true).catch(console.error);
      }
    };
  }, [editor, note?.id]); // 只依赖 note.id

  return (
    <div ref={editorContainerRef} className={`relative flex flex-col h-full bg-reflect-bg overflow-hidden notion-editor-layout ${viewMode === 'preview' ? 'is-preview' : ''} ${hasWallpaper ? 'bg-transparent' : ''}`}>
      <div className={`flex-1 overflow-y-auto relative bg-reflect-bg scrollbar-hide pt-0 ${hasWallpaper ? 'bg-transparent' : ''}`}>
        <div className="flex flex-col w-full max-w-[800px] mx-auto">
          <div className="px-8">
            <EditorHeader
              icon={note?.icon ?? '📝'}
              title={note?.title ?? '未命名笔记'}
              isTitleManuallyEdited={note?.is_title_manually_edited ?? false}
              breadcrumbs={[]}
              onSelectBreadcrumb={onSelectNote}
              savePhase={savePhase}
              isDirty={isDirty}
              lastSavedAt={lastSavedAt}
              showRelations={false}
              showOutline={showOutline}
              viewMode={viewMode}
              onSave={() => {
                if (editor && note) {
                  let content = editor.getHTML();
                  if (content.includes('src="blob:')) {
                    const doc = new DOMParser().parseFromString(content, 'text/html');
                    doc.querySelectorAll('[src^="blob:"]').forEach(el => el.setAttribute('src', ''));
                    content = doc.body.innerHTML;
                  }
                  onSave({ 
                    id: note.id, 
                    content: content, 
                    title: note.title, 
                    icon: note.icon,
                    parent_id: note.parent_id,
                    is_title_manually_edited: note.is_title_manually_edited
                  });
                }
              }}
              onUpdateTitle={(newTitle, isManual) => {
                if (note) {
                  onSave({ 
                    ...note, 
                    title: newTitle, 
                    is_title_manually_edited: isManual, 
                    silent: true 
                  });
                }
              }}
              onToggleRelations={() => {}}
              onOutlineEnter={handleOutlineEnter}
              onOutlineLeave={handleOutlineLeave}
              onSetViewMode={setViewMode}
            />

            {showOutline && isPrivate && !canRevealPrivateContent && (
              <div
                className="fixed top-24 right-12 z-[100] w-64 bg-white/95 backdrop-blur-md border border-stone-200 rounded-xl shadow-2xl p-4 animate-in fade-in slide-in-from-right-4 duration-200"
                onMouseEnter={handleOutlineEnter}
                onMouseLeave={handleOutlineLeave}
              >
                <div className="flex items-center gap-2 mb-3 text-stone-500">
                  <BookMarked size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">文章大纲</span>
                </div>
                <div className="py-4 text-center">
                  <p className="text-xs text-stone-500 italic">私密笔记锁定中</p>
                  <p className="text-[10px] text-stone-400 mt-1">解锁后才会显示大纲内容</p>
                </div>
              </div>
            )}

            {showOutline && (!isPrivate || canRevealPrivateContent) && (
              <div
                className="fixed top-24 right-12 z-[100] w-64 bg-white/95 backdrop-blur-md border border-stone-200 rounded-xl shadow-2xl p-4 animate-in fade-in slide-in-from-right-4 duration-200"
                onMouseEnter={handleOutlineEnter}
                onMouseLeave={handleOutlineLeave}
              >
                <div className="flex items-center gap-2 mb-3 text-stone-500">
                  <BookMarked size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest">文章大纲</span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto scrollbar-hide">
                  {outline.length > 0 ? (
                    outline.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          handleOutlineLeave(); // Close menu on click
                          
                          // First, try direct ID from item (if it exists in DOM)
                          const element = document.getElementById(item.id);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                          }

                          // Fallback 1: Search for heading element with matching text in editor's DOM
                          const editorDom = editor?.view.dom;
                          if (editorDom) {
                            const headings = Array.from(editorDom.querySelectorAll('h1, h2, h3'));
                            const itemText = item.text.trim();
                            
                            // Try exact match first
                            let match = headings.find(h => h.textContent?.trim() === itemText);
                            
                            // Try fuzzy match if exact match fails
                            if (!match) {
                              match = headings.find(h => {
                                const headingText = h.textContent?.trim() || '';
                                return headingText.includes(itemText) || itemText.includes(headingText);
                              });
                            }
                            
                            if (match) {
                              match.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }
                        }}
                        className={`text-left hover:text-blue-600 transition-colors py-1 px-2 rounded hover:bg-stone-100 ${
                          item.level === 1 ? 'text-sm font-semibold' : 
                          item.level === 2 ? 'text-xs pl-4' : 
                          'text-[10px] pl-6'
                        }`}
                      >
                        {item.text}
                      </button>
                    ))
                  ) : (
                    <div className="py-4 text-center">
                      <p className="text-xs text-stone-400 italic">笔记中暂无标题内容</p>
                      <p className="text-[10px] text-stone-300 mt-1">请使用 /h1 /h2 创建标题</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {note && (
              <PropertyPanel
                note={note}
                onUpdate={(updated) => onSave({ ...updated, silent: true })}
                onUpdateTags={onUpdateTags}
                isPrivate={isPrivate}
                onTogglePrivate={onTogglePrivate}
              />
            )}
          </div>

          <div className="relative group/editor mt-0 w-full">
          {viewMode === 'edit' && editor && activeTableRect && createPortal(
            <div 
              className="table-controls-container fixed z-[9999]"
              style={{
                top: activeTableRect.top,
                left: activeTableRect.left,
                width: activeTableRect.width,
                height: activeTableRect.height,
                pointerEvents: 'none',
              }}
            >
              {/* 快速添加列按钮 (右侧) */}
              <div className="absolute top-0 bottom-0 -right-5 w-5 flex items-center justify-center pointer-events-auto">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    // 强制移动焦点到表格内
                    const targetPos = activeRowPos ?? activeTablePos;
                    if (targetPos !== null) {
                      // targetPos + 1 通常能落入单元格内
                      editor.chain().focus(targetPos + 1).addColumnAfter().run();
                    } else {
                      editor.chain().focus().addColumnAfter().run();
                    }
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 hover:scale-110 transition-all"
                  title="添加列"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* 快速添加行按钮 (底部) */}
              <div className="absolute left-0 right-0 -bottom-5 h-5 flex items-center justify-center pointer-events-auto">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    const targetPos = activeRowPos ?? activeTablePos;
                    if (targetPos !== null) {
                      editor.chain().focus(targetPos + 1).addRowAfter().run();
                    } else {
                      editor.chain().focus().addRowAfter().run();
                    }
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 hover:scale-110 transition-all"
                  title="添加行"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* 表格操作菜单手柄 (左上角) */}
              <div 
                className="absolute -top-6 -left-6 w-6 h-6 flex items-center justify-center pointer-events-auto"
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    const targetPos = activeTablePos;
                    if (targetPos !== null) {
                      editor.chain().focus(targetPos + 1).deleteTable().run();
                    } else {
                      editor.chain().focus().deleteTable().run();
                    }
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-5 h-5 flex items-center justify-center bg-white border border-stone-200 text-stone-400 rounded-md hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                  title="删除表格"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* 行操作侧边栏 (左侧) - Notion 风格：平时仅显示蓝色高亮竖线，点击后显示图标 */}
              {activeRowRect && (
                <div 
                  className="row-side-handle absolute -left-[3px] w-[3px] bg-blue-500/0 hover:bg-blue-500/40 pointer-events-auto transition-all cursor-pointer"
                  style={{
                    top: activeRowRect.top - activeTableRect.top,
                    height: activeRowRect.height,
                    backgroundColor: hoveredRowIndex !== null ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setClickedRowIndex(hoveredRowIndex);
                  }}
                >
                  {/* 点击左侧竖线后出现的浮动控制图标 */}
                  {clickedRowIndex === hoveredRowIndex && (
                    <div 
                      className="absolute right-full mr-2 flex items-center gap-1 bg-white border border-stone-200 rounded-md shadow-xl p-1 animate-in fade-in slide-in-from-right-1 duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          const targetPos = activeRowPos;
                          if (targetPos !== null) {
                            editor.chain().focus(targetPos + 1).deleteRow().run();
                          } else {
                            editor.chain().focus().deleteRow().run();
                          }
                          setClickedRowIndex(null);
                        }}
                        className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="删除当前行"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>,
            document.body
          )}

          {editor && (
            <DragHandle 
              editor={editor}
            >
              {/* 始终挂载以避免 Tiptap DOM removeChild 崩溃，通过 CSS 控制预览模式不可见 */}
              <div
                className="flex items-center gap-1 text-stone-300 hover:text-stone-500 transition-colors"
                style={viewMode !== 'edit' ? { opacity: 0, pointerEvents: 'none' } : undefined}
              >
                <button
                  className="p-1 rounded-md hover:bg-stone-100 transition-colors"
                  title="插入命令"
                  onClick={(e) => {
                    if (viewMode !== 'edit') return;
                    // 使用点击坐标寻找最近的编辑器位置，确保在鼠标当前行操作
                    // 向右偏移 40px 以确保落入编辑器内容区域
                    try {
                      const pos = editor.view.posAtCoords({ 
                        left: e.clientX + 40, 
                        top: e.clientY 
                      });
                      
                      if (pos && pos.inside !== -1) {
                        editor.chain()
                          .focus()
                          .setTextSelection(pos.pos)
                          .insertContent('/')
                          .run();
                      } else {
                        // 回退方案：如果在容器外或找不到具体位置，则在当前选区插入
                        editor.chain().focus().insertContent('/').run();
                      }
                    } catch (err) {
                      console.error('Drag handle click error:', err);
                      editor.chain().focus().insertContent('/').run();
                    }
                  }}
                >
                  <Plus size={18} />
                </button>
                <div className="p-1 rounded-md hover:bg-stone-100 cursor-grab active:cursor-grabbing">
                  <GripVertical size={18} />
                </div>
              </div>
            </DragHandle>
          )}

          {editor && (
            <BubbleMenu 
              editor={editor} 
              shouldShow={({ editor }) => {
                // 只有在编辑模式且选中表格且不是正在输入时显示（或者选区不为空）
                return viewMode === 'edit' && editor.isActive('table') && !editor.state.selection.empty;
              }}
              className="flex items-center gap-0.5 p-1 bg-white rounded-lg shadow-xl border border-stone-200"
            >
              <div className="flex items-center gap-0.5 border-r border-stone-200 pr-1 mr-1">
                <button
                  onClick={() => editor.chain().focus().addRowBefore().run()}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-600 transition-colors"
                  title="在上方插入行"
                >
                  <Rows size={16} className="rotate-180" />
                </button>
                <button
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-600 transition-colors"
                  title="在下方插入行"
                >
                  <Rows size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().deleteRow().run()}
                  className="p-1.5 hover:bg-red-50 rounded text-red-600 transition-colors"
                  title="删除行"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex items-center gap-0.5 border-r border-stone-200 pr-1 mr-1">
                <button
                  onClick={() => editor.chain().focus().addColumnBefore().run()}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-600 transition-colors"
                  title="在左侧插入列"
                >
                  <Columns size={16} className="rotate-180" />
                </button>
                <button
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-600 transition-colors"
                  title="在右侧插入列"
                >
                  <Columns size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                  className="p-1.5 hover:bg-red-50 rounded text-red-600 transition-colors"
                  title="删除列"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="flex items-center gap-0.5 border-r border-stone-200 pr-1 mr-1">
                <button
                  onClick={() => editor.chain().focus().mergeCells().run()}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-600 transition-colors"
                  title="合并单元格"
                  disabled={!editor.can().mergeCells()}
                >
                  <Combine size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().splitCell().run()}
                  className="p-1.5 hover:bg-stone-100 rounded text-stone-600 transition-colors"
                  title="拆分单元格"
                  disabled={!editor.can().splitCell()}
                >
                  <Split size={16} />
                </button>
              </div>

              <button
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="p-1.5 hover:bg-red-100 rounded text-red-700 transition-colors ml-0.5"
                title="删除整个表格"
              >
                <Trash2 size={16} />
              </button>
            </BubbleMenu>
          )}

          {/* 表格表头属性菜单 - Notion 风格 */}
          {viewMode === 'edit' && propertyMenuNode && editor && createPortal(
            <div 
              className="fixed z-[10000] bg-white rounded-lg shadow-2xl border border-stone-200 p-1 w-60 animate-in fade-in zoom-in duration-150"
              style={{
                top: propertyMenuNode.rect.bottom + 8,
                left: Math.min(propertyMenuNode.rect.left, window.innerWidth - 250)
              }}
            >
              {/* 点击遮罩层，用于点击外部关闭菜单 */}
              <div 
                className="fixed inset-0 -z-10" 
                onClick={() => setPropertyMenuNode(null)} 
              />
              <div className="px-3 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wider border-bottom border-stone-100">
                列操作
              </div>
              <div className="flex flex-col gap-0.5 mt-1 relative z-10">
                <button 
                  onClick={() => {
                    editor.chain().focus(propertyMenuNode.pos + 1).addColumnBefore().run();
                    setPropertyMenuNode(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-md transition-colors w-full text-left"
                >
                  <Columns size={16} className="text-stone-400 rotate-180" />
                  <span>左侧插入列</span>
                </button>
                <button 
                  onClick={() => {
                    editor.chain().focus(propertyMenuNode.pos + 1).addColumnAfter().run();
                    setPropertyMenuNode(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-md transition-colors w-full text-left"
                >
                  <Columns size={16} className="text-stone-400" />
                  <span>右侧插入列</span>
                </button>
                <div className="h-px bg-stone-100 my-1 mx-2" />
                <button 
                  onClick={() => {
                    editor.chain().focus(propertyMenuNode.pos + 1).deleteColumn().run();
                    setPropertyMenuNode(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors w-full text-left"
                >
                  <Trash2 size={16} className="text-red-400" />
                  <span>删除当前列</span>
                </button>
              </div>
            </div>,
            document.body
          )}

          {editor && (
            <BubbleMenu 
              editor={editor} 
              shouldShow={({ editor }) => {
                return viewMode === 'edit' && !editor.state.selection.empty && !editor.isActive('table');
              }}
              className="flex overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl"
            >
              <div className="flex items-center gap-0.5 p-1">
                <button
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`p-1.5 rounded hover:bg-stone-100 ${editor.isActive('bold') ? 'text-blue-600 bg-blue-50' : 'text-stone-600'}`}
                >
                  <Bold size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`p-1.5 rounded hover:bg-stone-100 ${editor.isActive('italic') ? 'text-blue-600 bg-blue-50' : 'text-stone-600'}`}
                >
                  <Italic size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  className={`p-1.5 rounded hover:bg-stone-100 ${editor.isActive('underline') ? 'text-blue-600 bg-blue-50' : 'text-stone-600'}`}
                >
                  <Underline size={16} />
                </button>
                <button
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  className={`p-1.5 rounded hover:bg-stone-100 ${editor.isActive('code') ? 'text-blue-600 bg-blue-50' : 'text-stone-600'}`}
                >
                  <Code size={16} />
                </button>
                <div className="w-px h-4 bg-stone-200 mx-1" />
                <button
                  onClick={() => {
                    const url = window.prompt('输入链接地址');
                    if (url) editor.chain().focus().setLink({ href: url }).run();
                  }}
                  className={`p-1.5 rounded hover:bg-stone-100 ${editor.isActive('link') ? 'text-blue-600 bg-blue-50' : 'text-stone-600'}`}
                >
                  <Link2 size={16} />
                </button>
                <button
                  onClick={() => handleAIAction('ask')}
                  className="p-1.5 rounded hover:bg-stone-100 text-purple-600"
                >
                  <Sparkles size={16} />
                </button>
                <div className="w-px h-4 bg-stone-200 mx-1" />
                <button
                  onClick={() => editor.chain().focus().unsetAllMarks().run()}
                  className="p-1.5 rounded hover:bg-stone-100 text-stone-600"
                >
                  <Eraser size={16} />
                </button>
              </div>
            </BubbleMenu>
          )}

          <EditorContent editor={editor} className="relative z-0" />
        </div>
      </div>
        
      {/* Floating AI Loading Indicator */}
        {isAIStreaming && (
          <div className="fixed bottom-12 right-12 z-50 flex items-center gap-3 rounded-full bg-stone-900 px-6 py-3 text-white shadow-2xl animate-pulse">
            <Sparkles size={16} className="text-purple-400 animate-spin" />
            <span className="text-sm font-medium">AI 正在思考并书写中...</span>
          </div>
        )}
      </div>

      <input 
        id="editor-local-media-input" 
        type="file" 
        accept="image/*,video/*,audio/*,application/pdf,application/zip,application/x-zip-compressed,.docx,.xlsx,.pptx,.txt" 
        className="hidden" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadLocalMedia(editor, file);
        }} 
      />
    </div>
  );
};
