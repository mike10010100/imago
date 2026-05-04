import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';

// Copy HTML files to dist/
copyFileSync('src/offscreen/offscreen.html', 'dist/offscreen.html');
copyFileSync('src/options/options.html', 'dist/options.html');
copyFileSync('src/options/options.css', 'dist/options.css');
copyFileSync('manifest.json', 'dist/manifest.json');

// Copy icons
cpSync('icons', 'dist/icons', { recursive: true });

// Copy ONNX Runtime wasm/mjs worker files locally so MV3 CSP ('self') allows them.
// Without this, ONNX Runtime fetches these from jsDelivr CDN which is blocked.
const ortSrc = 'node_modules/onnxruntime-web/dist';
const ortDest = 'dist/assets/ort';
mkdirSync(ortDest, { recursive: true });
for (const file of readdirSync(ortSrc)) {
  if (file.endsWith('.mjs') || file.endsWith('.wasm')) {
    copyFileSync(`${ortSrc}/${file}`, `${ortDest}/${file}`);
  }
}

// Fix script path in offscreen.html (../offscreen.js → offscreen.js)
const html = readFileSync('dist/offscreen.html', 'utf8');
writeFileSync('dist/offscreen.html', html.replace('../offscreen.js', 'offscreen.js'));

console.log('postbuild: assets copied to dist/');
