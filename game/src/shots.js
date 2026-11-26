// shots.js — staged states for the screenshots. One clear job: when the
// page is opened with ?shot=N, put the game into a chosen moment (a ring
// ahead, final approach, low slalom, wheels on the runway) so the screenshots
// show the game at its best. These are real states of the real game: the
// autopilot holds the aircraft steady and the player can take over at any
// moment by touching the controls. Normal play never passes ?shot=, so the
// menu is what a player sees first.

import { createAircraft } from './aircraft.js';
import { createMission, MISSIONS } from './missions.js';
import { terrainHeightAt, RUNWAY } from './terrain.js';

// Returns null when no ?shot= param is present.
export function shotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const n = Number.parseInt(params.get('shot') || '', 10);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

// Build the whole game state for shot N, in the same shape main.js uses.
export function stageShot(n) {
  if (n === 1) return stageRingRun();
  if (n === 2) return stageFinalApproach();
  if (n === 3) return stageSlalom();
  return stageLanded();
}

// Shot 1 (cover): Emerald Ring Run, the next ring glowing dead ahead over
// Palm Cay, sun on the sea, runway island behind.
function stageRingRun() {
  const mission = createMission(MISSIONS[0]);
  mission.nextIndex = 1; // one ring already threaded
  mission.ringsPassed = 1;
  mission.score = 250;
  mission.elapsed = 47.3;
  // Parked on the line to ring 2 (Palm Arch, -260/520): heading due north,
  // far enough back that the screenshot catches it still ahead, glowing,
  // and 30 m left of the line so the ring shows clear of the aircraft.
  const ac = createAircraft({ x: -290, alt: 66, z: 100, heading: 0.05, speedKt: 118, throttle: 0.72 });
  ac.pitch = 0.02;
  ac.roll = -0.12;
  return { screen: 'flying', mission, ac, autopilot: true, toast: { text: 'RING 1 OF 8 — NICE FLYING', until: performance.now() + 9000, colour: '#ffd23f' } };
}

// Shot 2: Runway Return on final approach — the runway fills the view,
// flaps down, gear down, low over the threshold.
function stageFinalApproach() {
  const mission = createMission(MISSIONS[1]);
  mission.elapsed = 61.8;
  const ac = createAircraft({ x: 6, alt: 34, z: 60, heading: 0.02, speedKt: 82, throttle: 0.38 });
  ac.pitch = -0.06;
  ac.flaps = 1;
  ac.gearDown = true;
  return { screen: 'flying', mission, ac, autopilot: true, toast: null };
}

// Shot 3: Buoy Slalom, low over the water between two islands, gate ahead.
function stageSlalom() {
  const mission = createMission(MISSIONS[2]);
  mission.nextIndex = 2;
  mission.gatesPassed = 2;
  mission.score = 400;
  mission.elapsed = 33.6;
  // Parked on the line to gate 3 (520/-160), 410 m out: the screenshot
  // catches the gate still ahead, its buoys spread wide across the view.
  const ac = createAircraft({ x: 260, alt: 30, z: 160, heading: 2.46, speedKt: 138, throttle: 0.85 });
  ac.pitch = 0.0;
  ac.roll = 0.18;
  return { screen: 'flying', mission, ac, autopilot: true, toast: { text: 'GATE 2 OF 10 — STAY LOW', until: performance.now() + 9000, colour: '#ffd23f' } };
}

// Shot 4: wheels on the runway after a good landing — the debrief card.
function stageLanded() {
  const mission = createMission(MISSIONS[1]);
  mission.elapsed = 96.4;
  mission.score = 2430;
  mission.done = true;
  mission.success = true;
  mission.headline = 'WELCOME HOME';
  mission.resultLines = [
    'Touchdown -180 ft/min at 68 kt.',
    'Landing quality 92/100.',
    'Fuel left: 61%.',
  ];
  const ground = terrainHeightAt(0, RUNWAY.z);
  const ac = createAircraft({ x: 0, alt: ground + 1.6, z: 620, heading: 0, speedKt: 24, throttle: 0.1 });
  ac.onGround = true;
  return { screen: 'debrief', mission, ac, autopilot: false, toast: null };
}
