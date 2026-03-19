import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { GripVertical, Trash2 } from 'lucide-react';
import { useMemo } from 'react';

type MediaKind = 'image' | 'video' | 'audio' | 'embed';

type MediaNodeViewProps = NodeViewProps & {
  kind: MediaKind;
};

export function MediaNodeView({ node, updateAttributes, deleteNode, selected, kind }: MediaNodeViewProps) {
  const src = node.attrs.src as string;
  const width = (node.attrs.width as string) || '100%';
  const height = (node.attrs.height as number) || 420;

  const content = useMemo(() => {
    if (kind === 'image') return <img src={src} alt="" className="media-node-inner" draggable={false} />;
    if (kind === 'video') return <video src={src} controls className="media-node-inner" />;
    if (kind === 'audio') return <audio src={src} controls className="media-node-audio" />;
    return <iframe src={src} className="media-node-inner" allowFullScreen height={height} />;
  }, [height, kind, src]);

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
