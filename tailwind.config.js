/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'] },
      colors: {
        navy: '#101827',
        charcoal: '#182235',
        mist: '#F5F7FA',
        accent: '#4169E1',
        gain: '#16A085',
        loss: '#E05A5A',
      },
    },
  },
  plugins: [],
};
