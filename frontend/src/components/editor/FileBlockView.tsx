import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { FileIcon, Download, ExternalLink, MoreVertical } from 'lucide-react';
import { formatFileSize } from '../../lib/mediaUtils';

interface FileBlockViewProps {
  node: {
    attrs: {
      src: string;
      name: string;
      size?: number;
      type?: string;
    };
  };
}

export const FileBlockView: React.FC<FileBlockViewProps> = ({ node }) => {
  const { src, name, size, type } = node.attrs;

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(src, '_blank');
  };

  return (
    <NodeViewWrapper className="notion-file-block my-2 group">
      <div 
        className="flex items-center gap-3 p-3 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer group"
        onClick={handleDownload}
      >
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-white border border-stone-200 rounded-md text-stone-400 group-hover:text-blue-500 transition-colors shadow-sm">
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

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            className="p-1.5 hover:bg-white rounded-md text-stone-400 hover:text-stone-600 border border-transparent hover:border-stone-200 shadow-sm"
            onClick={handleDownload}
            title="下载文件"
          >
            <Download size={16} />
          </button>
          <button 
            className="p-1.5 hover:bg-white rounded-md text-stone-400 hover:text-stone-600 border border-transparent hover:border-stone-200 shadow-sm"
            title="查看详情"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
};
