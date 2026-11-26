// hud.js — everything drawn over the world: the instrument panel, the
// compass tape, the mission readouts and the menus. One clear job: make the
// aircraft's state readable at a glance, and make the game explain itself
// without a manual. All instruments are drawn live from the flight model.

import { aircraftReadout, groundDistance, groundBearing } from './aircraft.js';

const PANEL_BG = 'rgba(8, 18, 28, 0.82)';
const PANEL_LINE = '#2e4a5e';
const INK = '#d7ecf7';
const AMBER = '#ffd23f';
const GREEN = '#5ee08a';
const RED = '#ff5a4e';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL_BG;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = PANEL_LINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// --- Compass tape across the top ------------------------------------------
export function drawCompassTape(ctx, w, headingDeg) {
  const y = 14;
  const cx = w / 2;
  ctx.fillStyle = 'rgba(8, 18, 28, 0.6)';
  ctx.fillRect(0, 0, w, 44);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pxPerDeg = 4.2;
  const labels = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
  for (let d = -40; d <= 400; d += 5) {
    const rel = ((d - headingDeg + 540) % 360) - 180;
    if (Math.abs(rel) > 52) continue;
    const x = cx + rel * pxPerDeg;
    const major = d % 45 === 0;
    ctx.strokeStyle = major ? INK : 'rgba(215,236,247,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 26);
    ctx.lineTo(x, y + (major ? 12 : 19));
    ctx.stroke();
    const label = labels.find(([deg]) => deg === ((d % 360) + 360) % 360);
    if (label) {
      ctx.fillStyle = INK;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(label[1], x, y + 6);
    }
  }
  // Fixed lubber line and the digital heading.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx - 7, y + 2);
  ctx.lineTo(cx + 7, y + 2);
  ctx.lineTo(cx, y + 11);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = AMBER;
  ctx.fillText(String(Math.round(headingDeg)).padStart(3, '0') + '°', cx, y + 34);
}

// --- Top-left mission readout ----------------------------------------------
export function drawMissionPanel(ctx, mission, readout, elapsedSec) {
  const x = 14, y = 54;
  panel(ctx, x, y, 300, 96);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(mission.title.toUpperCase(), x + 12, y + 22);
  ctx.fillStyle = INK;
  ctx.font = '13px sans-serif';
  ctx.fillText(mission.objectiveLine, x + 12, y + 44);
  ctx.fillStyle = '#9fc6da';
  ctx.font = '13px sans-serif';
  const clock = formatClock(elapsedSec);
  ctx.fillText(`TIME ${clock}`, x + 12, y + 66);
  ctx.fillText(`SCORE ${mission.score}`, x + 150, y + 66);
  ctx.fillStyle = mission.fuelWarning ? RED : '#9fc6da';
  ctx.fillText(`FUEL ${readout.fuelPct}%`, x + 12, y + 86);
  ctx.fillStyle = readout.damagePct > 50 ? RED : '#9fc6da';
  ctx.fillText(`HULL ${100 - readout.damagePct}%`, x + 150, y + 86);
}

