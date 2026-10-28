/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      spacing: {
        '50': '12.5rem',
      },
      fontFamily: {
        sans: ['Poppins', 'Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        primary: 'rgb(var(--c-accent, 229 9 20) / <alpha-value>)',
        secondary: 'rgb(var(--c-secondary) / <alpha-value>)',
        text: 'rgb(var(--c-text) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 18, 30, 0.05), 0 8px 24px -12px rgba(16, 18, 30, 0.18)',
        pop: '0 12px 40px -12px rgba(16, 18, 30, 0.25)',
      },
    },
  },
  plugins: [],
}
