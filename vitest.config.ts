// Vitest-Config (nur für Tests). vitest ist devDependency — Lauf via
// `pnpm test` (= `vitest run`) bzw. `pnpm exec vitest`.
//
// Der @/-Alias muss hier gespiegelt werden, weil radio-state.test.ts → radio-state.ts
// → db.ts den generierten Prisma-Client via `@/generated/prisma/client` importiert.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
})