export function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Objective arrow: points the pilot at the next ring / gate / runway ---
export function drawObjectiveArrow(ctx, w, h, ac, target, label) {
  if (!target) return;
  const dist = groundDistance(ac.x, ac.z, target.x, target.z);
  const bearing = groundBearing(ac.x, ac.z, target.x, target.z);
  const headingDeg = ((ac.heading * 180) / Math.PI % 360 + 360) % 360;
  let rel = ((bearing - headingDeg + 540) % 360) - 180;
  const cx = w / 2;
  const y = h * 0.30;
  const x = cx + Math.max(-w * 0.32, Math.min(w * 0.32, rel * 3.2));
  const pulse = 0.75 + Math.sin(performance.now() / 280) * 0.25;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.translate(x, y);
  ctx.rotate((rel * Math.PI) / 180 * 0.55);
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(11, 8);
  ctx.lineTo(0, 3);
  ctx.lineTo(-11, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = AMBER;
  const distText = dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
  ctx.fillText(`${label}  •  ${distText}`, x, y + 30);
}

// --- The instrument panel along the bottom ---------------------------------
export function drawInstrumentPanel(ctx, w, h, ac) {
  const r = aircraftReadout(ac);
  const panelH = 118;
  const y = h - panelH - 10;
  panel(ctx, 10, y, w - 20, panelH);
  const cx = w / 2;

  // Attitude indicator (artificial horizon), centre-left.
  drawAttitude(ctx, cx - 190, y + panelH / 2, 44, ac);
  // Airspeed dial.
  drawDial(ctx, cx - 80, y + panelH / 2, 44, r.speedKt, 0, 200, 'KT', 'AIRSPEED', r.speedKt > 165 ? RED : INK);
  // Altimeter dial.
  drawDial(ctx, cx + 30, y + panelH / 2, 44, r.altitudeFt, 0, 2000, 'FT', 'ALTITUDE', INK);
  // Vertical speed tape, right of the altimeter.
  drawVsi(ctx, cx + 92, y + 16, 14, 86, r.verticalSpeedFpm);

  // Throttle lever, far left.
  drawThrottle(ctx, 34, y + 12, 22, panelH - 24, r.throttlePct, r.engineOut);
  // Fuel and hull bars, far right.
  drawBar(ctx, w - 190, y + 18, 150, 14, r.fuelPct / 100, r.fuelPct < 25 ? RED : GREEN, 'FUEL');
  drawBar(ctx, w - 190, y + 48, 150, 14, (100 - r.damagePct) / 100, r.damagePct > 50 ? RED : GREEN, 'HULL');
  ctx.textAlign = 'left';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#9fc6da';
  ctx.fillText(ac.flaps > 0 ? 'FLAPS DOWN' : 'FLAPS UP', w - 190, y + 84);
  ctx.fillText(ac.gearDown ? 'GEAR DOWN' : 'GEAR UP', w - 190, y + 104);

  // Warnings.
  if (r.stalled) drawWarning(ctx, w, y - 34, 'STALL — NOSE DOWN, POWER UP');
  else if (r.engineOut) drawWarning(ctx, w, y - 34, 'FUEL EMPTY — GLIDING');
  else if (r.altitudeFt < 120 && !r.onGround) drawWarning(ctx, w, y - 34, 'LOW ALTITUDE');
}

function drawWarning(ctx, w, y, text) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 17px sans-serif';
  const tw = ctx.measureText(text).width + 28;
  ctx.fillStyle = 'rgba(120, 10, 5, 0.85)';
  roundRect(ctx, w / 2 - tw / 2, y, tw, 28, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd9d4';
  ctx.fillText(text, w / 2, y + 19);
}

// Attitude indicator: sky/ground disc that rolls and pitches with the plane.
function drawAttitude(ctx, cx, cy, rad, ac) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-ac.roll);
  ctx.translate(0, ac.pitch * rad * 1.4);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-rad, -rad * 2, rad * 2, rad * 2);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(-rad, 0, rad * 2, rad * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-rad, 0);
  ctx.lineTo(rad, 0);
  ctx.stroke();
  ctx.restore();
  // Fixed wings of the symbol, and the bezel.
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - rad + 6, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + rad - 6, cy);
  ctx.stroke();
  ctx.strokeStyle = PANEL_LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#9fc6da';
  ctx.fillText('ATTITUDE', cx, cy + rad + 12);
}

// A round dial with a needle and a label.
function drawDial(ctx, cx, cy, rad, value, min, max, unit, label, needleColour) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1c28';
  ctx.fill();
  ctx.strokeStyle = PANEL_LINE;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Ticks.
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    const major = i % 5 === 0;
    ctx.strokeStyle = major ? INK : 'rgba(215,236,247,0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (rad - (major ? 9 : 6)), cy + Math.sin(a) * (rad - (major ? 9 : 6)));
    ctx.lineTo(cx + Math.cos(a) * (rad - 2), cy + Math.sin(a) * (rad - 2));
    ctx.stroke();
  }
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const a = Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.strokeStyle = needleColour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * (rad - 8), cy + Math.sin(a) * (rad - 8));
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  // Digital value inside the dial, below the hub: never collides with the
  // label underneath the bezel.
  ctx.fillStyle = INK;
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(value)), cx, cy + rad * 0.62);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#9fc6da';
  ctx.fillText(`${label} ${unit}`, cx, cy + rad + 12);
}

// Vertical speed: a small tape with a marker that slides up and down.
function drawVsi(ctx, x, y, w, h, vsFpm) {
  ctx.fillStyle = '#0d1c28';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PANEL_LINE;
  ctx.strokeRect(x, y, w, h);
  const frac = Math.max(-1, Math.min(1, vsFpm / 1200));
  const my = y + h / 2 - frac * (h / 2 - 4);
  ctx.fillStyle = vsFpm < -800 ? RED : GREEN;
  ctx.fillRect(x + 2, my - 3, w - 4, 6);
  ctx.fillStyle = '#9fc6da';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('V/S', x + w / 2, y + h + 11);
}

function drawThrottle(ctx, x, y, w, h, pct, engineOut) {
  ctx.fillStyle = '#0d1c28';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PANEL_LINE;
  ctx.strokeRect(x, y, w, h);
  const fillH = (h - 6) * (pct / 100);
  ctx.fillStyle = engineOut ? RED : '#4db2e8';
  ctx.fillRect(x + 3, y + h - 3 - fillH, w - 6, fillH);
  ctx.fillStyle = '#9fc6da';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THR', x + w / 2, y + h + 12);
  ctx.fillText(`${pct}%`, x + w / 2, y - 5);
}

