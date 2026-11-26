// render.js — everything the pilot sees. One clear job: take the aircraft,
// the terrain and the mission markers and paint one chase-view frame on the
// canvas, with a software 3D projection (no library, no WebGL): the camera
// sits behind the aircraft, the world is projected onto the screen, and
// terrain is drawn far-to-near so nearer ground covers farther ground.

import { terrainHeightAt, groundColour, seaColour, RUNWAY, RINGS, SLALOM_GATES, TREES, CLOUDS, WINDSOCK } from './terrain.js';

const GRID_STEP = 46;        // terrain mesh spacing, metres
const VIEW_AHEAD = 2200;     // how far ahead of the aircraft we draw
const VIEW_SIDE = 1050;      // how far to each side we draw
const VIEW_BEHIND = 320;     // how far behind we draw (for steep banks)

// A camera frame: position plus the forward/right/up basis vectors.
export function makeCamera() {
  return { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
}

// Chase the aircraft: sit behind and above it, look a little ahead of it.
export function updateCamera(cam, ac, dt) {
  const fx = Math.sin(ac.heading);
  const fz = Math.cos(ac.heading);
  const tx = ac.x - fx * 40;
  const ty = ac.y + 13 - ac.pitch * 18;
  const tz = ac.z - fz * 40;
  const k = Math.min(1, dt * 5);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.z += (tz - cam.z) * k;
  // Look at a point ahead of the nose, slightly below the horizon line.
  const lx = ac.x + fx * 90;
  const ly = ac.y - 4 + ac.pitch * 30;
  const lz = ac.z + fz * 90;
  let vx = lx - cam.x, vy = ly - cam.y, vz = lz - cam.z;
  const len = Math.hypot(vx, vy, vz) || 1;
  cam.fx = vx / len; cam.fy = vy / len; cam.fz = vz / len;
  // Right = forward x world-up, normalised; up = forward x right.
  let rx = cam.fz, ry = 0, rz = -cam.fx;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  cam.rx = rx / rlen; cam.ry = 0; cam.rz = rz / rlen;
  cam.ux = cam.fy * cam.rz - cam.fz * cam.ry;
  cam.uy = cam.fz * cam.rx - cam.fx * cam.rz;
  cam.uz = cam.fx * cam.ry - cam.fy * cam.rx;
}

// Project a world point to screen space. Returns null behind the camera.
export function project(cam, px, py, pz, w, h) {
  const dx = px - cam.x, dy = py - cam.y, dz = pz - cam.z;
  const zc = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  if (zc < 2) return null;
  const xc = dx * cam.rx + dy * cam.ry + dz * cam.rz;
  const yc = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  const focal = (h * 0.5) / Math.tan((68 * Math.PI) / 360);
  return {
    x: w / 2 + (xc / zc) * focal,
    y: h * 0.52 - (yc / zc) * focal,
    depth: zc,
    scale: focal / zc,
  };
}

export function drawSky(ctx, w, h, cam, timeSec) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2f6fb4');
  g.addColorStop(0.42, '#7fb6dd');
  g.addColorStop(0.55, '#cfe8f2');
  g.addColorStop(0.56, '#bfe0ea');
  g.addColorStop(1, '#0e4d7a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Low sun, upper right, with a soft halo — kept clear of the mission panel.
  const sx = w * 0.8, sy = h * 0.16;
  const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, 150);
  halo.addColorStop(0, 'rgba(255,244,200,0.95)');
  halo.addColorStop(0.25, 'rgba(255,226,140,0.55)');
  halo.addColorStop(1, 'rgba(255,226,140,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sx - 160, sy - 160, 320, 320);
  ctx.fillStyle = '#fff7d0';
  ctx.beginPath();
  ctx.arc(sx, sy, 26, 0, Math.PI * 2);
  ctx.fill();
  void timeSec;
}

export function drawSea(ctx, w, h, cam, ac) {
  // The sea is one big quad laid out around the camera's forward axis, so it
  // covers the water whichever way the aircraft is heading.
  const fwd = 1500, side = 2800, back = 500;
  const cx = cam.x + cam.fx * (fwd - back) / 2;
  const cz = cam.z + cam.fz * (fwd - back) / 2;
  const corners = [
    [cx - cam.rx * side + cam.fx * fwd, 0, cz - cam.rz * side + cam.fz * fwd],
    [cx + cam.rx * side + cam.fx * fwd, 0, cz + cam.rz * side + cam.fz * fwd],
    [cx + cam.rx * side - cam.fx * back, 0, cz + cam.rz * side - cam.fz * back],
    [cx - cam.rx * side - cam.fx * back, 0, cz - cam.rz * side - cam.fz * back],
  ];
  const pts = corners.map(([x, y, z]) => project(cam, x, y, z, w, h));
  if (pts.some((p) => p === null)) {
    // Camera low over the water: fall back to a flat horizon band.
    ctx.fillStyle = '#2f7fb8';
    ctx.fillRect(0, h * 0.52, w, h * 0.48);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = seaColour(ac.x, ac.z + 900);
  ctx.fill();
  // Sun glitter: a few bright dashes on the water ahead.
  ctx.fillStyle = 'rgba(255,255,220,0.35)';
  for (let i = 0; i < 14; i++) {
    const gx = ac.x + Math.sin(i * 2.399) * 420;
    const gz = ac.z + 500 + (i % 5) * 260;
    const p = project(cam, gx, 0.4, gz, w, h);
    if (!p) continue;
    const s = Math.max(1, 26 / p.depth * 40);
    ctx.fillRect(p.x - s, p.y, s * 2.4, 1.6);
  }
}

// Draw the terrain as a grid of quads, far rows first so near ground wins.
export function drawTerrain(ctx, w, h, cam, ac) {
  const fx = Math.sin(ac.heading), fz = Math.cos(ac.heading);
  const cx = ac.x + fx * (VIEW_AHEAD - VIEW_BEHIND) / 2;
  const cz = ac.z + fz * (VIEW_AHEAD - VIEW_BEHIND) / 2;
  const x0 = Math.floor((cx - VIEW_SIDE) / GRID_STEP) * GRID_STEP;
  const z0 = Math.floor((cz - VIEW_BEHIND) / GRID_STEP) * GRID_STEP;
  const nx = Math.ceil((VIEW_SIDE * 2) / GRID_STEP);
  const nz = Math.ceil((VIEW_AHEAD + VIEW_BEHIND) / GRID_STEP);
  // Walk rows from far to near relative to the camera.
  const rows = [];
  for (let j = 0; j < nz; j++) rows.push(j);
  rows.sort((a, b) => {
    const za = z0 + a * GRID_STEP, zb = z0 + b * GRID_STEP;
    const da = (za - cam.z) * cam.fz + (cx - cam.x) * cam.fx;
    const db = (zb - cam.z) * cam.fz + (cx - cam.x) * cam.fx;
    return db - da;
  });
  for (const j of rows) {
    const z = z0 + j * GRID_STEP;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * GRID_STEP;
      const h00 = terrainHeightAt(x, z);
      const h10 = terrainHeightAt(x + GRID_STEP, z);
      const h01 = terrainHeightAt(x, z + GRID_STEP);
      const h11 = terrainHeightAt(x + GRID_STEP, z + GRID_STEP);
      if (h00 <= 0.05 && h10 <= 0.05 && h01 <= 0.05 && h11 <= 0.05) continue;
      const p00 = project(cam, x, h00, z, w, h);
      const p10 = project(cam, x + GRID_STEP, h10, z, w, h);
      const p11 = project(cam, x + GRID_STEP, h11, z + GRID_STEP, w, h);
      const p01 = project(cam, x, h01, z + GRID_STEP, w, h);
      if (!p00 || !p10 || !p11 || !p01) continue;
      const avg = (h00 + h10 + h01 + h11) / 4;
      ctx.fillStyle = groundColour(avg, x + GRID_STEP / 2, z + GRID_STEP / 2);
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// The runway: dark asphalt, white threshold bars and a dashed centreline.
export function drawRunway(ctx, w, h, cam) {
  const r = RUNWAY;
  const y = r.elevation + 0.4;
  const hw = r.width / 2, hl = r.length / 2;
  const c = [
    project(cam, r.x - hw, y, r.z - hl, w, h),
    project(cam, r.x + hw, y, r.z - hl, w, h),
    project(cam, r.x + hw, y, r.z + hl, w, h),
    project(cam, r.x - hw, y, r.z + hl, w, h),
  ];
  if (c.some((p) => p === null)) return;
  ctx.fillStyle = '#3a3f46';
  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes, every 40 m.
  ctx.fillStyle = '#f5f2e8';
  for (let d = -hl + 20; d < hl - 10; d += 40) {
    const a = project(cam, r.x - 1.2, y + 0.1, r.z + d, w, h);
    const b = project(cam, r.x + 1.2, y + 0.1, r.z + d + 18, w, h);
    if (!a || !b) continue;
    ctx.fillRect(a.x, a.y, Math.max(1.5, b.x - a.x + 2), Math.max(1.5, b.y - a.y));
  }
  // Threshold bars at both ends.
  for (const end of [-hl + 8, hl - 14]) {
    const a = project(cam, r.x - hw + 3, y + 0.1, r.z + end, w, h);
    const b = project(cam, r.x + hw - 3, y + 0.1, r.z + end + 6, w, h);
    if (!a || !b) continue;
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.max(2, Math.abs(b.y - a.y) + 2));
  }
  drawWindsock(ctx, w, h, cam);
}

function drawWindsock(ctx, w, h, cam) {
  const base = project(cam, WINDSOCK.x, terrainHeightAt(WINDSOCK.x, WINDSOCK.z), WINDSOCK.z, w, h);
  const top = project(cam, WINDSOCK.x, terrainHeightAt(WINDSOCK.x, WINDSOCK.z) + 9, WINDSOCK.z, w, h);
  if (!base || !top) return;
  ctx.strokeStyle = '#e8e4d8';
  ctx.lineWidth = Math.max(1, top.scale * 0.4);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  // Orange cone pointing downwind.
  const tip = project(cam, WINDSOCK.x + 6, terrainHeightAt(WINDSOCK.x, WINDSOCK.z) + 8, WINDSOCK.z + 2, w, h);
  if (!tip) return;
  ctx.fillStyle = '#ff7a2f';
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(tip.x, tip.y - 2);
  ctx.lineTo(tip.x, tip.y + 2);
  ctx.closePath();
  ctx.fill();
}

// A glowing ring, drawn as a projected circle; the next target pulses.
export function drawRing(ctx, w, h, cam, ring, isNext, timeSec) {
  const pulse = isNext ? 1 + Math.sin(timeSec * 4) * 0.12 : 1;
  const rr = ring.r * pulse;
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const p = project(cam, ring.x + Math.cos(a) * rr, ring.y + Math.sin(a) * rr, ring.z, w, h);
    if (p) pts.push(p);
  }
  if (pts.length < 4) return;
  ctx.strokeStyle = isNext ? '#ffd23f' : '#7fe3ff';
  ctx.lineWidth = isNext ? 5 : 3;
  ctx.shadowColor = isNext ? '#ffd23f' : '#7fe3ff';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // A small floating label above the next ring.
  if (isNext) {
    const label = project(cam, ring.x, ring.y + rr + 8, ring.z, w, h);
    if (label) {
      ctx.font = `bold ${Math.max(12, Math.round(label.scale * 2.4))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(ring.name.toUpperCase(), label.x, label.y);
    }
  }
}

// Slalom gates: two orange buoys with a flag line between them.
export function drawSlalomGate(ctx, w, h, cam, gate, isNext) {
  const half = gate.gap / 2;
  for (const side of [-1, 1]) {
    const bx = gate.x + side * half;
    const top = project(cam, bx, 7, gate.z, w, h);
    const base = project(cam, bx, 0.5, gate.z, w, h);
    if (!top || !base) continue;
    ctx.fillStyle = isNext ? '#ff7a2f' : '#e85d3d';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, Math.max(2, base.scale * 2.2), Math.max(2, base.scale * 1.1), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.fillStyle = isNext ? '#ffd23f' : '#ffb37a';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(top.x + Math.max(3, top.scale * 3), top.y + 3);
    ctx.lineTo(top.x, top.y + 6);
    ctx.closePath();
    ctx.fill();
  }
}

// Palm trees: a trunk line and a star of fronds, drawn small and cheap.
export function drawTrees(ctx, w, h, cam, ac) {
  for (const t of TREES) {
    const dx = t.x - ac.x, dz = t.z - ac.z;
    if (dx * dx + dz * dz > 900 * 900) continue;
    const base = project(cam, t.x, t.h, t.z, w, h);
    const top = project(cam, t.x, t.h + t.s * 1.6, t.z, w, h);
    if (!base || !top) continue;
    ctx.strokeStyle = '#6b4a2f';
    ctx.lineWidth = Math.max(1, base.scale * 0.5);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.fillStyle = '#2f7d3a';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const ex = top.x + Math.cos(a) * top.scale * 1.6;
      const ey = top.y + Math.sin(a) * top.scale * 0.7 + top.scale * 0.5;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(ex, ey);
      ctx.lineTo(top.x + Math.cos(a + 0.5) * top.scale * 0.8, top.y + top.scale * 0.9);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Clouds: soft white ellipse clusters, drifting slowly with time.
export function drawClouds(ctx, w, h, cam, timeSec) {
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  for (const c of CLOUDS) {
    const cx = c.x + Math.sin(timeSec * 0.01 + c.z) * 20;
    const p = project(cam, cx, c.y, c.z, w, h);
    if (!p || p.depth < 30) continue;
    const s = p.scale * c.s * 0.09;
    if (s < 2) continue;
    for (const [ox, oy, r] of [[-1.4, 0.1, 0.55], [0, -0.25, 0.7], [1.3, 0.15, 0.5], [0.4, 0.3, 0.45]]) {
      ctx.beginPath();
      ctx.ellipse(p.x + ox * s, p.y + oy * s, r * s, r * s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// The Kestrel, drawn from behind and slightly above, banking with the roll.
// A hand-drawn vector twin-prop: cream fuselage, teal wings, orange trim.
export function drawAircraft(ctx, w, h, ac, timeSec) {
  const cx = w / 2;
  const cy = h * 0.66;
  const S = Math.min(w, h) / 620; // scale with the window
  const bank = ac.roll;
  const bob = Math.sin(timeSec * 1.7) * 2 * S;
  const shakeX = (Math.random() - 0.5) * ac.shake * 6;
  const shakeY = (Math.random() - 0.5) * ac.shake * 4;

  ctx.save();
  ctx.translate(cx + shakeX, cy + bob + shakeY);
  ctx.rotate(bank * 0.9);

  // Tailplane.
  ctx.fillStyle = '#1d7a6b';
  ctx.beginPath();
  ctx.moveTo(-58 * S, -6 * S);
  ctx.lineTo(-30 * S, -26 * S);
  ctx.lineTo(-22 * S, -26 * S);
  ctx.lineTo(-14 * S, -6 * S);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(58 * S, -6 * S);
  ctx.lineTo(30 * S, -26 * S);
  ctx.lineTo(22 * S, -26 * S);
  ctx.lineTo(14 * S, -6 * S);
  ctx.closePath();
  ctx.fill();

  // Main wings, swept slightly back, with orange tips.
  ctx.fillStyle = '#1d7a6b';
  ctx.beginPath();
  ctx.moveTo(-14 * S, 4 * S);
  ctx.lineTo(-150 * S, 26 * S);
  ctx.lineTo(-150 * S, 40 * S);
  ctx.lineTo(-10 * S, 26 * S);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14 * S, 4 * S);
  ctx.lineTo(150 * S, 26 * S);
  ctx.lineTo(150 * S, 40 * S);
  ctx.lineTo(10 * S, 26 * S);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff7a2f';
  ctx.fillRect(-150 * S, 26 * S, 14 * S, 14 * S);
  ctx.fillRect(136 * S, 26 * S, 14 * S, 14 * S);

  // Fuselage: cream body, teal cheatline, orange tail band.
  ctx.fillStyle = '#f7f0dc';
  ctx.beginPath();
  ctx.moveTo(0, -58 * S);
  ctx.quadraticCurveTo(20 * S, -52 * S, 22 * S, -18 * S);
  ctx.lineTo(20 * S, 34 * S);
  ctx.quadraticCurveTo(18 * S, 52 * S, 0, 56 * S);
  ctx.quadraticCurveTo(-18 * S, 52 * S, -20 * S, 34 * S);
  ctx.lineTo(-22 * S, -18 * S);
  ctx.quadraticCurveTo(-20 * S, -52 * S, 0, -58 * S);
  ctx.fill();
  ctx.fillStyle = '#1d7a6b';
  ctx.fillRect(-20 * S, -8 * S, 40 * S, 7 * S);
  ctx.fillStyle = '#ff7a2f';
  ctx.fillRect(-21 * S, -34 * S, 42 * S, 6 * S);

  // Cockpit windows, lit amber.
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.ellipse(0, -40 * S, 10 * S, 8 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,60,90,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, -40 * S, 7 * S, 5 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  // Twin engines on the wings, with spinning prop discs.
  for (const side of [-1, 1]) {
    const ex = side * 62 * S, ey = 12 * S;
    ctx.fillStyle = '#e8dfc8';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 12 * S, 9 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const pa = ac.propAngle + (side > 0 ? Math.PI / 2 : 0);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(pa);
    ctx.fillStyle = 'rgba(40,40,40,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.5 * S, 20 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ff7a2f';
    ctx.beginPath();
    ctx.arc(ex, ey, 3 * S, 0, Math.PI * 2);
    ctx.fill();
  }

  // Navigation lights: red left, green right, blinking white tail.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-150 * S, 33 * S, 3.5 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#35d461';
  ctx.beginPath();
  ctx.arc(150 * S, 33 * S, 3.5 * S, 0, Math.PI * 2);
  ctx.fill();
  if (Math.floor(timeSec * 1.4) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -58 * S, 3 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// One whole frame: sky, sea, terrain, landmarks, then the aircraft.
export function drawScene(ctx, w, h, cam, ac, missionView, timeSec) {
  drawSky(ctx, w, h, cam, timeSec);
  drawClouds(ctx, w, h, cam, timeSec);
  drawSea(ctx, w, h, cam, ac);
  drawTerrain(ctx, w, h, cam, ac);
  drawRunway(ctx, w, h, cam);
  drawTrees(ctx, w, h, cam, ac);
  if (missionView.rings) {
    missionView.rings.forEach((ring, i) => {
      drawRing(ctx, w, h, cam, ring, i === missionView.nextIndex, timeSec);
    });
  }
  if (missionView.gates) {
    missionView.gates.forEach((gate, i) => {
      drawSlalomGate(ctx, w, h, cam, gate, i === missionView.nextIndex);
    });
  }
  if (missionView.target) {
    const t = missionView.target;
    const p = project(cam, t.x, t.y, t.z, w, h);
    if (p) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(8, p.scale * 4), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  drawAircraft(ctx, w, h, ac, timeSec);
}


