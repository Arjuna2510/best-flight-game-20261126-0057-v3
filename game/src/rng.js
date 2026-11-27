// EMBERWING v3 — seeded RNG (mulberry32). Deterministic worlds: same
// seed = same sky, same rings, same clouds. Shared by the game and the
// autopilot sim, so a sim win is a real win.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Deterministic ridgeline: N peaks between lo and hi, smoothed by midpoint
// displacement so far mountains look like mountains, not noise.
export function ridgeline(rng, n, lo, hi, roughness) {
  const pts = [];
  let v = range(rng, lo, hi);
  for (let i = 0; i < n; i++) {
    pts.push(v);
    v += range(rng, -roughness, roughness);
    v = Math.max(lo, Math.min(hi, v));
  }
  return pts;
}
