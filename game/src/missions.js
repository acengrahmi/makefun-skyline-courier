// missions.js — the three sorties and free flight. One clear job: define what
// "done" means for each mission, watch the aircraft against it, and score the
// result. The renderer asks each mission what to draw (rings, gates, target)
// and the HUD asks it what to say.

import { RINGS, SLALOM_GATES, RUNWAY, SPAWNS, onRunway } from './terrain.js';
import { groundDistance, landingQuality } from './aircraft.js';

export const MISSIONS = [
  {
    id: 'rings',
    title: 'Emerald Ring Run',
    brief: 'Thread all eight rings over the islands, in order. Smooth flying wins: every ring pays, the clock decides the rest.',
    rewardLine: '8 RINGS  •  BEST TIME WINS',
    objectiveLine: 'Fly through the glowing rings in order.',
    spawn: SPAWNS.rings,
  },
  {
    id: 'landing',
    title: 'Runway Return',
    brief: 'You are 900 m out, high and fast. Bring the Kestrel home: gentle descent, flaps down, touch down on the numbers at Kestrel Field.',
    rewardLine: 'LAND ON THE RUNWAY  •  GRADED',
    objectiveLine: 'Land on the runway at Kestrel Field.',
    spawn: SPAWNS.landing,
  },
  {
    id: 'slalom',
    title: 'Buoy Slalom',
    brief: 'Ten gates between the buoys, flown low over the water. Stay under 150 ft between gates or the gate will not count.',
    rewardLine: '10 GATES  •  LOW AND FAST',
    objectiveLine: 'Slalom the buoy gates, low and fast.',
    spawn: SPAWNS.slalom,
  },
  {
    id: 'free',
    title: 'Free Flight',
    brief: 'No clock, no score. Just you, the Kestrel and the archipelago. Practice your landings at Kestrel Field.',
    rewardLine: 'NO SCORE  •  FLY ANYWHERE',
    objectiveLine: 'Explore the archipelago.',
    spawn: SPAWNS.free,
  },
];

// A live mission: progress, timer, score and the current objective.
export function createMission(def) {
  return {
    def,
    title: def.title,
    objectiveLine: def.objectiveLine,
    startedAt: performance.now(),
    elapsed: 0,
    score: 0,
    ringsPassed: 0,
    gatesPassed: 0,
    done: false,
    success: false,
    headline: '',
    resultLines: [],
    fuelWarning: false,
    nextIndex: 0,
  };
}

// What the renderer should draw for this mission right now.
export function missionView(mission) {
  if (mission.def.id === 'rings') {
    return { rings: RINGS, nextIndex: mission.nextIndex, gates: null, target: null };
  }
  if (mission.def.id === 'slalom') {
    return { rings: null, gates: SLALOM_GATES, nextIndex: mission.nextIndex, target: null };
  }
  if (mission.def.id === 'landing') {
    return {
      rings: null,
      gates: null,
      nextIndex: 0,
      target: { x: RUNWAY.x, y: RUNWAY.elevation + 6, z: RUNWAY.z },
    };
  }
  return { rings: null, gates: null, nextIndex: 0, target: null };
}

// The current objective point (for the HUD arrow) and its label.
export function missionTarget(mission) {
  if (mission.def.id === 'rings') {
    const ring = RINGS[mission.nextIndex];
    return ring ? { x: ring.x, z: ring.z, label: `RING ${mission.nextIndex + 1} OF ${RINGS.length}` } : null;
  }
  if (mission.def.id === 'slalom') {
    const gate = SLALOM_GATES[mission.nextIndex];
    return gate ? { x: gate.x, z: gate.z, label: `GATE ${mission.nextIndex + 1} OF ${SLALOM_GATES.length}` } : null;
  }
  if (mission.def.id === 'landing') {
    return { x: RUNWAY.x, z: RUNWAY.z, label: 'KESTREL FIELD RUNWAY' };
  }
  return null;
}

