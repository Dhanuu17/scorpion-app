/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1A3C5E', dark: '#122d46', mid: '#2a5480', light: '#EAF1F8' },
        gold: { DEFAULT: '#E8A020', light: '#fdf3e0' },
      },
      fontFamily: { sans: ['DM Sans', 'system-ui', 'sans-serif'], mono: ['DM Mono', 'monospace'] },
    },
  },
  plugins: [],
}
