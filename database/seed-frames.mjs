// Optional helper: seeds the `frames` table with the demo images bundled in
// frontend/assets/frames/, so the studio has something to show immediately.
// Usage: DATABASE_URL=postgresql://... node database/seed-frames.mjs
import { readFileSync, readdirSync } from 'fs';
import { extname, join } from 'path';
import { neon } from '@neondatabase/serverless';

const FRAMES_DIR = new URL('../frontend/assets/frames', import.meta.url).pathname;

// filename -> { size, type, name }
const DEMO_FRAMES = {
  'ToyStory-5x15.png': { size: '5x15', type: 'free', name: 'Toy Story (Kiri)' },
  'Bakery-5x15.png': { size: '5x15', type: 'free', name: 'Bakery (Kiri)' },
  'Beach-5x15.png': { size: '5x15', type: 'premium', name: 'Beach (Kiri) — Premium' },
  'ToyStory-10x15.png': { size: '10x15', type: 'free', name: 'Toy Story (Kanan)' },
  'Bakery-10x15.png': { size: '10x15', type: 'free', name: 'Bakery (Kanan)' },
  'Beach-10x15.png': { size: '10x15', type: 'premium', name: 'Beach (Kanan) — Premium' },
  'tema11.png': { size: '10x15', type: 'premium', name: 'Tema Klasik — Premium' },
};

function toBase64DataUrl(filePath) {
  const buffer = readFileSync(filePath);
  const mime = extname(filePath) === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL sebelum menjalankan seed.');
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);
  const files = readdirSync(FRAMES_DIR).filter((f) => DEMO_FRAMES[f]);

  for (const file of files) {
    const { size, type, name } = DEMO_FRAMES[file];
    const imageUrl = toBase64DataUrl(join(FRAMES_DIR, file));
    await sql`
      INSERT INTO frames (name, size, type, image_url)
      VALUES (${name}, ${size}, ${type}, ${imageUrl})
    `;
    console.log(`Seeded: ${name}`);
  }
  console.log('Selesai.');
}

main();
