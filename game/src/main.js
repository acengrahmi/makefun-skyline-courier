// main.js — the game loop and the glue. One clear job: own the screens
// (menu / flying / paused / debrief), step the flight model and the mission
// once a frame, and hand the world to the renderer and the HUD. Everything
// else lives in its own file: aircraft.js flies, terrain.js grounds,
// render.js paints, hud.js explains, missions.js scores, input.js listens,
// audio.js sings, shots.js stages.

import { createAircraft, stepAircraft, resetAircraft, aircraftReadout } from './aircraft.js';
import { terrainHeightAt } from './terrain.js';
import { makeCamera, updateCamera, drawScene } from './render.js';
import {
  drawCompassTape, drawMissionPanel, drawObjectiveArrow,
  drawInstrumentPanel, drawMenu, drawDebrief, drawToast, drawPaused,
} from './hud.js';
import { MISSIONS, createMission, missionView, missionTarget, stepMission, missionResult, saveBest } from './missions.js';
import { createInput, attachInput, readFrame, mouseSteering, missionCardAt } from './input.js';
import {
  createAudio, ensureAudio, updateFlightAudio,
  playRingChime, playGateTick, playTooHighBuzz, playSuccessFanfare,
  playCrashThud, playLandingChime, playClick, playStallWarble,
} from './audio.js';
import { shotFromUrl, stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const input = createInput();
attachInput(input, canvas);
const audio = createAudio();
const cam = makeCamera();

const game = {
  screen: 'menu',        // menu | flying | paused | debrief
  selected: 0,           // highlighted mission on the menu
  mission: null,
  ac: null,
  autopilot: false,      // staged screenshots hold the aircraft steady
  toast: null,
  result: null,
  timeSec: 0,
  lastFrame: performance.now(),
};

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// A staged screenshot (?shot=N) skips the menu entirely.
const staged = shotFromUrl();
if (staged) {
  const s = stageShot(staged);
  game.screen = s.screen;
  game.mission = s.mission;
  game.ac = s.ac;
  game.autopilot = s.autopilot;
  game.toast = s.toast;
  if (s.screen === 'debrief') game.result = missionResult(s.mission);
}

function startMission(index) {
  const def = MISSIONS[index];
  game.mission = createMission(def);
  game.ac = createAircraft(def.spawn);
  game.screen = 'flying';
  game.autopilot = false;
  game.toast = null;
  game.result = null;
  ensureAudio(audio);
  playClick(audio);
  announce(`Flying ${def.title}. ${def.objectiveLine}`);
}

function announce(text) {
  statusEl.textContent = text;
}

function showToast(text, colour) {
  game.toast = { text, until: performance.now() + 2600, colour: colour || '#ffd23f' };
}

// --- The frame --------------------------------------------------------------
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - game.lastFrame) / 1000));
  game.lastFrame = now;
  game.timeSec += dt;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const f = readFrame(input);
  f.canvasWidth = w;

  if (game.screen === 'menu') stepMenu(f, w);
  else if (game.screen === 'flying') stepFlying(f, dt);
  else if (game.screen === 'paused') stepPaused(f);
  else if (game.screen === 'debrief') stepDebrief(f);

  draw(w, h);
  requestAnimationFrame(frame);
}

function stepMenu(f, w) {
  if (f.missionPressed >= 1 && f.missionPressed <= MISSIONS.length) {
    game.selected = f.missionPressed - 1;
    startMission(game.selected);
    return;
  }
  if (f.confirmPressed) {
    startMission(game.selected);
    return;
  }
  if (input.mouseDown) {
    const n = missionCardAt(input.mouseX, input.mouseY, window.innerWidth, window.innerHeight, MISSIONS.length);
    if (n) {
      input.mouseDown = false;
      startMission(n - 1);
    }
  }
}

function stepPaused(f) {
  if (f.pausePressed || f.confirmPressed) {
    game.screen = 'flying';
    game.lastFrame = performance.now();
  }
  if (f.menuPressed) game.screen = 'menu';
}

function stepDebrief(f) {
  if (f.confirmPressed) {
    startMission(MISSIONS.indexOf(game.mission.def));
  } else if (f.menuPressed) {
    game.screen = 'menu';
    game.mission = null;
    game.ac = null;
  } else if (f.resetPressed && game.mission) {
    startMission(MISSIONS.indexOf(game.mission.def));
  }
}

