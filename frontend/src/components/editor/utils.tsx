import type { Editor } from '@tiptap/react';
import React from 'react';
import { getMediaType } from '../../lib/mediaUtils';
import { api } from '../../lib/api';

export function createVideoHtml(src: string) {
  return `<video controls muted class="embedded-video" src="${src}"></video>`;
}

export function createAudioHtml(src: string) {
  return `<audio controls class="embedded-audio" src="${src}"></audio>`;
}

export function bilibiliEmbedUrl(url: string) {
  // Support BV and av ids
  const bv = url.match(/\/video\/(BV[\w]+)/i)?.[1] || url.match(/\/(BV[\w]+)/i)?.[1];
  if (bv) return `https://player.bilibili.com/player.html?bvid=${bv}&page=1&autoplay=0&muted=1&danmaku=0`;
  const av = url.match(/\/video\/av(\d+)/i)?.[1] || url.match(/\/av(\d+)/i)?.[1];
  if (av) return `https://player.bilibili.com/player.html?aid=${av}&page=1&autoplay=0&muted=1&danmaku=0`;
  
  // Also support b23.tv or other shortened urls
  // If we have a direct BV in the URL but not in standard format
  const anyBV = url.match(/(BV[\w]{10})/i)?.[1];
  if (anyBV) return `https://player.bilibili.com/player.html?bvid=${anyBV}&page=1&autoplay=0&muted=1&danmaku=0`;

  return '';
}

export function genericEmbedUrl(url: string) {
  // Simple check for valid url
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch(e) {
    // Try adding https:// if missing
    try {
      urlObj = new URL('https://' + url);
      url = urlObj.toString();
    } catch(e2) {
      return null;
    }
  }

  const host = urlObj.hostname.toLowerCase();
  
  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    return { kind: 'youtube' as const, src: url };
  }
  
  if (host.includes('bilibili.com') || host.includes('b23.tv')) {
    const src = bilibiliEmbedUrl(url);
    return src ? { kind: 'iframe' as const, src } : null;
  }

  // Generic iframe support for common embeddable sites if needed
  // For now stick to requested ones
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
  if (!editor) return;
  
  const MAX_PREVIEW_SIZE = 20 * 1024 * 1024; // 20MB
  const mediaType = getMediaType(file.type, file.name);
  const isLarge = file.size > MAX_PREVIEW_SIZE;

  // Use Blob URL for instant preview (UX)
  const previewUrl = URL.createObjectURL(file);

  // 1. Decide how to render initially (Optimistic UI)
  if (isLarge || mediaType === 'file') {
    editor.chain().focus().insertContent({
      type: 'fileNode',
      attrs: { 
        src: previewUrl, 
        name: file.name, 
        size: file.size, 
        type: file.type || 'application/octet-stream',
        'data-upload-id': previewUrl // Use this for tracking
      }
    }).run();
  } else if (mediaType === 'image') {
    editor.chain().focus().insertContent(`<img src="${previewUrl}" data-upload-id="${previewUrl}" data-width="100%" style="width:100%; opacity: 0.5;" />`).run();
  } else if (mediaType === 'video') {
    editor.chain().focus().insertContent({
      type: 'videoNode',
      attrs: { src: previewUrl, 'data-upload-id': previewUrl }
    }).run();
  } else if (mediaType === 'audio') {
    editor.chain().focus().insertContent({
      type: 'audioNode',
      attrs: { src: previewUrl, 'data-upload-id': previewUrl }
    }).run();
  }

  // 2. Upload to server in chunks to avoid Nginx 413
  api.uploadMediaChunked(file).then(data => {
    const { url } = data;
    
    // 3. Find the placeholder and update its src
    // Use the latest editor instance from closure or command context
    editor.commands.command(({ tr, state }) => {
      let found = false;
      state.doc.descendants((node, pos) => {
        // Match by data-upload-id or src (fallback)
        const isMatch = (node.attrs['data-upload-id'] === previewUrl) || (node.attrs.src === previewUrl);
        const mediaTypes = ['fileNode', 'image', 'videoNode', 'audioNode'];
        
        if (mediaTypes.includes(node.type.name) && isMatch) {
          tr.setNodeMarkup(pos, undefined, { 
            ...node.attrs, 
            src: url, 
            'data-upload-id': null, // Clear tracking
            style: node.type.name === 'image' ? 'width:100%; opacity: 1;' : undefined 
          });
          found = true;
          return false;
        }
        return true;
      });
      return found;
    });

    // Revoke blob URL after a short delay to ensure swap happened
    setTimeout(() => {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch (e) {
        console.warn("Revoke failed", e);
      }
    }, 5000);

  }).catch(err => {
    console.error("Upload failed", err);
    alert("文件上传失败: " + err.message);
    URL.revokeObjectURL(previewUrl);
  });
}
