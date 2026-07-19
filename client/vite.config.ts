import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3001,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        // Exclude directories that should NOT trigger HMR reloads.
        // Without this, changes to .git internals, server files, markdown
        // docs, etc. can cause Vite to do a full-page reload.
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/server/**',
          '**/*.md',
          '**/*.json',
          '!**/components.json',
          '!**/tsconfig.json',
          '!**/package.json',
        ],
      },
    },
  };
});
