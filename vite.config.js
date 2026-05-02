import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: [
        'src/adminLogic.js',
        'src/awards.js',
        'src/gameLogic.js',
        'src/lineage.js',
        'src/narrative.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})