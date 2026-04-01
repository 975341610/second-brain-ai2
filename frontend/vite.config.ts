import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('prosemirror-tables') || id.includes('@tiptap/pm') || id.includes('prosemirror')) return 'prosemirror';
          if (id.includes('react-markdown') || id.includes('remark-gfm') || id.includes('marked')) return 'markdown';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    hmr: {
      host: '127.0.0.1',
      protocol: 'ws',
      clientPort: 5173,
    },
  },
});

