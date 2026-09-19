/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        field: {
          50: '#eefcf3',
          100: '#d7f7e2',
          200: '#b0eec8',
          300: '#7cdea9',
          400: '#48c687',
          500: '#25a96d',
          600: '#178757',
          700: '#146c48',
          800: '#14563b',
          900: '#124732',
          950: '#07281c',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
