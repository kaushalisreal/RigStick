// Builds src/presets/art/ from the Kenney CC0 packs (Particle Pack 1.1, Smoke Particles):
// node scripts/build-preset-art.mjs <folder with the unzipped packs>
// Stills become 256 px WebP with transparency (white art, tinted in RigStick); smoke sequences become
// numbered 256 px frames for flipbook stickers. Needs ffmpeg with libwebp on PATH.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2] ?? fail('Give the folder that holds x-particle-pack and x-smoke-particles.');
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'presets', 'art');
function fail(message) { console.error(message); process.exit(1); }
mkdirSync(out, { recursive: true });

const webp = (input, output, size = 256) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease`,
  '-c:v', 'libwebp', '-lossless', '0', '-quality', '82', '-pix_fmt', 'yuva420p', output]);

// Stills: the shapes an action scene needs.
const particles = path.join(source, 'x-particle-pack', 'PNG (Transparent)');
const STILLS = ['trace_01', 'trace_02', 'trace_03', 'trace_04', 'trace_05', 'trace_06', 'trace_07', 'slash_01', 'slash_02', 'slash_03', 'slash_04',
  'star_01', 'star_04', 'star_06', 'star_08', 'spark_01', 'spark_03', 'spark_05', 'spark_07', 'magic_01', 'magic_03', 'magic_05', 'muzzle_01', 'muzzle_03', 'muzzle_05',
  'twirl_01', 'twirl_02', 'twirl_03', 'light_01', 'light_03', 'flare_01', 'circle_01', 'circle_03', 'circle_05', 'scorch_01', 'scorch_03', 'scratch_01',
  'dirt_01', 'dirt_03', 'fire_01', 'flame_01', 'flame_04', 'smoke_01', 'smoke_04', 'smoke_07', 'symbol_01', 'symbol_02'];
for (const name of STILLS) webp(path.join(particles, `${name}.png`), path.join(out, `${name}.webp`));

// Sequences: every frame, in order.
const smoke = path.join(source, 'x-smoke-particles', 'PNG');
const SEQUENCES = {explosion: 'Explosion', flash: 'Flash', puff: 'White puff', 'black-smoke': 'Black smoke'};
for (const [name, folder] of Object.entries(SEQUENCES)) {
  const frames = readdirSync(path.join(smoke, folder)).filter(file => file.endsWith('.png')).sort();
  frames.forEach((file, i) => webp(path.join(smoke, folder, file), path.join(out, `${name}-${String(i).padStart(2, '0')}.webp`)));
  console.log(`${name}: ${frames.length} frames`);
}
copyFileSync(path.join(source, 'x-particle-pack', 'License.txt'), path.join(out, 'LICENSE-kenney-particle-pack.txt'));
copyFileSync(path.join(source, 'x-smoke-particles', 'license.txt'), path.join(out, 'LICENSE-kenney-smoke-particles.txt'));
writeFileSync(path.join(out, 'README.md'), '# Preset art\n\nCC0 (public domain) art by Kenney (kenney.nl): Particle Pack 1.1 and Smoke Particles. Rebuilt by `scripts/build-preset-art.mjs`.\n');
console.log(`${STILLS.length} stills → ${out}`);
