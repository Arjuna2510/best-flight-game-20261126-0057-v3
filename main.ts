// EMBERWING v3 — the make.fun entrypoint (Node 22, standard library only).
// The game lives in game/ as plain static files and its screenshots in
// screenshots/; this program hands both in. It copies them into the
// output directory (/output in the grader, MAKEFUN_OUTPUT_DIR elsewhere)
// and writes /output/dossier.json with the vendored make.fun library, so
// the judge reads exactly what the game holds — nothing more, nothing
// generated on the fly.
//
// Run it locally:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The output directory starts empty of our files, then takes the game and
// the screenshots whole: every file the browser loads, every render.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier is the scorer's own summary of what was handed in: the
// caps are the gate's (reference/gate.json), so a dossier that builds
// here is a dossier the scorer accepts. Only text_max_bytes shapes the
// bytes; the rest refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB, more than 993 entries under game/ or
// 48 MiB of game files, a game path over 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`EMBERWING v3 handed in to ${out}`);
