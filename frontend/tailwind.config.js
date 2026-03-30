/** @type {import('tailwindcss').Config} */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  content: [
    resolve(__dirname, 'index.html'),
    resolve(__dirname, 'src/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['Inter', '"IBM Plex Sans"', 'sans-serif'],
        mono: ['Menlo', 'Monaco', 'monospace'],
      },
      colors: {
        reflect: {
          bg: 'var(--reflect-bg)',
          sidebar: 'var(--reflect-sidebar)',
          accent: 'var(--reflect-accent)',
          border: 'var(--reflect-border)',
          text: 'var(--reflect-text)',
          muted: 'var(--reflect-muted)',
        },
      },
      boxShadow: {
        soft: '0 2px 10px rgba(0, 0, 0, 0.05)',
        'soft-lg': '0 10px 40px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
