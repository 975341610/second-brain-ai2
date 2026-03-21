import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CodeBlock } from '@tiptap/extension-code-block';
import { Table as TiptapTable } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import Youtube from '@tiptap/extension-youtube';
import { TextSelection } from '@tiptap/pm/state';

import { 
  AudioNode, CalloutNode, DatabaseTableCell, DatabaseTableHeader, 
  EmbedNode, ResizableImage, TaskItem, TaskList, VideoNode, WikiLink,
  SlashCommands
} from '../../lib/tiptapExtensions';

import { SlashItem, getSuggestionConfig } from './SlashMenu';
import { PropertyPanel } from '../editor/PropertyPanel';
import { EditorHeader } from '../editor/EditorHeader';
import { api } from '../../lib/api';
import { uploadLocalMedia } from '../editor/utils';
import type { Note } from '../../lib/types';

import { 
  Type, Heading1, Heading2, Heading3, CheckSquare, List, ListOrdered, 
  Quote, Minus, Plus, Table, FileCode, ImageIcon, 
  Sparkles, Wand2, GripVertical, Bold, Italic, Underline, Code, Link2, Eraser
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
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isAIStreaming, setIsAIStreaming] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  
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
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    const context = editor.getText().slice(0, 1000);
    
    setIsAIStreaming(true);

    let currentPos = to;
    if (action !== 'continue' && action !== 'ask') {
      editor.chain().focus().deleteSelection().run();
      currentPos = from;
    }

    try {
      const prompt = customPrompt || selectedText;
      await api.streamInlineAI({ prompt, context, action }, (chunk) => {
        editor.chain().focus().insertContentAt(currentPos, chunk).run();
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
    { group: '标题', label: '标题 1', description: '最大的标题', icon: <Heading1 size={18} />, keywords: ['h1', 'bt1'], action: (c) => c.toggleHeading({ level: 1 }) },
    { group: '标题', label: '标题 2', description: '中等标题', icon: <Heading2 size={18} />, keywords: ['h2', 'bt2'], action: (c) => c.toggleHeading({ level: 2 }) },
    { group: '标题', label: '标题 3', description: '小标题', icon: <Heading3 size={18} />, keywords: ['h3', 'bt3'], action: (c) => c.toggleHeading({ level: 3 }) },
    { group: '列表', label: '任务列表', description: '带复选框的任务', icon: <CheckSquare size={18} />, keywords: ['todo', 'task', 'rw'], action: (c) => c.toggleTaskList() },
    { group: '列表', label: '无序列表', description: '普通的圆点列表', icon: <List size={18} />, keywords: ['ul', 'list', 'lb'], action: (c) => c.toggleBulletList() },
    { group: '列表', label: '有序列表', description: '带数字的列表', icon: <ListOrdered size={18} />, keywords: ['ol', 'number', 'lb'], action: (c) => c.toggleOrderedList() },
    { group: '内容', label: '引用', description: '插入一段引用', icon: <Quote size={18} />, keywords: ['quote', 'yy'], action: (c) => c.toggleBlockquote() },
    { group: '内容', label: '代码块', description: '带语法的代码块', icon: <FileCode size={18} />, keywords: ['code', 'dm'], action: (c) => c.toggleCodeBlock() },
    { group: '内容', label: '分割线', description: '水平分割线', icon: <Minus size={18} />, keywords: ['hr', 'fgx'], action: (c) => c.setHorizontalRule() },
    { group: '内容', label: '表格', description: '3x3 的标准表格', icon: <Table size={18} />, keywords: ['table', 'bg'], action: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
    { group: '高级', label: '子页面', description: '在当前位置新建子页面', icon: <Plus size={18} className="text-amber-600" />, keywords: ['page', 'sub', 'zym'], action: () => {
      const currentNote = noteRef.current;
      if (currentNote) onCreateSubPageRef.current(currentNote.id);
    }},
    { group: '高级', label: '提示块', description: 'Callout 强调块', icon: <Type size={18} className="text-blue-500" />, keywords: ['callout', 'ts'], action: (c) => c.insertContent('<div data-callout="true"><p>新的提示内容</p></div>') },
    { group: '媒体', label: '图片', description: '上传或插入图片', icon: <ImageIcon size={18} />, keywords: ['image', 'tp'], action: (c) => {
      const url = window.prompt('请输入图片 URL 或点击下方上传图标');
      if (url) c.setImage({ src: url });
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
    CodeBlock.configure({
      HTMLAttributes: { class: 'notion-code-block' },
    }),
    Link.configure({ openOnClick: true, autolink: true }),
    Highlight,
    UnderlineExtension,
    TiptapTable.configure({ resizable: true }),
    TableRow,
    DatabaseTableHeader,
    DatabaseTableCell,
    Youtube.configure({ controls: true, nocookie: true }),
    AudioNode,
    VideoNode,
    EmbedNode,
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
      attributes: {
        class: 'tiptap-notion prose prose-stone focus:outline-none min-h-[500px] w-full max-w-[800px] mx-auto pt-0 px-8 mb-32'
      }
    }
  }, [note?.id]);

  // Sync with Note content
  useEffect(() => {
    if (!editor || !note) return;
    if (lastSyncedNoteIdRef.current !== note.id) {
      editor.commands.setContent(note.content || '<p></p>');
      lastSyncedNoteIdRef.current = note.id;
      setLastSavedAt(new Date().toLocaleTimeString());
    }
  }, [note, editor]);

  // Auto-save logic
  useEffect(() => {
    if (!editor || !note) return;
    
    const interval = setInterval(() => {
      const currentContent = editor.getHTML();
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
    <div ref={editorContainerRef} className="relative flex flex-col h-full bg-white overflow-hidden notion-editor-layout">
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
            onSave({ 
              id: note.id, 
              content: editor.getHTML(), 
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

      <div className="flex-1 overflow-y-auto relative bg-white scrollbar-hide">
        {note && (
          <div className="max-w-[800px] mx-auto pt-0 px-8 pb-0">
            <PropertyPanel 
              note={note} 
              onUpdate={(updated) => onSave({ ...updated, silent: true })} 
              onUpdateTags={onUpdateTags}
            />
          </div>
        )}
        
        <div className="relative group/editor">
          {editor && (
            <DragHandle 
              editor={editor}
            >
              <div className="flex items-center gap-1 text-stone-300 hover:text-stone-500 transition-colors">
                <button
                  className="p-1 rounded-md hover:bg-stone-100 transition-colors"
                  onClick={(e) => {
                    // 使用点击坐标寻找最近的编辑器位置，确保在鼠标当前行操作
                    // 向右偏移 40px 以确保落入编辑器内容区域
                    const pos = editor.view.posAtCoords({ 
                      left: e.clientX + 40, 
                      top: e.clientY 
                    });
                    
                    if (pos) {
                      editor.chain()
                        .focus()
                        .setTextSelection(pos.pos)
                        .insertContent('/')
                        .run();
                    } else {
                      // 回退方案
                      const { from } = editor.state.selection;
                      editor.chain().focus().insertContentAt(from, '/').run();
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
        accept="image/*,video/*,audio/*" 
        className="hidden" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadLocalMedia(editor, file);
        }} 
      />
    </div>
  );
};
