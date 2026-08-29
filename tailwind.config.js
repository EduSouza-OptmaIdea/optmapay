/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        optma: {
          700: '#0F766E', // Primary Teal-700
          800: '#115E59',
          900: '#134E4A',
          50: '#F0FDFA',
          100: '#CCFBF1',
        },
      },
    },
  },
  plugins: [],
}
