/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f172a',
        surfaceSoft: '#111c33',
        outline: 'rgba(148, 163, 184, 0.16)',
        ink: '#e5eefc',
        muted: '#94a3b8',
        accent: {
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0f766e'
        }
      },
      boxShadow: {
        panel: '0 24px 60px rgba(2, 6, 23, 0.34)'
      },
      backgroundImage: {
        shell:
          'radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 28%), linear-gradient(180deg, #09111f 0%, #0b1324 100%)'
      }
    }
  },
  plugins: []
};
