import { copyFileSync, cpSync, readFileSync, writeFileSync } from 'fs';

// Copy HTML files to dist/
copyFileSync('src/offscreen/offscreen.html', 'dist/offscreen.html');
copyFileSync('src/options/options.html', 'dist/options.html');
copyFileSync('manifest.json', 'dist/manifest.json');

// Copy icons
cpSync('icons', 'dist/icons', { recursive: true });

// Fix script path in offscreen.html (../offscreen.js → offscreen.js)
const html = readFileSync('dist/offscreen.html', 'utf8');
writeFileSync('dist/offscreen.html', html.replace('../offscreen.js', 'offscreen.js'));

console.log('postbuild: assets copied to dist/');
