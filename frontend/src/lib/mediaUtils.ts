/**
 * File type detection logic for Tiptap editor
 * Supports: image, video, audio, and fallback to 'file'
 */

export type MediaType = 'image' | 'video' | 'audio' | 'file';

export function getMediaType(mimeType: string, filename: string, size?: number): MediaType {
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  // 1. Check MIME type (more reliable)
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
  }

  // 2. Check Extension (fallback for local files without MIME sometimes)
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
  const videoExts = ['mp4', 'mov', 'webm', 'ogg', 'mkv'];
  const audioExts = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'];

  if (imageExts.includes(extension)) return 'image';
  if (videoExts.includes(extension)) return 'video';
  if (audioExts.includes(extension)) return 'audio';

  // 3. Fallback to file card for others (including PDF, Zip, etc.)
  return 'file';
}

/**
 * Pretty print file sizes
 */
export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
