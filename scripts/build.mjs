import { build } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

// Clean dist dir
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy public assets to dist
const publicDir = path.join(root, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, distDir, { recursive: true });
}

// Copy manifest-weapons.json and locales to dist/data
const dataDir = path.join(distDir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const manifestJsonSource = path.join(root, 'data', 'manifest-weapons.json');
if (fs.existsSync(manifestJsonSource)) {
  fs.copyFileSync(manifestJsonSource, path.join(dataDir, 'manifest-weapons.json'));
}
const localesSource = path.join(root, 'data', 'locales');
if (fs.existsSync(localesSource)) {
  fs.cpSync(localesSource, path.join(dataDir, 'locales'), { recursive: true });
}
const popularityJsonSource = path.join(root, 'data', 'community-popularity.json');
if (fs.existsSync(popularityJsonSource)) {
  fs.copyFileSync(popularityJsonSource, path.join(dataDir, 'community-popularity.json'));
}

const entries = {
  background: path.join(root, 'src/background.ts'),
  content: path.join(root, 'src/content.ts'),
  'main-world-content': path.join(root, 'src/main-world-content.ts'),
  popup: path.join(root, 'src/popup.ts'),
  'lightgg-content': path.join(root, 'src/lightgg-content.ts'),
  'lightgg-main-world': path.join(root, 'src/lightgg-main-world.ts'),
};

console.log('⚡ Building standalone extension bundles (IIFE)...');

for (const [name, entryPath] of Object.entries(entries)) {
  await build({
    root,
    configFile: false,
    publicDir: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        input: entryPath,
        output: {
          format: 'iife',
          name: `aegis_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
          entryFileNames: `${name}.js`,
          inlineDynamicImports: true,
        },
      },
    },
  });
  console.log(`  ✓ Built dist/${name}.js (standalone IIFE)`);
}

console.log('✅ All bundles built successfully without chunks!\n');
