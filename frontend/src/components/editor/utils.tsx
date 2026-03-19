import type { Editor } from '@tiptap/react';
import React from 'react';

export function createVideoHtml(src: string) {
  return `<video controls class="embedded-video" src="${src}"></video>`;
}

export function createAudioHtml(src: string) {
  return `<audio controls class="embedded-audio" src="${src}"></audio>`;
}

export function bilibiliEmbedUrl(url: string) {
  const bv = url.match(/\/video\/(BV[\w]+)/i)?.[1] || url.match(/\/(BV[\w]+)/i)?.[1];
  if (bv) return `https://player.bilibili.com/player.html?bvid=${bv}&page=1`;
  const av = url.match(/\/video\/av(\d+)/i)?.[1];
  if (av) return `https://player.bilibili.com/player.html?aid=${av}&page=1`;
  return '';
}

export function genericEmbedUrl(url: string) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return { kind: 'youtube' as const, src: url };
  if (url.includes('bilibili.com') || url.includes('b23.tv')) {
    const src = bilibiliEmbedUrl(url);
    return src ? { kind: 'iframe' as const, src } : null;
  }
  return null;
}

export function highlightSlashLabel(label: string, query: string) {
  if (!query.trim()) return label;
  const chars = query.toLowerCase().split('');
  let cursor = 0;
  return (
    <>
      {label.split('').map((char, index) => {
        const shouldHighlight = cursor < chars.length && char.toLowerCase() === chars[cursor];
        if (shouldHighlight) cursor += 1;
        return shouldHighlight ? <mark key={`${char}-${index}`} className="rounded bg-amber-200 px-1 text-stone-900">{char}</mark> : <span key={`${char}-${index}`}>{char}</span>;
      })}
    </>
  );
}

export function uploadLocalMedia(editor: Editor | null, file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (!editor || !result) return;
    if (file.type.startsWith('image/')) editor.chain().focus().insertContent(`<img src="${result}" data-width="100%" style="width:100%;" />`).run();
    else if (file.type.startsWith('video/')) editor.chain().focus().insertContent(createVideoHtml(result)).run();
    else if (file.type.startsWith('audio/')) editor.chain().focus().insertContent(createAudioHtml(result)).run();
    else editor.chain().focus().insertContent(`<p><a href="${result}" target="_blank">${file.name}</a></p>`).run();
  };
  reader.readAsDataURL(file);
}
