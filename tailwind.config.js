/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: '#141414',
        surface: '#181818',
        primary: '#e50914',
        secondary: '#2f2f2f',
        text: '#ffffff',
        muted: '#b3b3b3',
      },
    },
  },
  plugins: [],
}