// Advance the mission one frame. Returns events the main loop turns into
// toasts and sounds: { type: 'ring' | 'gate' | 'complete' | 'fail', ... }.
export function stepMission(mission, ac, dt, groundEvent) {
  mission.elapsed += dt;
  mission.fuelWarning = ac.fuel < 25;
  const events = [];

  if (mission.def.id === 'rings') {
    const ring = RINGS[mission.nextIndex];
    if (ring) {
      const d = Math.hypot(ac.x - ring.x, ac.y - ring.y, ac.z - ring.z);
      if (d < ring.r) {
        mission.ringsPassed++;
        mission.nextIndex++;
        mission.score += 250;
        events.push({ type: 'ring', n: mission.ringsPassed, total: RINGS.length });
        if (mission.nextIndex >= RINGS.length) {
          finishMission(mission, true, 'RING RUN COMPLETE', [
            `All ${RINGS.length} rings in ${formatTime(mission.elapsed)}.`,
            `Fuel left: ${Math.round(ac.fuel)}%  •  Hull: ${Math.round(100 - ac.damage)}%.`,
          ]);
          events.push({ type: 'complete' });
        }
      }
    }
  }

  if (mission.def.id === 'slalom') {
    const gate = SLALOM_GATES[mission.nextIndex];
    if (gate) {
      const across = Math.abs(ac.x - gate.x) < gate.gap / 2;
      const along = Math.abs(ac.z - gate.z) < 14;
      const low = ac.y < 46; // under ~150 ft
      if (across && along) {
        if (low) {
          mission.gatesPassed++;
          mission.nextIndex++;
          mission.score += 200;
          events.push({ type: 'gate', n: mission.gatesPassed, total: SLALOM_GATES.length });
          if (mission.nextIndex >= SLALOM_GATES.length) {
            finishMission(mission, true, 'SLALOM COMPLETE', [
              `All ${SLALOM_GATES.length} gates in ${formatTime(mission.elapsed)}.`,
              `Fuel left: ${Math.round(ac.fuel)}%  •  Hull: ${Math.round(100 - ac.damage)}%.`,
            ]);
            events.push({ type: 'complete' });
          }
        } else {
          events.push({ type: 'too-high' });
          mission.nextIndex++;
          if (mission.nextIndex >= SLALOM_GATES.length) {
            finishMission(mission, false, 'SLALOM OVER', [
              `Gates passed: ${mission.gatesPassed} of ${SLALOM_GATES.length}.`,
              'Fly under 150 ft through the gates to count them.',
            ]);
            events.push({ type: 'complete' });
          }
        }
      }
    }
  }

  if (mission.def.id === 'landing') {
    if (groundEvent && groundEvent.event === 'landed') {
      const quality = landingQuality(groundEvent.verticalSpeed, groundEvent.speedKt, onRunway(ac.x, ac.z));
      const good = onRunway(ac.x, ac.z);
      mission.score += quality * 5;
      finishMission(mission, good, good ? 'WELCOME HOME' : 'DOWN — OFF THE RUNWAY', [
        `Touchdown ${Math.round(groundEvent.verticalSpeed)} ft/min at ${Math.round(groundEvent.speedKt)} kt.`,
        good ? `Landing quality ${quality}/100.` : 'You missed the runway — the field crew is not amused.',
        `Fuel left: ${Math.round(ac.fuel)}%.`,
      ]);
      events.push({ type: 'complete' });
    }
  }

  // Fuel exhaustion or a wreck ends any scored mission.
  if (groundEvent && groundEvent.event === 'crashed') {
    finishMission(mission, false, 'KESTREL DOWN', [
      groundEvent.reason || 'The aircraft is a write-off.',
      `Score banked: ${mission.score}.`,
    ]);
    events.push({ type: 'fail' });
  }
  if (ac.engineOut && ac.fuel <= 0 && !mission.done && mission.def.id !== 'free') {
    // Give the pilot a chance to glide home before calling it.
    if (ac.onGround) {
      finishMission(mission, false, 'OUT OF FUEL', [
        'The tanks ran dry mid-sortie.',
        `Score banked: ${mission.score}.`,
      ]);
      events.push({ type: 'fail' });
    }
  }
  return events;
}

function finishMission(mission, success, headline, lines) {
  mission.done = true;
  mission.success = success;
  mission.headline = headline;
  mission.resultLines = lines;
  // Time bonus for the scored missions: faster is worth more.
  if (success && mission.def.id !== 'free') {
    const timeBonus = Math.max(0, Math.round(3600 - mission.elapsed * 12));
    mission.score += timeBonus;
    mission.resultLines.push(`Time bonus: +${timeBonus}.`);
  }
  // A clean aircraft is worth a bonus too.
  if (success) {
    const cleanBonus = mission.def.id === 'landing' ? 0 : 150;
    if (cleanBonus) {
      mission.score += cleanBonus;
      mission.resultLines.push(`Clean hull bonus: +${cleanBonus}.`);
    }
  }
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

// Best results, kept in the browser so a pilot can chase their own times.
const BEST_KEY = 'skyline-courier-best';
export function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveBest(missionId, score) {
  try {
    const best = loadBest();
    if (!best[missionId] || score > best[missionId]) {
      best[missionId] = score;
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// The debrief screen's data: headline, scored lines and the final score.
export function missionResult(mission) {
  return {
    success: mission.success,
    headline: mission.headline || 'SORTIE OVER',
    lines: mission.resultLines.length ? mission.resultLines : ['The sortie ended.'],
    score: mission.score,
  };
}