// --- Flying: one step of the simulation --------------------------------------
function stepFlying(f, dt) {
  const ac = game.ac;
  const mission = game.mission;

  if (f.pausePressed) {
    game.screen = 'paused';
    return;
  }
  if (f.menuPressed) {
    game.screen = 'menu';
    return;
  }
  if (f.resetPressed) {
    resetAircraft(ac, mission.def.spawn);
    game.mission = createMission(mission.def);
    showToast('RESET — BACK TO THE START LINE');
    return;
  }
  if (f.flapsToggle) {
    ac.flaps = ac.flaps > 0 ? 0 : 1;
    showToast(ac.flaps > 0 ? 'FLAPS DOWN' : 'FLAPS UP');
  }

  // Pilot intent: keyboard, or mouse-drag steering, or the screenshot
  // autopilot (which simply holds the staged attitude).
  let pitchInput = f.pitchInput;
  let rollInput = f.rollInput;
  if (f.mouseSteer && (f.pitchInput === 0 && f.rollInput === 0)) {
    const ms = mouseSteering(f, window.innerWidth, window.innerHeight);
    pitchInput = ms.pitchInput;
    rollInput = ms.rollInput;
  }
  if (game.autopilot) {
    pitchInput = 0;
    rollInput = 0;
    ac.throttle = Math.max(ac.throttle, 0.6);
    ac.pitch = 0.02;
  }
  const groundEvent = stepAircraft(ac, {
    throttleDelta: f.throttleDelta,
    pitchInput,
    rollInput,
    flapsToggle: false,
    brake: f.brake,
  }, dt, terrainHeightAt);

  // The mission watches the flight and reports its events.
  const events = stepMission(mission, ac, dt, groundEvent);
  for (const ev of events) handleMissionEvent(ev, groundEvent);

  // Ground events the mission does not own: a landing in free flight,
  // a hard bounce, a roll-out.
  if (groundEvent.event === 'landed' && mission.def.id === 'free') {
    playLandingChime(audio);
    showToast('TOUCHED DOWN — NICE LANDING', '#5ee08a');
  } else if (groundEvent.event === 'hard-landing') {
    playCrashThud(audio);
    showToast(`HARD LANDING — HULL ${Math.round(100 - ac.damage)}%`, '#ff5a4e');
  } else if (groundEvent.event === 'landed' && mission.def.id === 'landing') {
    playLandingChime(audio);
  }

  updateCamera(cam, ac, dt);
  updateFlightAudio(audio, ac);
  playStallWarble(audio, ac.stalled);
  if (ac.damage >= 100 && !mission.done) {
    game.result = missionResult(mission);
    game.screen = 'debrief';
  }
}

function handleMissionEvent(ev, groundEvent) {
  const mission = game.mission;
  if (ev.type === 'ring') {
    playRingChime(audio);
    showToast(`RING ${ev.n} OF ${ev.total}`, '#ffd23f');
  } else if (ev.type === 'gate') {
    playGateTick(audio);
    showToast(`GATE ${ev.n} OF ${ev.total}`, '#ffd23f');
  } else if (ev.type === 'too-high') {
    playTooHighBuzz(audio);
    showToast('TOO HIGH — GATE NOT COUNTED', '#ff5a4e');
  } else if (ev.type === 'complete' || ev.type === 'fail') {
    if (ev.type === 'complete' && mission.success) playSuccessFanfare(audio);
    if (ev.type === 'fail') playCrashThud(audio);
    const isNewBest = saveBest(mission.def.id, mission.score);
    if (isNewBest && mission.success) {
      mission.resultLines.push('New personal best!');
    }
    game.result = missionResult(mission);
    game.screen = 'debrief';
    announce(`${mission.headline}. Score ${mission.score}.`);
  }
}

// --- Drawing -----------------------------------------------------------------
function draw(w, h) {
  if (game.screen === 'menu') {
    // A slow scenic orbit behind the menu: the archipelago from the air.
    const orbit = game.timeSec * 0.02;
    const ghost = {
      x: Math.sin(orbit) * 500,
      y: 150,
      z: 550 + Math.cos(orbit) * 500,
      heading: orbit + Math.PI,
      pitch: -0.08,
      roll: 0,
      speedKt: 90,
      throttle: 0.5,
      propAngle: game.timeSec * 30,
      shake: 0,
    };
    updateCamera(cam, ghost, 0.016);
    drawScene(ctx, w, h, cam, ghost, { rings: null, gates: null, target: null }, game.timeSec);
    drawMenu(ctx, w, h, MISSIONS, game.selected);
    return;
  }

  const ac = game.ac;
  const mission = game.mission;
  const readout = aircraftReadout(ac);
  if (game.screen === 'paused' || game.screen === 'debrief') {
    updateCamera(cam, ac, 0.016);
  }
  drawScene(ctx, w, h, cam, ac, missionView(mission), game.timeSec);
  drawCompassTape(ctx, w, readout.headingDeg);
  drawMissionPanel(ctx, mission, readout, mission.elapsed);
  const target = missionTarget(mission);
  if (target && !mission.done) {
    drawObjectiveArrow(ctx, w, h, ac, target, target.label);
  }
  drawInstrumentPanel(ctx, w, h, ac);
  drawToast(ctx, w, game.toast);

  if (game.screen === 'paused') drawPaused(ctx, w, h);
  if (game.screen === 'debrief' && game.result) drawDebrief(ctx, w, h, game.result);
}

// Audio may only start after a gesture: unlock it on the first of these.
for (const evt of ['pointerdown', 'keydown']) {
  window.addEventListener(evt, () => ensureAudio(audio), { once: true });
}

requestAnimationFrame(frame);


