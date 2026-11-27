// Screenshot driver — genuine renders of the game's own code.
// Serves game/ on :8080, then for each entry in shots.json takes a
// 1280x800 headless-Chromium screenshot (virtual-time-budget lets the
// rAF loop settle a few seconds past the synchronous autopilot warmup),
// converts to JPEG quality 82, and writes screenshots/<name>.
// Usage: node tools/shots.mjs   (chromium-browser must exist)
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });
const tmpDir = join(root, '.shot-tmp');
mkdirSync(tmpDir, { recursive: true });

const CHROME = process.env.CHROME_BIN || '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux/chrome';

function waitForServer(port, tries = 40) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(`http://localhost:${port}/index.html`)
        .then((r) => (r.ok ? resolve() : setTimeout(tick, 250)))
        .catch(() => {
          if (--tries <= 0) reject(new Error('server did not come up'));
          else setTimeout(tick, 250);
        });
    };
    tick();
  });
}

const server = spawn('node', ['serve.ts', '--port', '8080'], { cwd: root, stdio: 'ignore' });
try {
  await waitForServer(8080);
  for (const shot of shots) {
    const png = join(tmpDir, shot.name.replace(/\.jpg$/, '.png'));
    const url = `http://localhost:8080/index.html${shot.query}`;
    execFileSync(CHROME, [
      '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--window-size=1280,800', '--virtual-time-budget=1200',
      `--screenshot=${png}`, url,
    ], { stdio: 'pipe', timeout: 60000 });
    // PNG -> JPEG quality 82 via PIL
    execFileSync('python3', ['-c',
      `from PIL import Image; im = Image.open(${JSON.stringify(png)}).convert('RGB'); im.save(${JSON.stringify(join(outDir, shot.name))}, 'JPEG', quality=82)`,
    ], { stdio: 'pipe', timeout: 60000 });
    const sz = statSync(join(outDir, shot.name)).size;
    console.log(`${shot.name.padEnd(16)} ${String(sz).padStart(7)} bytes ${sz <= 262144 ? 'OK' : 'OVER 256KiB!'}`);
  }
} finally {
  server.kill('SIGTERM');
}
console.log('done');
