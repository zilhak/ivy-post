/** 임시 아이콘 생성 스크립트 — bun run src/assets/generate-icons.ts */
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const sizes = [16, 48, 128];
const dir = resolve(import.meta.dir);

for (const size of sizes) {
  // 간단한 SVG → PNG 대신, 1px 투명 PNG placeholder 생성
  // 실제 아이콘은 나중에 디자인해서 교체
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#6366f1"/>
    <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial" font-weight="bold" font-size="${size * 0.45}">Iv</text>
  </svg>`;

  writeFileSync(resolve(dir, `icon-${size}.svg`), canvas);
  console.log(`Created icon-${size}.svg`);
}

console.log('\nNote: manifest.json references .png files.');
console.log('For now, rename .svg to .png or convert them.');
console.log('Chrome can also accept SVG icons in some contexts.');
