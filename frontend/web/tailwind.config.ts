import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Dashboard Theme */
        dashboard: {
          bg: '#0B0F19',
          panel: '#111827',
          border: '#1F2937',
        },
        /* Fond Deep Slate */
        geo: {
          800: '#334155',
          700: '#475569',
          600: '#64748b',
          500: '#94a3b8',
          400: '#cbd5e1',
        },

        /* Or - mining gold, warnings */
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        /* Cyan - geospatial/tech/eau */
        cyan: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        /* Violet - IA/intelligence */
        violet: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        /* Danger - alertes critiques */
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },
        /* Legacy aliases */
        primary: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
      },
      fontFamily: {
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'monospace'],
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px 2px rgba(251,191,36,0.3)' },
          '50%': { boxShadow: '0 0 20px 6px rgba(251,191,36,0.6)' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'count-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'radar-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 4s linear infinite',
        shimmer: 'shimmer 2s linear infinite',
        'count-up': 'count-up 0.4s ease-out',
        'radar-spin': 'radar-spin 6s linear infinite',
      },
      boxShadow: {
        'glow-gold': '0 0 20px 4px rgba(245,158,11,0.25)',
        'glow-cyan': '0 0 20px 4px rgba(6,182,212,0.25)',
        'glow-violet': '0 0 20px 4px rgba(139,92,246,0.25)',
        'glow-danger': '0 0 20px 4px rgba(239,68,68,0.25)',
        glass: '0 8px 32px rgba(0,0,0,0.3)',
      },
      backgroundImage: {
        'geo-mesh': 'radial-gradient(ellipse at 20% 50%, rgba(251,191,36,0.12) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(6,182,212,0.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(139,92,246,0.05) 0%, transparent 50%)',
      },
    },
  },
  plugins: [],
};

export default config;
