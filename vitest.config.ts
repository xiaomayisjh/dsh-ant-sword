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
      'tests/ant-sword-harness.spec.ts',
      'tests/auto-loop.spec.ts',
      'tests/rewind-standalone.spec.ts',
      'node_modules/**',
      'skills/**',
      '**/node_modules/**',    ],
  },
})