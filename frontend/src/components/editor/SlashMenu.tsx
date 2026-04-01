import type { ReactNode, RefObject } from 'react';
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
  onPick: (action: () => void) => void;
};

export function SlashMenu({ visible, menuRef, listRef, position, query, items, activeIndex, renderLabel, onPick }: SlashMenuProps) {
  if (!visible) return null;

  return (
    <div ref={menuRef} className="absolute z-20 w-56 rounded-[18px] border border-stone-200 bg-white p-2 shadow-soft" style={{ left: `${Math.max(12, position.left)}px`, top: `${position.top}px` }}>
      <div className="mb-2 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">/{query || '输入关键字筛选命令'}</div>
      <div ref={listRef} className="max-h-72 space-y-1 overflow-y-auto">
        {items.map((item, index) => (
          <button
            data-slash-index={index}
            key={`${item.group}-${item.label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(item.action)}
            className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-stone-900 text-white' : 'hover:bg-stone-100'}`}
          >
            <div className="text-[11px] uppercase tracking-[0.18em] opacity-60">{item.group}</div>
            <div>/{renderLabel(item.label)}</div>
            <div className="mt-1 text-xs opacity-70">{item.description}</div>
          </button>
        ))}
        {items.length === 0 && <div className="rounded-xl px-3 py-2 text-sm text-stone-400">没有匹配命令</div>}
      </div>
    </div>
  );
}
