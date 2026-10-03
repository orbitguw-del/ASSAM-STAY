import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  test: {
    include: ['src/**/*.test.js', 'supabase/tests/**/*.test.js'],
    testTimeout: 60000,
  },
});
