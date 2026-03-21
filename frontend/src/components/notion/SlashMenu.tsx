import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Type } from 'lucide-react';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';

export type SlashItem = {
  group: string;
  label: string;
  description: string;
  icon?: React.ReactNode;
  keywords: string[];
  action: (chain: any) => void;
};

interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashMenuHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      command(item);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((selectedIndex + 1) % items.length);
        return true;
      }

      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  useEffect(() => {
    const activeItem = scrollContainerRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div 
      className="notion-slash-menu z-50 min-w-[280px] max-h-[360px] flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100 bg-stone-50/50">
        常用命令
      </div>
      <div 
        ref={scrollContainerRef}
        className="overflow-y-auto p-1 scrollbar-hide"
      >
        {items.map((item, index) => (
          <button
            key={`${item.group}-${item.label}`}
            data-index={index}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all ${
              index === selectedIndex ? 'bg-stone-100' : 'hover:bg-stone-50'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              selectItem(index);
            }}
            onMouseMove={() => setSelectedIndex(index)}
          >
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-stone-100 bg-white shadow-sm ${
              index === selectedIndex ? 'text-stone-900' : 'text-stone-500'
            }`}>
              {item.icon || <Type size={18} />}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className={`text-sm font-semibold truncate ${
                index === selectedIndex ? 'text-stone-900' : 'text-stone-700'
              }`}>
                {item.label}
              </div>
              <div className="truncate text-xs text-stone-400 font-medium">
                {item.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
});

SlashMenu.displayName = 'SlashMenu';

export const getSuggestionConfig = (itemsRef: React.MutableRefObject<SlashItem[]>) => ({
  items: ({ query }: { query: string }) => {
    const items = itemsRef.current;
    return items.filter(item => {
      const q = query.toLowerCase();
      return item.label.toLowerCase().includes(q) || item.keywords.some(k => k.toLowerCase().includes(q));
    }).slice(0, 20);
  },

  render: () => {
    let component: any;
    let popup: any;

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(SlashMenu, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });
      },

      onUpdate(props: any) {
        if (component) {
          component.updateProps(props);
        }

        if (!props.clientRect || !popup || !popup[0]) {
          return;
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          if (popup && popup[0]) {
            popup[0].hide();
            return true;
          }
          return false;
        }

        return component?.ref?.onKeyDown(props);
      },

      onExit() {
        if (popup && popup[0]) {
          popup[0].destroy();
          popup = null;
        }
        if (component) {
          component.destroy();
          component = null;
        }
      },
    };
  },
});

SlashMenu.displayName = 'SlashMenu';
