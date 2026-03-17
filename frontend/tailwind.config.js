/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Georgia', 'serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 20px 40px rgba(50, 43, 24, 0.12)',
      },
    },
  },
  plugins: [],
};