function drawBar(ctx, x, y, w, h, frac, colour, label) {
  ctx.fillStyle = '#0d1c28';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, Math.max(0, w * frac), h);
  ctx.strokeStyle = PANEL_LINE;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = INK;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${label} ${Math.round(frac * 100)}%`, x, y - 5);
}

// --- Screens ---------------------------------------------------------------
// Title + mission select. `selected` is the highlighted mission index.
export function drawMenu(ctx, w, h, missions, selected) {
  ctx.fillStyle = 'rgba(4, 12, 20, 0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7f0dc';
  ctx.font = 'bold 54px Georgia, serif';
  ctx.fillText('SKYLINE COURIER', w / 2, h * 0.20);
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText('ARCHIPELAGO AIR SERVICE  •  KESTREL FIELD', w / 2, h * 0.20 + 34);
  ctx.fillStyle = INK;
  ctx.font = '15px sans-serif';
  ctx.fillText('Fly the mail, the medicine and the mangoes between the islands.', w / 2, h * 0.20 + 62);

  const cardW = 300, cardH = 132, gap = 22;
  const totalW = missions.length * cardW + (missions.length - 1) * gap;
  const x0 = (w - totalW) / 2;
  const y0 = h * 0.38;
  missions.forEach((m, i) => {
    const x = x0 + i * (cardW + gap);
    const hot = i === selected;
    ctx.fillStyle = hot ? 'rgba(255,210,63,0.16)' : PANEL_BG;
    roundRect(ctx, x, y0, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = hot ? AMBER : PANEL_LINE;
    ctx.lineWidth = hot ? 2.5 : 1.5;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = hot ? AMBER : INK;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${i + 1}. ${m.title}`, x + 16, y0 + 30);
    ctx.fillStyle = '#c8deeb';
    ctx.font = '13px sans-serif';
    wrapText(ctx, m.brief, x + 16, y0 + 54, cardW - 32, 18);
    ctx.fillStyle = '#9fc6da';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(m.rewardLine, x + 16, y0 + cardH - 14);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = '14px sans-serif';
  ctx.fillText('Click a mission or press 1–4, then ENTER to fly.  Mouse steers too.', w / 2, y0 + cardH + 34);
  ctx.fillStyle = '#9fc6da';
  ctx.font = '13px sans-serif';
  ctx.fillText('W/S throttle  •  Arrow keys or A/D pitch & bank  •  F flaps  •  B brake  •  P pause  •  R reset', w / 2, y0 + cardH + 58);
  ctx.fillText('Fly clean: smooth throttle and gentle banks keep the Kestrel fast and the fuel in the tanks.', w / 2, y0 + cardH + 80);
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

// Debrief after a mission ends: headline, scored lines and the next step.
export function drawDebrief(ctx, w, h, result) {
  ctx.fillStyle = 'rgba(4, 12, 20, 0.62)';
  ctx.fillRect(0, 0, w, h);
  const bw = 520, bh = 300;
  const x = (w - bw) / 2, y = (h - bh) / 2;
  panel(ctx, x, y, bw, bh);
  ctx.textAlign = 'center';
  ctx.fillStyle = result.success ? GREEN : RED;
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText(result.headline, w / 2, y + 52);
  ctx.fillStyle = INK;
  ctx.font = '15px sans-serif';
  result.lines.forEach((line, i) => {
    ctx.fillText(line, w / 2, y + 92 + i * 26);
  });
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`SCORE  ${result.score}`, w / 2, y + bh - 64);
  ctx.fillStyle = '#9fc6da';
  ctx.font = '13px sans-serif';
  ctx.fillText('ENTER — fly again    •    M — mission menu    •    R — reset', w / 2, y + bh - 32);
}

// A short-lived toast near the top of the screen (ring passed, etc.).
export function drawToast(ctx, w, toast) {
  if (!toast || toast.until < performance.now()) return;
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px sans-serif';
  const tw = ctx.measureText(toast.text).width + 36;
  ctx.fillStyle = 'rgba(8, 18, 28, 0.85)';
  roundRect(ctx, w / 2 - tw / 2, 168, tw, 40, 8);
  ctx.fill();
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = toast.colour || AMBER;
  ctx.fillText(toast.text, w / 2, 195);
}

// Paused overlay.
export function drawPaused(ctx, w, h) {
  ctx.fillStyle = 'rgba(4, 12, 20, 0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = 'bold 40px Georgia, serif';
  ctx.fillText('PAUSED', w / 2, h / 2 - 10);
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#9fc6da';
  ctx.fillText('P to resume  •  M for the mission menu', w / 2, h / 2 + 24);
}

