import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const assetsRoot = join(root, 'assets');

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) : /\.(?:js|css)$/.test(path) ? [path] : [];
  }));
  return files.flat();
}

const assets = (await collect(assetsRoot)).map(file => '/' + relative(root, file).split(sep).join('/'));
assets.push('/pdf.worker.mjs');
assets.sort();
const buildId = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
const swPath = join(root, 'sw.js');
const sw = await readFile(swPath, 'utf8');
if (!sw.includes('__BUILD_ASSETS__') || !sw.includes('__BUILD_ID__')) throw new Error('Thiếu chỗ chèn assets trong Service Worker');
await writeFile(swPath, sw.replace('__BUILD_ID__', buildId).replace('__BUILD_ASSETS__', JSON.stringify(assets)));
console.log(`Đã chuẩn bị giao diện offline: ${assets.length} tệp, bản ${buildId}`);
