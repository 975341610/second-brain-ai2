import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '@tiptap/react';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import StarterKit from '@tiptap/starter-kit';

describe('Table Selection Fix - TDD', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [
        StarterKit,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
      ],
      content: `
        <p>Text before table</p>
        <table>
          <tr><th>Header 1</th><th>Header 2</th></tr>
          <tr><td>Row 1</td><td>Data 1</td></tr>
        </table>
      `,
    });
  });

  it('FAIL: should NOT add a row when selection is outside the table', () => {
    // Set selection to the first paragraph (outside table)
    editor.commands.focus(1); 
    
    const initialRows = (editor.getHTML().match(/<tr/g) || []).length;
    
    // Attempt to add row - this is expected to fail or do nothing if selection is outside
    editor.commands.addRowAfter();
    
    const finalRows = (editor.getHTML().match(/<tr/g) || []).length;
    expect(finalRows).toBe(initialRows);
  });

  it('FIXED: should add a row even if selection was outside, by manually moving selection first', () => {
    // Set selection to the first paragraph (outside table)
    editor.commands.focus(1); 
    
    const initialRows = (editor.getHTML().match(/<tr/g) || []).length;
    
    // 模拟我们的修复方案：在执行命令前先强制移动 selection
    // 我们需要通过某种方式找到表格内部的一个位置
    // 假设我们已经通过 DOM 或其他方式知道了表格或行内部的一个位置
    // 在实际代码中，我们会通过 DOM 反查
    
    // 这里我们先模拟一下“先移动再执行”的行为
    const tablePos = 25; // 这是一个在表格内部的位置（根据上面的 content 大致估算）
    
    editor.chain().focus(tablePos).addRowAfter().run();
    
    const finalRows = (editor.getHTML().match(/<tr/g) || []).length;
    expect(finalRows).toBe(initialRows + 1);
  });
});
