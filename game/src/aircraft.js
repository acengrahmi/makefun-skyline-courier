// aircraft.js — the flight model for the courier's little twin-prop, "Kestrel".
// One clear job: turn pilot inputs (throttle, pitch, bank) into position,
// speed, altitude and attitude, and decide when a touchdown is a landing
// and when it is a crash. All units are game units: 1 unit = 1 metre,
// speeds in knots, angles in radians, time in seconds.

export const KNOTS_TO_UNITS = 0.514444; // 1 knot in metres per second
export const STALL_SPEED_KT = 52;       // below this the wing stops flying
export const CRUISE_SPEED_KT = 132;     // comfortable cruise at full throttle
export const MAX_SPEED_KT = 178;        // redline: airframe shakes past this
export const TAKEOFF_SPEED_KT = 64;     // rotation speed on the runway
export const MAX_FUEL = 100;            // litres in the tanks at departure

// Fresh aircraft state. heading 0 faces north (+z); pitch up is positive.
export function createAircraft(spawn) {
  return {
    x: spawn.x,
    y: spawn.alt,          // altitude above sea level
    z: spawn.z,
    heading: spawn.heading,
    pitch: 0,              // nose up/down, radians
    roll: 0,               // bank, radians (positive = right wing down)
    speedKt: spawn.speedKt,
    throttle: spawn.throttle ?? 0.62,
    fuel: MAX_FUEL,
    damage: 0,             // 0..100; 100 is a write-off
    verticalSpeed: 0,      // ft/min, for the variometer and landing verdicts
    onGround: false,
    gearDown: true,
    flaps: 0,              // 0..1, drag and lift when extended
    propAngle: 0,          // propeller spin, for the render loop
    shake: 0,              // airframe shake 0..1 (overspeed / stall buffet)
    stalled: false,
    engineOut: false,
  };
}

// Pilot inputs arrive as a plain object each frame:
// { throttleDelta, pitchInput (-1..1), rollInput (-1..1), flapsToggle, brake }
export function stepAircraft(ac, input, dt, terrainHeightAt) {
  const prevY = ac.y;

  // --- Throttle and fuel -------------------------------------------------
  ac.throttle = clamp(ac.throttle + input.throttleDelta * dt, 0, 1);
  const burn = (0.045 + ac.throttle * 0.085) * dt; // litres per second
  ac.fuel = Math.max(0, ac.fuel - burn);
  if (ac.fuel <= 0) {
    ac.engineOut = true;
    ac.throttle = 0;
  }

  // --- Attitude ----------------------------------------------------------
  const pitchAuthority = ac.speedKt > STALL_SPEED_KT ? 1 : 0.45;
  const targetPitch = input.pitchInput * 0.42 * pitchAuthority;
  ac.pitch += (targetPitch - ac.pitch) * Math.min(1, dt * 2.4);
  const targetRoll = input.rollInput * 0.85;
  ac.roll += (targetRoll - ac.roll) * Math.min(1, dt * 2.8);
  // Rolling banks the aircraft and the bank turns it.
  const turnRate = -Math.tan(ac.roll) * 9.81 / Math.max(8, ac.speedKt * KNOTS_TO_UNITS);
  ac.heading += turnRate * dt;

  // --- Speed -------------------------------------------------------------
  const thrust = ac.engineOut ? 0 : ac.throttle;
  const targetSpeed = thrust * MAX_SPEED_KT * (1 - ac.flaps * 0.22);
  const drag = 0.55 + ac.flaps * 0.9 + (ac.gearDown ? 0.25 : 0);
  ac.speedKt += (targetSpeed - ac.speedKt) * Math.min(1, dt * 0.35 * drag);
  // Pitch trades speed for altitude and back again.
  ac.speedKt -= Math.sin(ac.pitch) * 22 * dt;
  ac.speedKt = Math.max(0, ac.speedKt);

  // --- Lift, stall and climb ---------------------------------------------
  ac.stalled = ac.speedKt < STALL_SPEED_KT && !ac.onGround;
  const liftFactor = ac.stalled ? 0.25 : 1;
  const climbRate = Math.sin(ac.pitch) * ac.speedKt * KNOTS_TO_UNITS * liftFactor;
  ac.y += climbRate * dt;
  if (ac.stalled) ac.y -= 6.5 * dt; // a stalled wing sinks
  ac.verticalSpeed = ((ac.y - prevY) / Math.max(dt, 1e-4)) * 3.28084 * 60;

  // --- Forward motion ------------------------------------------------------
  const forward = ac.speedKt * KNOTS_TO_UNITS * dt;
  ac.x += Math.sin(ac.heading) * Math.cos(ac.pitch) * forward;
  ac.z += Math.cos(ac.heading) * Math.cos(ac.pitch) * forward;

  // --- Propeller, shake ----------------------------------------------------
  ac.propAngle += dt * (4 + ac.throttle * 38);
  const overSpeed = Math.max(0, ac.speedKt - 165) / 13;
  ac.shake = clamp(Math.max(overSpeed, ac.stalled ? 0.7 : 0), 0, 1);

  // --- Ground contact ------------------------------------------------------
  const ground = terrainHeightAt(ac.x, ac.z);
  if (ac.y <= ground + 1.6) {
    return handleGroundContact(ac, ground, input, dt);
  }
  ac.onGround = false;
  return { event: 'airborne' };
}

