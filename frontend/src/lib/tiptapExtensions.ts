import { mergeAttributes, Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { TableCell as BaseTableCell } from '@tiptap/extension-table-cell';
import { TableHeader as BaseTableHeader } from '@tiptap/extension-table-header';
import { ReactNodeViewRenderer } from '@tiptap/react';
import React from 'react';
import { MediaNodeView } from '../components/MediaNodeView';

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
    return { src: { default: '' }, width: { default: '100%' } };
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
    return { src: { default: '' }, width: { default: '100%' } };
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


const normalizeJournalKind = (kind?: string | null, state?: string | null) => {
  const nextKind = String(kind || '').trim();
  if (nextKind === 'task' || nextKind === 'note' || nextKind === 'event') return nextKind;
  const legacyState = String(state || '').trim();
  if (legacyState === 'note' || legacyState === 'event') return legacyState;
  return 'task';
};

const normalizeJournalState = (state?: string | null) => {
  const nextState = String(state || '').trim();
  if (nextState === 'done' || nextState === 'migrated') return nextState;
  return 'open';
};

export const JournalItemNode = Node.create({
  name: 'journalItem',
  group: 'block',
  content: 'inline*',
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      kind: {
        default: 'task',
        parseHTML: (element: HTMLElement) => normalizeJournalKind(element.getAttribute('data-bullet-kind'), element.getAttribute('data-bullet-state')),
        renderHTML: (attributes: { kind?: string; state?: string }) => ({ 'data-bullet-kind': normalizeJournalKind(attributes.kind, attributes.state) }),
      },
      state: {
        default: 'open',
        parseHTML: (element: HTMLElement) => normalizeJournalState(element.getAttribute('data-bullet-state')),
        renderHTML: (attributes: { state?: string }) => ({ 'data-bullet-state': normalizeJournalState(attributes.state) }),
      },
    };
  },
  parseHTML() {
    return [
      { tag: 'div[data-journal-item]' },
      { tag: 'li[data-bullet-state]' },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-journal-item': 'true', class: 'journal-item' }), 0];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        for (let depth = $from.depth; depth >= 0; depth -= 1) {
          const node = $from.node(depth);
          if (node.type.name !== this.name) continue;
          return this.editor
            .chain()
            .focus()
            .insertContentAt($from.after(depth), {
              type: this.name,
              attrs: {
                kind: normalizeJournalKind(node.attrs.kind, node.attrs.state),
                state: normalizeJournalState(node.attrs.state),
              },
              content: [{ type: 'text', text: '' }],
            })
            .run();
        }
        return false;
      },
    };
  },
});

export const CalloutNode = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,
  draggable: true,
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': 'true', class: 'callout-block' }), 0];
  },
});
