// Gera os arquivos visuais do renderer em src/renderer/assets/ (ignorada pelo git):
//   app.css  <- ui/app.css (Tailwind + tokens do design system)
//   ui.js    <- ui/entry.js (Lucide + Motion, empacotados)
//   fonts/   <- Inter (@fontsource-variable/inter), sem CDN
// Roda sozinho antes de `npm start` e `npm run dist` (prestart / predist) e no pipeline de publicação.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'src', 'renderer', 'assets');
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

// 1) Fonte
const fontSrc = path.join(root, 'node_modules', '@fontsource-variable', 'inter', 'files');
for (const f of ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']) {
  fs.copyFileSync(path.join(fontSrc, f), path.join(out, 'fonts', f));
}

// 2) CSS (Tailwind v4 CLI). Escaneia o HTML e o JS da interface em busca de classes utilitárias.
const tailwind = path.join(path.dirname(require.resolve('@tailwindcss/cli/package.json')), 'dist', 'index.mjs');
execFileSync(process.execPath, [tailwind, '-i', path.join(root, 'ui', 'app.css'), '-o', path.join(out, 'app.css'), '--minify'], {
  cwd: root,
  stdio: 'inherit',
});

// 3) JS (Lucide + Motion)
require('esbuild').buildSync({
  entryPoints: [path.join(root, 'ui', 'entry.js')],
  outfile: path.join(out, 'ui.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'chrome140',
  legalComments: 'none',
  logLevel: 'warning',
});

const kb = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(1) + ' KB';
console.log(`[build-ui] app.css ${kb('app.css')}, ui.js ${kb('ui.js')} -> ${path.relative(root, out)}`);
