import { describe, it, expect } from 'vitest';
import { getMediaType, formatFileSize } from './mediaUtils';

describe('mediaUtils', () => {
  describe('getMediaType', () => {
    it('should identify image types', () => {
      expect(getMediaType('image/png', 'test.png')).toBe('image');
      expect(getMediaType('image/jpeg', 'test.jpg')).toBe('image');
      expect(getMediaType('', 'test.webp')).toBe('image');
    });

    it('should identify video types', () => {
      expect(getMediaType('video/mp4', 'test.mp4')).toBe('video');
      expect(getMediaType('', 'test.mov')).toBe('video');
    });

    it('should identify audio types', () => {
      expect(getMediaType('audio/mpeg', 'test.mp3')).toBe('audio');
      expect(getMediaType('', 'test.wav')).toBe('audio');
    });

    it('should identify pdf as file', () => {
      expect(getMediaType('application/pdf', 'test.pdf')).toBe('file');
    });

    it('should fallback to file for unknown types', () => {
      expect(getMediaType('application/zip', 'test.zip')).toBe('file');
      expect(getMediaType('', 'unknown')).toBe('file');
    });

    it('should respect size limit for preview (optional logic)', () => {
      // If we decide large images shouldn't preview automatically
      // expect(getMediaType('image/png', 'huge.png', 100 * 1024 * 1024)).toBe('file');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(1024 * 1024 * 10.5)).toBe('10.5 MB');
    });
  });
});
