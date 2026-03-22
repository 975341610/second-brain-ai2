import React from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Copy, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function CodeBlockComponent({ node, updateAttributes, extension }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const languages = extension.options.lowlight.listLanguages();
  const currentLanguage = node.attrs.language || 'auto';

  const copyToClipboard = () => {
    const text = node.textContent;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <NodeViewWrapper className="code-block-wrapper relative group/code-block my-6">
      <div className="code-block-header flex items-center justify-between px-4 py-2 bg-stone-100/80 border-x border-t border-stone-200 rounded-t-lg transition-colors group-hover/code-block:bg-stone-100" contentEditable={false}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 pr-2 mr-2 border-r border-stone-200">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="relative flex items-center group/lang">
            <select
              className="appearance-none bg-transparent text-[11px] font-medium text-stone-500 hover:text-stone-800 focus:outline-none cursor-pointer pr-4 uppercase tracking-wider transition-colors"
              value={currentLanguage}
              onChange={(e) => updateAttributes({ language: e.target.value })}
            >
              <option value="auto">Auto</option>
              {languages.map((lang: string) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-0 text-stone-400 pointer-events-none transition-transform group-hover/lang:translate-y-0.5" />
          </div>
        </div>
        
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-stone-500 hover:bg-stone-200 hover:text-stone-800 transition-all active:scale-95"
          title="复制内容"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-500" />
              <span className="text-emerald-600">已复制</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>复制代码</span>
            </>
          )}
        </button>
      </div>
      
      <div className="relative">
        <pre className="notion-code-block bg-stone-50/50 border-x border-b border-t-0 border-stone-200 rounded-b-lg overflow-x-auto transition-colors group-hover/code-block:bg-stone-50">
          <NodeViewContent as={"code" as any} className={`language-${currentLanguage} font-mono text-[13.5px] leading-relaxed block p-4 min-h-[1em]`} />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
