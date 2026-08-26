/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#dbecff',
          200: '#bedeff',
          300: '#91caff',
          400: '#5dadff',
          500: '#3884ff',
          600: '#1f63f5',
          700: '#174de1',
          800: '#193fb6',
          900: '#1a388f',
          950: '#152357',
        },
        accent: {
          50: '#fffdf5',
          100: '#fef6d9',
          200: '#fceba9',
          300: '#f9d96f',
          400: '#f6c033',
          500: '#eea30f',
          600: '#d27d06',
          700: '#ab5a08',
          800: '#8b450f',
          900: '#733914',
          950: '#451e05',
        },
        neutral: {
          50: '#f8f8f8',
          100: '#f0f0f0',
          200: '#e0e0e0',
          300: '#c8c8c8',
          400: '#a0a0a0',
          500: '#787878',
          600: '#5c5c5c',
          700: '#484848',
          800: '#383838',
          900: '#282828',
          950: '#1a1a1a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
