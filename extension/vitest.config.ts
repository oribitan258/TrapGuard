import { defineConfig } from 'vitest/config';

// Engine unit + differential harness. happy-dom supplies File / TextDecoder so
// the engine runs exactly as it does inside the Web Worker. Tests live under
// test/; .output and WXT internals are excluded.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    // Polyfill the browser-Worker globals pdf.js needs (canvas + recent TC39
    // APIs) before any test imports the engine. See pdfjsPolyfill.ts.
    setupFiles: ['./test/differential/pdfjsPolyfill.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['.output/**', '.wxt/**', 'node_modules/**', 'e2e/**'],
    // pdf.js parse+render is heavier than the TXT vectors; give it headroom.
    testTimeout: 30000,
  },
});
