import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { CellSelection, findCellPos, selectedRect, TableMap } from 'prosemirror-tables';

export type TableSelectionState = { type: 'cell'; anchor: number; head: number } | { type: 'text'; from: number; to: number } | null;

export type CellEditorState = {
  type: 'select' | 'date';
  cellPos: number;
  top: number;
  left: number;
  options?: string[];
  mode?: 'single' | 'multi';
  value?: string;
};

export function updateCellAttrs(editor: Editor | null, cellPos: number, attrs: Record<string, unknown>, content?: string) {
  if (!editor) return;
  const node = editor.state.doc.nodeAt(cellPos);
  if (!node) return;
  const tr = editor.state.tr.setNodeMarkup(cellPos, node.type, { ...node.attrs, ...attrs });
  editor.view.dispatch(tr);
  if (typeof content === 'string') {
    const from = cellPos + 1;
    const to = cellPos + node.nodeSize - 1;
    if (!content) editor.chain().focus().deleteRange({ from, to }).run();
    else editor.chain().focus().insertContentAt({ from, to }, content).run();
  }
}

export function saveTableSelection(editor: Editor | null): TableSelectionState {
  if (!editor) return null;
  const selection = editor.state.selection;
  if (selection instanceof CellSelection) {
    return { type: 'cell', anchor: selection.$anchorCell.pos, head: selection.$headCell.pos };
  }
  return { type: 'text', from: selection.from, to: selection.to };
}

export function restoreTableSelection(editor: Editor | null, selection: TableSelectionState) {
  if (!editor || !selection) return;
  try {
    if (selection.type === 'cell') {
      editor.commands.setCellSelection({
        anchorCell: Math.min(selection.anchor, editor.state.doc.content.size),
        headCell: Math.min(selection.head, editor.state.doc.content.size),
      });
    } else {
      const pos = Math.min(selection.from, editor.state.doc.content.size);
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(Math.max(1, pos)))));
    }
  } catch {
    // Ignore stale selection restoration.
  }
}

export function setColumnAttribute(editor: Editor | null, name: string, value: unknown) {
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
      tr.setNodeMarkup(cellPos, cellNode.type, { ...cellNode.attrs, [name]: value });
    }
    editor.view.dispatch(tr);
  } catch {
    editor.chain().focus().setCellAttribute(name, value).run();
  }
}

export function setColumnPropertyType(editor: Editor | null, propertyType: 'text' | 'number' | 'select' | 'date' | 'checkbox') {
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
}

export function configureColumnAttribute(editor: Editor | null, name: string, value: string) {
  setColumnAttribute(editor, name, value);
}

export function getCellEditorState(
  editor: Editor | null,
  target: HTMLElement | null,
  editorPane: HTMLDivElement | null,
): CellEditorState | null {
  if (!editor || !target || !editorPane) return null;
  const cell = target.closest('td,th') as HTMLElement | null;
  if (!cell) return null;
  const domPos = editor.view.posAtDOM(cell, 0);
  const resolved = findCellPos(editor.state.doc, domPos + 1) || findCellPos(editor.state.doc, domPos);
  if (!resolved) return null;
  const cellNode = editor.state.doc.nodeAt(resolved.pos);
  if (!cellNode) return null;
  const propertyType = String(cellNode.attrs.propertyType || 'text');
  if (propertyType !== 'select' && propertyType !== 'date') return null;
  const cellRect = cell.getBoundingClientRect();
  const paneRect = editorPane.getBoundingClientRect();
  return {
    type: propertyType,
    cellPos: resolved.pos,
    left: Math.max(12, cellRect.left - paneRect.left + (editorPane.scrollLeft || 0)),
    top: Math.max(12, cellRect.bottom - paneRect.top + (editorPane.scrollTop || 0) + 8),
    options: String(cellNode.attrs.propertyOptions || '').split(',').map((item: string) => item.trim()).filter(Boolean),
    mode: (cellNode.attrs.propertyMode || 'single') as 'single' | 'multi',
    value: propertyType === 'date' ? String(cellNode.attrs.dateValue || '') : String(cellNode.attrs.selectValue || ''),
  };
}
