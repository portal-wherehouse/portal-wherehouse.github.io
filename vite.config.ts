/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'uncommitted';
  }
}

/**
 * Stamps each build: version.json tells an open app that a newer version is deployed, and the id inside
 * sw.js makes browsers fetch the new service worker, which clears the previous version's cached files.
 */
function buildStamp(id: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'wherehouse-build-stamp',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: id }) });
    },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD_ID__', id));
    },
  };
}

// `--mode artifact` builds one self-contained HTML file for the hosted preview,
// where printing, camera and downloads are unavailable and the app adapts.
export default defineConfig(({ mode }) => {
  const buildTime = new Date().toISOString();
  const buildId = `${commit()}-${buildTime.replace(/\D/g, '').slice(0, 14)}`;
  return {
    // Relative paths, so the build works from any folder: a domain root or a GitHub Pages project page.
    base: './',
    plugins: [react(), ...(mode === 'artifact' ? [viteSingleFile()] : [buildStamp(buildId)])],
    define: {
      __BUILD_COMMIT__: JSON.stringify(commit()),
      __BUILD_TIME__: JSON.stringify(buildTime),
      __BUILD_ID__: JSON.stringify(buildId),
      __BUILD_TARGET__: JSON.stringify(mode === 'artifact' ? 'artifact' : 'app'),
    },
    build: {
      outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
      chunkSizeWarningLimit: 2000,
    },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
      testTimeout: 30000,
    },
  };
});
