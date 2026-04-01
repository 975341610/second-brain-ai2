import type { CellEditorState } from './cells';

type CellEditorPopoverProps = {
  editor: any;
  cellEditor: CellEditorState | null;
  dateDraft: string;
  onDateDraftChange: (value: string) => void;
  onApplyDate: (cellPos: number) => void;
  onApplySelect: (cellPos: number, option: string) => void;
  onClose: () => void;
};

export function CellEditorPopover({ cellEditor, dateDraft, onDateDraftChange, onApplyDate, onApplySelect, onClose }: CellEditorPopoverProps) {
  if (!cellEditor) return null;

  return (
    <div id="table-cell-editor" className="absolute z-30 min-w-[220px] rounded-[16px] border border-stone-200 bg-white p-3 shadow-soft" style={{ left: `${cellEditor.left}px`, top: `${cellEditor.top}px` }}>
      {cellEditor.type === 'date' ? (
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-stone-400">日期属性</div>
          <input type="datetime-local" value={dateDraft} onChange={(event) => onDateDraftChange(event.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => onApplyDate(cellEditor.cellPos)} className="mt-3 w-full rounded-xl bg-stone-900 px-3 py-2 text-sm text-white">保存日期</button>
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
                  onClick={() => onApplySelect(cellEditor.cellPos, option)}
                  className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${selected ? 'bg-emerald-50 text-emerald-700' : 'text-stone-700 hover:bg-stone-100'}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <button onMouseDown={(event) => event.preventDefault()} onClick={onClose} className="mt-3 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-600">关闭</button>
        </div>
      )}
    </div>
  );
}
