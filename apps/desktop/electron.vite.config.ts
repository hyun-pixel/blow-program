import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import {
  defineConfig,
  externalizeDepsPlugin,
  loadEnv,
} from 'electron-vite';
import { assertPublicBuildConfig } from './scripts/public-build-config.js';

export default defineConfig(({ command, mode }) => {
  const envDir = resolve('.');
  if (command === 'build') assertPublicBuildConfig(loadEnv(mode, envDir, 'VITE_'));
  return {
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    envDir,
    envPrefix: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
  };
});
