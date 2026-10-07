// CommonJS on purpose: Node 22 loads an ESM config via require(esm) and Tailwind
// cannot invalidate that cache, so a running dev server never sees config edits.

/** @type {import('tailwindcss').Config} */

// Semantic tokens live as RGB channels in src/style.css (:root and .dark).
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        'border-strong': token('border-strong'),
        text: token('text'),
        'text-muted': token('text-muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        warn: token('warn'),
        danger: token('danger'),
        success: token('success'),
        'score-strong': token('score-strong'),
        'score-mid': token('score-mid'),
        'score-weak': token('score-weak'),
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        // Dense UI scale: 12 (xs) / 13 (meta) / 14 (sm, base) / 16 (base) / 18 (lg)
        meta: ['0.8125rem', { lineHeight: '1.125rem' }],
      },
      height: {
        header: '3rem',
      },
      spacing: {
        header: '3rem',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
}
