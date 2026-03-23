import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { FloatingMenu, BubbleMenu } from '@tiptap/react/menus';
import DragHandle from '@tiptap/extension-drag-handle-react';
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
  SlashCommands, FileNode
} from '../../lib/tiptapExtensions';

import { SlashItem, getSuggestionConfig } from './SlashMenu';
import { PropertyPanel } from '../editor/PropertyPanel';
import { EditorHeader } from '../editor/EditorHeader';
import { CodeBlockComponent } from '../editor/CodeBlockComponent';
import { api } from '../../lib/api';
import { uploadLocalMedia, genericEmbedUrl } from '../editor/utils';
import type { Note } from '../../lib/types';

import { 
  Type, Heading1, Heading2, Heading3, CheckSquare, List, ListOrdered, 
  Quote, Minus, Plus, Table, FileCode, ImageIcon, 
  Sparkles, Wand2, GripVertical, Bold, Italic, Underline, Code, Link2, Eraser,
  Rows, Columns, Trash2, Combine, Split, Settings2, Calendar, Hash, CheckCircle2
} from 'lucide-react';

interface NotionEditorProps {
  note: Note | null;
  notes: Note[];
  onSave: (payload: any) => Promise<void>;
  onUpdateTags?: (noteId: number, tags: string[]) => Promise<void>;
  onCreateSubPage: (parentId: number) => void;
  onSelectNote: (noteId: number) => void;
  onNotify?: (text: string, tone?: 'success' | 'error' | 'info') => void;
  outline: any[];
  references: string[];
  relatedNotes: Note[];
}

