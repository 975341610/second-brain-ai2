import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { GripVertical, Trash2, FileIcon, Download } from 'lucide-react';
import { useMemo } from 'react';
import { formatFileSize } from '../lib/mediaUtils';

type MediaKind = 'image' | 'video' | 'audio' | 'embed' | 'file';

type MediaNodeViewProps = NodeViewProps & {
  kind: MediaKind;
};

export function MediaNodeView({ node, updateAttributes, deleteNode, selected, kind }: MediaNodeViewProps) {
  const src = node.attrs.src as string;
  const width = (node.attrs.width as string) || '100%';
  const height = (node.attrs.height as number) || 420;

  const content = useMemo(() => {
    if (kind === 'image') return <img src={src} alt="" className="media-node-inner" draggable={false} />;
    if (kind === 'video') return <video src={src} controls muted playsInline className="media-node-inner" />;
    if (kind === 'audio') return <audio src={src} controls className="media-node-audio" />;
    if (kind === 'file') {
      const { name, size, type } = node.attrs;
      return (
        <div 
          className="flex items-center gap-3 p-3 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer group/file"
          onClick={() => window.open(src, '_blank')}
        >
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-white border border-stone-200 rounded-md text-stone-400 group-hover/file:text-blue-500 transition-colors shadow-sm">
            <FileIcon size={20} />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-[14px] font-medium text-stone-800 truncate mb-0.5">
              {name || '未命名文件'}
            </div>
            <div className="text-[12px] text-stone-400 flex items-center gap-2">
              {size ? <span>{formatFileSize(size)}</span> : null}
              {type ? <span className="uppercase text-[10px] bg-stone-200 px-1 rounded">{type.split('/').pop()}</span> : null}
            </div>
          </div>
          <div className="opacity-0 group-hover/file:opacity-100 transition-opacity">
            <Download size={16} className="text-stone-400" />
          </div>
        </div>
      );
    }
    
    // For iframes (kind === 'embed')
    let finalSrc = src;
    if (!finalSrc.includes('autoplay=')) {
      finalSrc += (finalSrc.includes('?') ? '&' : '?') + 'autoplay=0';
    }
    if (!finalSrc.includes('muted=') && !finalSrc.includes('mute=')) {
      finalSrc += (finalSrc.includes('?') ? '&' : '?') + 'muted=1';
    }

    return (
      <iframe 
        src={finalSrc} 
        className="media-node-inner" 
        allowFullScreen 
        height={height} 
      />
    );
  }, [height, kind, node.attrs, src]);

  const startResize = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const wrapper = (event.currentTarget.closest('[data-media-wrapper]') as HTMLElement | null)?.parentElement;
    if (!wrapper) return;
    const baseWidth = wrapper.clientWidth || 1;

    const onMove = (moveEvent: MouseEvent) => {
      const rect = wrapper.getBoundingClientRect();
      const nextWidth = Math.max(30, Math.min(100, ((moveEvent.clientX - rect.left) / baseWidth) * 100));
      updateAttributes({ width: `${Math.round(nextWidth)}%` });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <NodeViewWrapper className={`media-node-view ${selected ? 'is-selected' : ''}`} data-media-wrapper style={{ width }}>
      <div className="media-node-toolbar" contentEditable={false}>
        <button className="media-node-action drag-handle" data-drag-handle type="button">
          <GripVertical size={14} />
        </button>
        <div className="media-node-meta">{kind}</div>
        <button className="media-node-action" type="button" onClick={() => deleteNode()}>
          <Trash2 size={14} />
        </button>
      </div>
      {content}
      <button className="media-node-resize" contentEditable={false} type="button" onMouseDown={startResize} />
    </NodeViewWrapper>
  );
}
