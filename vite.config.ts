import { defineConfig } from 'vite';

export default defineConfig({
  server: { 
    port: 5000, 
    host: '0.0.0.0',
    hmr: {
      clientPort: 443
    }
  },
  build: { sourcemap: true }
});
