import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        harmony: {
          blue: '#1e40af',
          lightblue: '#3b82f6',
          teal: '#0d9488',
          bg: '#f8fafc',
        },
      },
      // ── Style trial: remap large radii → tighter, more clinical values ──────
      // To revert: delete or comment out this borderRadius block
      borderRadius: {
        'lg':   '5px',
        'xl':   '8px',
        '2xl':  '11px',
        '3xl':  '16px',
      },
      fontSize: {
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
      },
    },
  },
  plugins: [],
}

export default config
