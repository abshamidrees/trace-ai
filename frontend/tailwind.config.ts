import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        mono:    ['Space Mono', 'monospace'],
      },
      colors: {
        bg:      '#06060f',
        surface: '#0d0c1d',
        border:  '#1e1b3a',
        violet:  '#7f5af0',
        teal:    '#2dd4bf',
      },
    },
  },
  plugins: [],
}

export default config
