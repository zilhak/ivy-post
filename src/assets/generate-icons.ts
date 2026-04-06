/** SVG → PNG 아이콘 생성 — bun run src/assets/generate-icons.ts */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dir = resolve(import.meta.dir);
const svg = readFileSync(resolve(dir, 'icon.svg'));

const sizes = [16, 48, 128];

for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(resolve(dir, `icon-${size}.png`));
  console.log(`Created icon-${size}.png`);
}

console.log('Done');
