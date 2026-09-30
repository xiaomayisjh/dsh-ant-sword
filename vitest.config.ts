import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The vendored UI is also installed as a standalone package in release
    // profiles.  Vite otherwise resolves its stale package-local React link
    // (18.2) while the host test renderer uses the root React (18.3), which
    // produces the invalid-hook-call failure seen only in UI tests.
    dedupe: ['react', 'react-dom'],
  },
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
