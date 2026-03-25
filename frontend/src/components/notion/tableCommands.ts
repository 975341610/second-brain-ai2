import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Fragment, Node } from '@tiptap/pm/model';

// Pure transaction helper for table row drag/reorder.
// Implemented via ProseMirror transaction so it is unit-testable.
export function moveTableRow(
  tr: Transaction,
  state: EditorState,
  fromIndex: number,
  toIndex: number,
  tablePosOverride?: number
): boolean {
  if (fromIndex === toIndex) return false;

  const { selection } = state;
  const { $from } = selection;
  
  // Find table node
  let tablePos = tablePosOverride !== undefined ? tablePosOverride : -1;
  let tableNode: Node | null = null;

  if (tablePos !== -1) {
    tableNode = tr.doc.nodeAt(tablePos);
    if (tableNode?.type.name !== 'table') {
      tableNode = null;
      tablePos = -1;
    }
  }

  if (tablePos === -1) {
    for (let i = $from.depth; i > 0; i--) {
      if ($from.node(i).type.name === 'table') {
        tablePos = $from.before(i);
        tableNode = $from.node(i);
        break;
      }
    }
  }

  if (tablePos === -1 || !tableNode) return false;

  const rows: Node[] = [];
  tableNode.forEach((node) => rows.push(node));

  if (fromIndex < 0 || fromIndex >= rows.length || toIndex < 0 || toIndex >= rows.length) return false;

  const movedRow = rows[fromIndex];
  const newRows = [...rows];
  newRows.splice(fromIndex, 1);
  newRows.splice(toIndex, 0, movedRow);

  // Use Fragment.fromArray to correctly insert multiple nodes
  tr.replaceWith(tablePos + 1, tablePos + tableNode.nodeSize - 1, Fragment.fromArray(newRows));
  
  // After moving, the selection might be invalid if it was in the moved row.
  // We check if the selection points into a valid position.
  try {
    const $from = tr.selection.$from;
    if ($from.parent.type.name === 'tableRow') {
      // Find the first cell and put selection there
      const cell = $from.node($from.depth);
      if (cell && (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader')) {
        // Selection is okay, it's inside a cell
      } else {
        // Selection is on the row itself, move it inside
        const resolvedPos = tr.doc.resolve($from.pos + 1);
        if (resolvedPos.parent.type.name.includes('TableCell') || resolvedPos.parent.type.name.includes('table')) {
           tr.setSelection(TextSelection.near(resolvedPos));
        }
      }
    }
  } catch (e) {
    // Selection recovery failed, let ProseMirror handle it or fall back
  }
  
  return true;
}
