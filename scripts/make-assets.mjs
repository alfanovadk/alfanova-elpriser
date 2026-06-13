// Rasteriserer Elly-SVG'en til de PNG-kilder @capacitor/assets forventer i assets/.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
const svg = readFileSync(join(assets, 'icon-source.svg'));
const BG = '#BFE6CC';

// Ikon: 1024×1024 uigennemsigtigt
await sharp(svg, { density: 384 }).resize(1024, 1024).flatten({ background: BG })
  .png().toFile(join(assets, 'icon-only.png'));

// Splash: 2732×2732, Elly centreret på brand-baggrund (logo ~40% bredde)
const logo = await sharp(svg, { density: 384 }).resize(1100, 1100).png().toBuffer();
const make = () => sharp({ create: { width: 2732, height: 2732, channels: 3, background: BG } })
  .composite([{ input: logo, gravity: 'center' }]).png();
await make().toFile(join(assets, 'splash.png'));
await make().toFile(join(assets, 'splash-dark.png'));

console.log('make-assets: icon-only.png + splash(.dark).png genereret');
