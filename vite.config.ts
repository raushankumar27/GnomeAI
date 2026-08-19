import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, '');
    }
  };
}

export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  base: './', // Ensure relative paths for Electron local file loading
  esbuild: {
    // @ts-ignore
    keepNames: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    minify: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        overlay: path.resolve(__dirname, 'electron/overlay.html'),
      }
    }
  },


  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    }
  }
});

