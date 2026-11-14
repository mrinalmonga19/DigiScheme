/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1F2761', 50: '#EEF0FA', 100: '#D9DDF2', 600: '#2A3580', 700: '#1F2761', 800: '#171D4A' },
        saffron: { DEFAULT: '#FF6B35', 600: '#E85A27', 50: '#FFF1EB' },
        verified: { DEFAULT: '#15803D', bg: '#DCFCE7' },
        estimated: { DEFAULT: '#B45309', bg: '#FEF3C7' },
      },
      fontFamily: {
        sans: ['"Noto Sans"', '"Noto Sans Devanagari"', '"Noto Sans Gurmukhi"', '"Noto Sans Tamil"', '"Noto Sans Kannada"', '"Noto Sans Bengali"', '"Noto Sans Telugu"', '"Noto Sans Gujarati"', 'system-ui', 'sans-serif'],
      },
      minHeight: { tap: '3rem' },
      minWidth: { tap: '3rem' },
    },
  },
  plugins: [],
};
