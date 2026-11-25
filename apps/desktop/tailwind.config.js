// Tailwind maps utilities onto the D1 token CSS variables (AGENTS.md rule 6).
// The variables are written at runtime from `@breath-and-word/tokens`
// (`themeToCssVariables` + font/spacing/radius scales) so no hex value or magic
// number lives in a component.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bw-bg-canvas)',
        surface: 'var(--bw-bg-surface)',
        elevated: 'var(--bw-bg-elevated)',
        ink: {
          primary: 'var(--bw-text-primary)',
          secondary: 'var(--bw-text-secondary)',
          verse: 'var(--bw-text-verse-num)',
          red: 'var(--bw-text-red-letter)',
        },
        accent: {
          DEFAULT: 'var(--bw-accent-primary)',
          breath: 'var(--bw-accent-breath-glow)',
        },
        hairline: 'var(--bw-border-subtle)',
      },
      spacing: {
        none: 'var(--bw-space-none)',
        xxs: 'var(--bw-space-xxs)',
        xs: 'var(--bw-space-xs)',
        sm: 'var(--bw-space-sm)',
        md: 'var(--bw-space-md)',
        lg: 'var(--bw-space-lg)',
        xl: 'var(--bw-space-xl)',
        xxl: 'var(--bw-space-xxl)',
        xxxl: 'var(--bw-space-xxxl)',
      },
      borderRadius: {
        sm: 'var(--bw-radius-sm)',
        md: 'var(--bw-radius-md)',
        lg: 'var(--bw-radius-lg)',
        pill: 'var(--bw-radius-pill)',
      },
      fontFamily: {
        scripture: 'var(--bw-font-scripture)',
        ui: 'var(--bw-font-ui)',
        hebrew: 'var(--bw-font-hebrew)',
        greek: 'var(--bw-font-greek)',
      },
    },
  },
  plugins: [],
};