// The aircraft has touched terrain. A gentle touchdown on flat ground at a
// sensible speed is a landing; anything else costs damage or ends the sortie.
function handleGroundContact(ac, ground, input, dt) {
  ac.y = ground + 1.6;
  const vs = ac.verticalSpeed; // ft/min, negative is descending
  const flatEnough = Math.abs(ac.roll) < 0.35 && Math.abs(ac.pitch) < 0.3;
  const slowEnough = ac.speedKt < 95;
  const gentle = vs > -420;

  if (ac.onGround) {
    // Rolling along the ground: brake and drag bleed speed off.
    const decel = (input.brake ? 26 : 6) + ac.flaps * 4;
    ac.speedKt = Math.max(0, ac.speedKt - decel * dt);
    ac.verticalSpeed = 0;
    return { event: 'rolling', speedKt: ac.speedKt };
  }

  if (gentle && slowEnough && flatEnough) {
    ac.onGround = true;
    ac.pitch = 0;
    ac.roll = 0;
    ac.verticalSpeed = 0;
    return { event: 'landed', verticalSpeed: vs, speedKt: ac.speedKt };
  }

  // A hard arrival: damage scales with how hard and how fast we came in.
  const impact = Math.min(100, Math.abs(vs) / 9 + Math.max(0, ac.speedKt - 95) * 0.9);
  ac.damage = Math.min(100, ac.damage + impact);
  ac.speedKt *= 0.35;
  ac.pitch = 0;
  ac.roll = 0;
  if (ac.damage >= 100) {
    return { event: 'crashed', reason: 'Airframe broke up on impact.', verticalSpeed: vs };
  }
  // A survivable but expensive bounce: back into the air, wounded.
  ac.y = ground + 6;
  ac.verticalSpeed = 0;
  return { event: 'hard-landing', damage: ac.damage, verticalSpeed: vs };
}

// How good was that landing? 0..100, for the debrief score.
export function landingQuality(vsFpm, speedKt, onRunway) {
  const vsScore = clamp(1 - Math.abs(vsFpm) / 420, 0, 1);
  const speedScore = clamp(1 - Math.max(0, speedKt - 70) / 25, 0, 1);
  const placeScore = onRunway ? 1 : 0.45;
  return Math.round((vsScore * 0.5 + speedScore * 0.3 + placeScore * 0.2) * 100);
}

// Put the aircraft back at a spawn after a crash or a reset (key R).
export function resetAircraft(ac, spawn) {
  const fresh = createAircraft(spawn);
  Object.assign(ac, fresh);
}

// Compact readouts the HUD and the debrief both consume.
export function aircraftReadout(ac) {
  return {
    altitudeFt: Math.round(ac.y * 3.28084),
    speedKt: Math.round(ac.speedKt),
    headingDeg: Math.round(((ac.heading * 180) / Math.PI % 360 + 360) % 360),
    verticalSpeedFpm: Math.round(ac.verticalSpeed),
    fuelPct: Math.round((ac.fuel / MAX_FUEL) * 100),
    damagePct: Math.round(ac.damage),
    throttlePct: Math.round(ac.throttle * 100),
    stalled: ac.stalled,
    engineOut: ac.engineOut,
    onGround: ac.onGround,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Distance in metres between two ground points, for objective arrows.
export function groundDistance(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

// Bearing in degrees from (ax,az) to (bx,bz), 0 = north, clockwise.
export function groundBearing(ax, az, bx, bz) {
  const deg = (Math.atan2(bx - ax, bz - az) * 180) / Math.PI;
  return (deg + 360) % 360;
}