export const NotionEditor: React.FC<NotionEditorProps> = ({
  note, notes, onSave, onUpdateTags, onCreateSubPage, onSelectNote, onNotify, outline, references, relatedNotes
}) => {
  console.log("NotionEditor (V4 Table Upgrade) Loaded");
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isAIStreaming, setIsAIStreaming] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [propertyMenuNode, setPropertyMenuNode] = useState<{ pos: number; rect: DOMRect } | null>(null);
  const [activeTableRect, setActiveTableRect] = useState<DOMRect | null>(null);
  const editorRef = useRef<any>(null);

  const updateTableRect = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;

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
          return;
        }
      }
    } catch (e) {
      console.error("Table detection failed", e);
    }

    setActiveTableRect(null);
  }, []);


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
  }, [onNotify]);

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
      heading: { levels: [1, 2, 3] },
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      link: false,
      underline: false,
    }),
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
  }, [note?.id]);

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;

    const handleUpdate = () => {
      if (!editorRef.current) return;
      updateTableRect();
      
      const { selection } = editor.state;
      const { $from } = selection;
      let foundHeader = false;
      for (let i = $from.depth; i > 0; i--) {
        const node = $from.node(i);
        if (node.type.name === 'tableHeader') {
          foundHeader = true;
          break;
        }
      }
      if (editor.isActive('table')) {
        // Selection is in table, keep menu if it's already open
        // (Overlay will handle closing on outside clicks)
      } else {
        setPropertyMenuNode(null);
      }
    };

    const handleScrollAndResize = () => updateTableRect();

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    editor.on('focus', handleUpdate);
    window.addEventListener('scroll', handleScrollAndResize, true);
    window.addEventListener('resize', handleScrollAndResize);

    // 初始执行一次
    setTimeout(handleUpdate, 100);

    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
      editor.off('focus', handleUpdate);
      window.removeEventListener('scroll', handleScrollAndResize, true);
      window.removeEventListener('resize', handleScrollAndResize);
    };
  }, [editor, updateTableRect]);

  // Sync with Note content
  useEffect(() => {
    if (!editor || !note) return;
    if (lastSyncedNoteIdRef.current !== note.id) {
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
    }
  }, [note, editor]);

  // Auto-save logic
  useEffect(() => {
    if (!editor || !note) return;
    
    const interval = setInterval(() => {
      let currentContent = editor.getHTML();
      
      // Sanitization: Remove blob URLs before saving to database
      if (currentContent.includes('src="blob:')) {
        const doc = new DOMParser().parseFromString(currentContent, 'text/html');
        const elementsWithBlob = doc.querySelectorAll('[src^="blob:"]');
        elementsWithBlob.forEach(el => {
          // If it's an image that's still uploading, we might want to keep it as a placeholder 
          // but strip the src so it doesn't break. Or just wait for next save.
          el.setAttribute('src', ''); 
          el.setAttribute('data-loading', 'true');
        });
        currentContent = doc.body.innerHTML;
      }

      const currentText = editor.getText().trim();
      
      let newTitle = note.title;
      let isTitleEdited = note.is_title_manually_edited;

      // Auto-extract title if not manually edited
      if (!isTitleEdited && currentText) {
        // Try to find the first H1
        const doc = new DOMParser().parseFromString(currentContent, 'text/html');
        const h1 = doc.querySelector('h1');
        if (h1 && h1.textContent?.trim()) {
          newTitle = h1.textContent.trim().slice(0, 100);
        } else {
          // Fallback to first line of text
          const firstLine = currentText.split('\n')[0].trim();
          if (firstLine) {
            newTitle = firstLine.slice(0, 100);
          }
        }
      }

      const hasContentChanged = currentContent !== note.content;
      const hasTitleChanged = newTitle !== note.title;

      if ((hasContentChanged || hasTitleChanged) && !isSaving) {
        setIsSaving(true);
        onSave({ 
          id: note.id, 
          content: currentContent, 
          title: newTitle, 
          icon: note.icon, 
          is_title_manually_edited: isTitleEdited,
          silent: true 
        })
          .then(() => {
            setLastSavedAt(new Date().toLocaleTimeString());
          })
          .finally(() => setIsSaving(false));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [editor, note, onSave, isSaving]);

  return (
    <div ref={editorContainerRef} className="relative flex flex-col h-full bg-reflect-bg overflow-hidden notion-editor-layout">
      <div className="flex-1 overflow-y-auto relative bg-reflect-bg scrollbar-hide pt-0">
        <div className="flex flex-col w-full max-w-[800px] mx-auto">
          <div className="px-8">
            <EditorHeader
              icon={note?.icon ?? '📝'}
              title={note?.title ?? '未命名笔记'}
              isTitleManuallyEdited={note?.is_title_manually_edited ?? false}
              breadcrumbs={[]}
              onSelectBreadcrumb={onSelectNote}
              savePhase={isSaving ? 'saving' : 'idle'}
              isDirty={false}
              lastSavedAt={lastSavedAt}
              showRelations={false}
              showOutline={false}
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
              onOutlineEnter={() => {}}
              onOutlineLeave={() => {}}
              onSetViewMode={setViewMode}
            />

            {note && (
              <PropertyPanel 
                note={note} 
                onUpdate={(updated) => onSave({ ...updated, silent: true })} 
                onUpdateTags={onUpdateTags}
              />
            )}
          </div>

          <div className="relative group/editor mt-0 w-full">
          {editor && activeTableRect && createPortal(
            <div 
              className="table-controls-container fixed z-[9999] pointer-events-none"
              style={{
                top: activeTableRect.top,
                left: activeTableRect.left,
                width: activeTableRect.width,
                height: activeTableRect.height,
                pointerEvents: 'none'
              }}
            >
              {/* 快速添加列按钮 (右侧) */}
              <div className="absolute top-0 bottom-0 -right-4 w-4 flex items-center justify-center pointer-events-auto">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    editor.chain().focus().addColumnAfter().run();
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 hover:scale-110 transition-all"
                  title="添加列"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* 快速添加行按钮 (底部) */}
              <div className="absolute left-0 right-0 -bottom-4 h-4 flex items-center justify-center pointer-events-auto">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    editor.chain().focus().addRowAfter().run();
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-5 h-5 flex items-center justify-center bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 hover:scale-110 transition-all"
                  title="添加行"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* 表格操作菜单手柄 (左侧) */}
              <div className="absolute top-0 bottom-0 -left-6 w-6 flex flex-col items-center pt-1 pointer-events-auto">
                <div className="flex flex-col gap-1 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      editor.chain().focus().deleteTable().run();
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    className="w-5 h-5 flex items-center justify-center bg-white border border-stone-200 text-stone-400 rounded-md hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shadow-sm"
                    title="删除表格"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {editor && (
            <DragHandle 
              editor={editor}
            >
              <div className="flex items-center gap-1 text-stone-300 hover:text-stone-500 transition-colors">
                <button
                  className="p-1 rounded-md hover:bg-stone-100 transition-colors"
                  title="插入命令"
                  onClick={(e) => {
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
                // 只有在选中表格且不是正在输入时显示（或者选区不为空）
                return editor.isActive('table') && !editor.state.selection.empty;
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
          {propertyMenuNode && editor && createPortal(
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
                    editor.chain().focus().addColumnBefore().run();
                    setPropertyMenuNode(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-md transition-colors w-full text-left"
                >
                  <Columns size={16} className="text-stone-400 rotate-180" />
                  <span>左侧插入列</span>
                </button>
                <button 
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run();
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
                    editor.chain().focus().deleteColumn().run();
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
                return !editor.state.selection.empty && !editor.isActive('table');
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
