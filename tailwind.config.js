/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['"Inter"', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
      },
      colors: {
        nothing: {
          black: '#050505',
          white: '#fafafa',
          gray: '#71717a',
          accent: '#3b82f6',
        }
      }
    },
  },
  plugins: [],
}
