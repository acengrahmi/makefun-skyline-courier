// terrain.js — the archipelago the courier flies over. One clear job: answer
// "how high is the ground here?" and describe the landmarks (islands,
// runway, rings, gates, trees, clouds) the renderer and the missions use.
// Everything is deterministic: the same seed always builds the same islands,
// so a practice run and a judged run fly the same map.

// --- Islands: a gaussian bump each, (x, z, radius, height) ----------------
export const ISLANDS = [
  { name: 'Home Island', x: 0, z: 550, r: 420, h: 46 },
  { name: 'Palm Cay', x: -620, z: 950, r: 210, h: 34 },
  { name: 'Twin Peaks', x: 700, z: 1050, r: 260, h: 78 },
  { name: 'Gull Rock', x: -950, z: 260, r: 150, h: 52 },
  { name: 'Coral Bar', x: 880, z: -120, r: 190, h: 18 },
  { name: 'North Point', x: -260, z: 1500, r: 230, h: 58 },
  { name: 'Driftwood', x: 420, z: 1650, r: 140, h: 26 },
  { name: 'Lighthouse Isle', x: -1150, z: 1250, r: 170, h: 40 },
];

// The runway: a flattened strip on Home Island, heading north (0 deg).
export const RUNWAY = {
  x: 0, z: 550, length: 420, width: 30, heading: 0, elevation: 9,
  name: 'Kestrel Field',
};

// Small deterministic wobble so hillsides are not perfect cones.
function wobble(x, z) {
  return (
    Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.017 - 0.6) * 3.2 +
    Math.sin(x * 0.052 - z * 0.043) * 1.4
  );
}

function bump(x, z, isle) {
  const dx = (x - isle.x) / isle.r;
  const dz = (z - isle.z) / isle.r;
  const d2 = dx * dx + dz * dz;
  if (d2 > 2.2) return 0;
  return isle.h * Math.exp(-d2 * 1.9);
}

// Height of the ground in metres at (x, z). Sea level is 0.
export function terrainHeightAt(x, z) {
  let h = 0;
  for (const isle of ISLANDS) h += bump(x, z, isle);
  if (h > 2.5) h += wobble(x, z);
  // Flatten the runway strip so the field is genuinely landable.
  const rx = x - RUNWAY.x;
  const rz = z - RUNWAY.z;
  if (Math.abs(rx) < RUNWAY.width / 2 + 26 && Math.abs(rz) < RUNWAY.length / 2 + 26) {
    const edge = Math.max(
      Math.abs(rx) / (RUNWAY.width / 2 + 26),
      Math.abs(rz) / (RUNWAY.length / 2 + 26),
    );
    const flat = RUNWAY.elevation;
    h = h * edge * edge + flat * (1 - edge * edge);
  }
  return Math.max(0, h);
}

// Is the point (x, z) on the runway strip itself?
export function onRunway(x, z) {
  return (
    Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 &&
    Math.abs(z - RUNWAY.z) < RUNWAY.length / 2
  );
}

// Colour of the ground at a height, in one warm island style.
export function groundColour(h, x, z) {
  if (h < 1.2) return '#e8d9a0'; // sand at the waterline
  if (h < 14) return shade('#6fae4e', wobble(x, z) * 2); // meadow grass
  if (h < 30) return shade('#4d8a3c', wobble(x, z) * 2); // deep green slopes
  if (h < 52) return shade('#7a6a52', wobble(x, z) * 2); // rock
  return '#e9eef2'; // pale peaks
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- Rings, gates, trees and clouds --------------------------------------
// Rings for the Ring Run: glowing hoops hung in the sky over the islands.
export const RINGS = [
  { x: 0, y: 62, z: 240, r: 24, name: 'Harbour Gate' },
  { x: -260, y: 74, z: 520, r: 24, name: 'Palm Arch' },
  { x: -640, y: 68, z: 880, r: 22, name: 'Cay Loop' },
  { x: -980, y: 96, z: 420, r: 24, name: 'Gull Arch' },
  { x: -420, y: 88, z: 1240, r: 22, name: 'North Arch' },
  { x: 180, y: 96, z: 1480, r: 24, name: 'Driftwood Loop' },
  { x: 660, y: 118, z: 1120, r: 24, name: 'Peaks Ring' },
  { x: 420, y: 70, z: 620, r: 24, name: 'Homecoming' },
];

// Slalom gates: pairs of orange buoys in the water, flown between at low level.
export const SLALOM_GATES = [
  { x: -180, z: 180, gap: 90 },
  { x: 240, z: 60, gap: 90 },
  { x: 520, z: -160, gap: 80 },
  { x: 760, z: -420, gap: 90 },
  { x: 560, z: -700, gap: 80 },
  { x: 180, z: -880, gap: 90 },
  { x: -220, z: -780, gap: 80 },
  { x: -560, z: -560, gap: 90 },
  { x: -760, z: -260, gap: 80 },
  { x: -620, z: 40, gap: 90 },
];

// Palm trees dotted on the beaches, seeded so they never move.
export const TREES = (() => {
  const trees = [];
  let seed = 20261126;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const isle of ISLANDS) {
    const count = Math.round(isle.r / 16);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const d = isle.r * (0.55 + rnd() * 0.42);
      const x = isle.x + Math.cos(a) * d;
      const z = isle.z + Math.sin(a) * d;
      const h = terrainHeightAt(x, z);
      if (h > 1.5 && h < 16) trees.push({ x, z, h, s: 5 + rnd() * 4 });
    }
  }
  return trees;
})();

// Puffy clouds drifting slowly over the archipelago.
export const CLOUDS = [
  { x: -400, y: 210, z: 600, s: 90 },
  { x: 300, y: 240, z: 900, s: 120 },
  { x: -900, y: 200, z: 1400, s: 100 },
  { x: 800, y: 260, z: 300, s: 110 },
  { x: 100, y: 230, z: 1700, s: 95 },
  { x: -200, y: 250, z: -400, s: 105 },
  { x: 950, y: 220, z: -700, s: 85 },
];

// The windsock at the runway threshold, for the landing mission's flavour.
export const WINDSOCK = { x: RUNWAY.width / 2 + 14, z: RUNWAY.z - RUNWAY.length / 2 + 12 };

// Shallow water near a beach reads turquoise, deep water reads navy.
export function seaColour(x, z) {
  let nearest = 1e9;
  for (const isle of ISLANDS) {
    const d = Math.hypot(x - isle.x, z - isle.z) - isle.r;
    if (d < nearest) nearest = d;
  }
  const t = clamp(nearest / 260, 0, 1);
  const r = Math.round(38 + t * 8);
  const g = Math.round(168 - t * 92);
  const b = Math.round(190 - t * 78);
  return `rgb(${r},${g},${b})`;
}

// Where each mission starts the aircraft: { x, alt, z, heading, speedKt }.
export const SPAWNS = {
  rings: { x: 0, alt: 55, z: 60, heading: 0, speedKt: 105, throttle: 0.66 },
  landing: { x: 0, alt: 95, z: -260, heading: 0, speedKt: 96, throttle: 0.42 },
  slalom: { x: -420, alt: 42, z: 300, heading: 2.03, speedKt: 118, throttle: 0.78 },
  free: { x: 0, alt: 120, z: 100, heading: 0.4, speedKt: 120, throttle: 0.7 },
};

