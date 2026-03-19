import { Columns2, Rows2, SquareSplitHorizontal, TableProperties, Trash2, Ungroup } from 'lucide-react';
import type { FloatingPosition } from './types';

type TableMenusProps = {
  contextMenu: FloatingPosition | null;
  actions: Array<{ label: string; action: () => void }>; 
  onRunAction: (action: () => void) => void;
};

export function TableMenus({ contextMenu, actions, onRunAction }: TableMenusProps) {
  const iconMap: Record<string, JSX.Element> = {
    '上方插行': <Rows2 size={14} />,
    '下方插行': <Rows2 size={14} />,
    '删除当前行': <Rows2 size={14} />,
    '左侧插列': <Columns2 size={14} />,
    '右侧插列': <Columns2 size={14} />,
    '删除当前列': <Columns2 size={14} />,
    '切换表头': <TableProperties size={14} />,
    '切换列表头': <TableProperties size={14} />,
    '切换单元格头': <TableProperties size={14} />,
    '合并单元格': <SquareSplitHorizontal size={14} />,
    '拆分单元格': <Ungroup size={14} />,
    '删除表格': <Trash2 size={14} />,
  };

  return (
    <>
      {contextMenu && (
        <div id="table-context-menu" onMouseDown={(event) => event.preventDefault()} className="absolute z-30 min-w-[200px] rounded-[16px] border border-stone-200 bg-white p-2 shadow-soft" style={{ left: `${contextMenu.left}px`, top: `${contextMenu.top}px` }}>
          <div className="mb-1 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-400">表格菜单</div>
          {actions.map((item) => (
            <button key={item.label} onMouseDown={(event) => event.preventDefault()} onClick={() => onRunAction(item.action)} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100">
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
