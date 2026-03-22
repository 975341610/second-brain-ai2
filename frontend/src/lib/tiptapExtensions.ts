import { Node, Mark, Extension, mergeAttributes, markInputRule } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import Image from '@tiptap/extension-image';
import { TableCell as BaseTableCell } from '@tiptap/extension-table-cell';
import { TableHeader as BaseTableHeader } from '@tiptap/extension-table-header';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { ReactNodeViewRenderer } from '@tiptap/react';
import React from 'react';
import { MediaNodeView } from '../components/MediaNodeView';
import { FileBlockView } from '../components/editor/FileBlockView';

export { TaskList, TaskItem };

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          // 1. First, delete the slash and its trigger text
          // Using a single transaction is key here.
          // We must ensure the selection is updated AFTER deletion.
          const { tr } = editor.state;
          tr.deleteRange(range.from, range.to);
          editor.view.dispatch(tr);

          // 2. Now run the command with focus
          editor.chain().focus();
          
          // props.action expects a chain, so we provide one
          const chain = editor.chain().focus();
          const result = props.action(chain);
          
          if (result && typeof result.run === 'function') {
            result.run();
          } else if (chain && typeof chain.run === 'function') {
            chain.run();
          }
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export const WikiLink = Mark.create({
  name: 'wikiLink',
  priority: 1000,
  keepOnSplit: false,
  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-wiki-title'),
        renderHTML: (attributes) => {
          if (!attributes.title) return {};
          return { 'data-wiki-title': attributes.title, class: 'wiki-link', 'data-type': 'wiki' };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-wiki-title]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
  addInputRules() {
    return [
      markInputRule({
        find: /\[\[([^\]]+)\]\]$/,
        type: this.type,
        getAttributes: (match) => ({ title: match[1] }),
      }),
    ];
  },
});

const propertyTypeAttr = {
  propertyType: {
    default: 'text',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-property-type') || 'text',
    renderHTML: (attributes: { propertyType?: string }) => ({ 'data-property-type': attributes.propertyType || 'text' }),
  },
  propertyOptions: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-property-options') || '',
    renderHTML: (attributes: { propertyOptions?: string }) => ({ 'data-property-options': attributes.propertyOptions || '' }),
  },
  propertyMode: {
    default: 'single',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-property-mode') || 'single',
    renderHTML: (attributes: { propertyMode?: string }) => ({ 'data-property-mode': attributes.propertyMode || 'single' }),
  },
  checked: {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-checked') === 'true',
    renderHTML: (attributes: { checked?: boolean }) => ({ 'data-checked': attributes.checked ? 'true' : 'false' }),
  },
  dateValue: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-date-value') || '',
    renderHTML: (attributes: { dateValue?: string }) => ({ 'data-date-value': attributes.dateValue || '' }),
  },
  selectValue: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-select-value') || '',
    renderHTML: (attributes: { selectValue?: string }) => ({ 'data-select-value': attributes.selectValue || '' }),
  },
};

export const DatabaseTableHeader = BaseTableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...propertyTypeAttr,
    };
  },
});

export const DatabaseTableCell = BaseTableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...propertyTypeAttr,
    };
  },
});

export const ResizableImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: (element) => element.getAttribute('data-width') || '100%',
        renderHTML: (attributes) => ({ 'data-width': attributes.width, style: `width:${attributes.width};` }),
      },
      'data-upload-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes) => attributes['data-upload-id'] ? { 'data-upload-id': attributes['data-upload-id'] } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'image' }));
  },
});

export const AudioNode = Node.create({
  name: 'audioNode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { 
      src: { default: '' }, 
      width: { default: '100%' },
      'data-upload-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes) => attributes['data-upload-id'] ? { 'data-upload-id': attributes['data-upload-id'] } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'audio[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['audio', { ...HTMLAttributes, controls: 'true', class: 'embedded-audio', style: `width:${HTMLAttributes.width || '100%'};` }];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'audio' }));
  },
});

export const VideoNode = Node.create({
  name: 'videoNode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { 
      src: { default: '' }, 
      width: { default: '100%' },
      'data-upload-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes) => attributes['data-upload-id'] ? { 'data-upload-id': attributes['data-upload-id'] } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'video[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['video', { ...HTMLAttributes, controls: 'true', class: 'embedded-video', style: `width:${HTMLAttributes.width || '100%'};` }];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'video' }));
  },
});

export const EmbedNode = Node.create({
  name: 'embedNode',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: '' },
      width: { default: '100%' },
      height: { default: 420 },
    };
  },
  parseHTML() {
    return [{ tag: 'iframe[data-embed]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['iframe', { ...HTMLAttributes, 'data-embed': 'true', class: 'embedded-iframe', style: `width:${HTMLAttributes.width || '100%'};`, allowfullscreen: 'true' }];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'embed' }));
  },
});

export const FileNode = Node.create({
  name: 'fileNode',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: '' },
      name: { default: '未命名文件' },
      size: { default: 0 },
      type: { default: '' },
      'data-upload-id': {
        default: null,
        parseHTML: (element) => element.getAttribute('data-upload-id'),
        renderHTML: (attributes) => attributes['data-upload-id'] ? { 'data-upload-id': attributes['data-upload-id'] } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="file-card"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'file-card', class: 'notion-file-block' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer((props) => React.createElement(MediaNodeView, { ...props, kind: 'file' }));
  },
});

export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': 'true', class: 'callout-block' }), 0];
  },
});
