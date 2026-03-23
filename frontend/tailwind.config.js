/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['Inter', '"IBM Plex Sans"', 'sans-serif'],
        mono: ['Menlo', 'Monaco', 'monospace'],
      },
      colors: {
        reflect: {
          bg: '#fcfbf9',
          sidebar: '#f4f3f0',
          accent: '#7c7267',
          border: '#e8e6e1',
          text: '#2d2c2a',
          muted: '#8e8c89',
        }
      },
      boxShadow: {
        soft: '0 2px 10px rgba(0, 0, 0, 0.05)',
        'soft-lg': '0 10px 40px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
