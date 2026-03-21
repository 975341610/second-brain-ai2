import type { ReactNode, RefObject } from 'react';
import { Type } from 'lucide-react';
import type { FloatingPosition, SlashItem } from './types';

type SlashMenuProps = {
  visible: boolean;
  menuRef: RefObject<HTMLDivElement>;
  listRef: RefObject<HTMLDivElement>;
  position: FloatingPosition;
  query: string;
  items: SlashItem[];
  activeIndex: number;
  renderLabel: (label: string) => ReactNode;
  onPick: (action: (chain: any) => void) => void;
};

export function SlashMenu({ visible, menuRef, listRef, position, query, items, activeIndex, renderLabel, onPick }: SlashMenuProps) {
  if (!visible) return null;

  return (
    <div ref={menuRef} onMouseDown={(e) => e.preventDefault()} className="absolute z-20 w-72 rounded-xl border border-stone-200 bg-white p-1 shadow-xl" style={{ left: `${Math.max(12, position.left)}px`, top: `${position.top}px` }}>
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 border-b border-stone-100 mb-1">命令菜单</div>
      <div ref={listRef} className="max-h-[min(320px,60vh)] space-y-0.5 overflow-y-auto">
        {items.map((item, index) => (
          <button
            data-slash-index={index}
            key={`${item.group}-${item.label}`}
            onMouseDown={(e) => {
              // 彻底阻止点击导致编辑器失去焦点
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              // 在 Click 时触发 Action，保持与标准 Web 行为一致
              e.preventDefault();
              e.stopPropagation();
              onPick(item.action);
            }}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${index === activeIndex ? 'bg-stone-100' : 'hover:bg-stone-50'}`}
          >
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-stone-100 bg-white shadow-sm ${index === activeIndex ? 'text-stone-900' : 'text-stone-500'}`}>
              {item.icon || <Type size={18} />}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className={`text-sm font-medium ${index === activeIndex ? 'text-stone-900' : 'text-stone-700'}`}>{renderLabel(item.label)}</div>
              <div className="truncate text-xs text-stone-400">{item.description}</div>
            </div>
          </button>
        ))}
        {items.length === 0 && <div className="px-3 py-4 text-center text-sm text-stone-400">没有匹配命令</div>}
      </div>
    </div>
  );
}
