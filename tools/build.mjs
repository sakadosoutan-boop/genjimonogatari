/* CSS / JS をすべてインライン化して、一枚で開ける dist/index.html を作る。
   オフラインでも、配布用の USB からでもそのまま開ける。 実行: node tools/build.mjs （--check で最新かどうかだけ調べる） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p.split(/[?#]/)[0]), 'utf8');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => '<style>\n' + read(href) + '\n</style>');
// </script> が中に現れても壊れないようにする
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, s) => '<script>\n' + read(s).replace(/<\/script/gi, '<\\/script') + '\n</script>');
const out = path.join(root, 'dist/index.html');
const kb = Math.round(Buffer.byteLength(html) / 1024);
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== html) { console.error('✖ dist/index.html が古いままです。npm run build を実行してください。'); process.exit(1); }
  console.log('✔ dist/index.html は最新（' + kb + ' KB）');
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log('✔ dist/index.html  (' + kb + ' KB)');
}
