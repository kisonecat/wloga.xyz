import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  build: {
    outDir: '../output',
    emptyDir: false,  // Don't delete output/data/
  },
  // Only set publicDir during dev to serve /data from output/data
  publicDir: command === 'serve' ? '../output' : false,
}))
