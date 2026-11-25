// Renders docs/logo.svg into the Android launcher icons (legacy, round, adaptive) and the native splash.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const svg = fs.readFileSync('docs/logo.svg');
const res = 'android/app/src/main/res';
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fgSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const round = (s) => Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></svg>`);
const squircle = (s) => Buffer.from(`<svg width="${s}" height="${s}"><rect width="${s}" height="${s}" rx="${s * 0.22}"/></svg>`);
const render = async (size, mask) => {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  return mask ? sharp(png).composite([{ input: mask(size), blend: 'dest-in' }]).png().toBuffer() : png;
};

for (const [d, s] of Object.entries(sizes)) {
  const dir = path.join(res, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), await render(s, squircle));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await render(s, round));
  const f = fgSizes[d];
  const art = await render(Math.round(f * 0.78));
  const fg = await sharp({ create: { width: f, height: f, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, gravity: 'center' }]).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg);
}

const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), xml);
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), xml);
fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0d0a24</color>\n</resources>\n');

// Native splash shown for a moment before the web opening animation takes over
for (const dir of fs.readdirSync(res).filter((n) => n.startsWith('drawable'))) {
  const p = path.join(res, dir, 'splash.png');
  if (!fs.existsSync(p)) continue;
  const { width, height } = await sharp(p).metadata();
  const art = await render(Math.round(Math.min(width, height) * 0.28), squircle);
  const out = await sharp({ create: { width, height, channels: 4, background: '#07080d' } })
    .composite([{ input: art, gravity: 'center' }]).png().toBuffer();
  fs.writeFileSync(p, out);
}
console.log('icons done');
