/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: '#c9a84c',
        'gold-light': '#e2c97e',
        'gold-dim': '#7a6124',
        'bg-base': '#0a0a0a',
        'bg-raised': '#111111',
        'bg-card': '#161616',
        'bg-hover': '#1e1e1e',
        'border-dim': '#1e1e1e',
        'border-mid': '#2a2a2a',
        'text-base': '#e8e4dc',
        'text-mid': '#a09a8e',
        'text-dim': '#5a5550',
        'status-green': '#2ecc71',
        'status-yellow': '#f39c12',
        'status-red': '#e74c3c',
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
