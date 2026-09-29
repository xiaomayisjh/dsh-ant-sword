import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'tests/**/*.spec.ts',
      'tests/**/*.spec.tsx',
      'vendor/ui-autograph/tests/**/*.spec.ts',
      'vendor/ui-autograph/tests/**/*.spec.tsx',
    ],
    exclude: [
      'node_modules/**',
      'skills/**',
      '**/node_modules/**',
    ],
  },
})
