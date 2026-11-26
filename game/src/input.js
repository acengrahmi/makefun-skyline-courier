// input.js — keyboard and mouse. One clear job: turn raw key and pointer
// events into the pilot's intent ({ throttleDelta, pitchInput, rollInput,
// flapsToggle, brake }) and into menu actions, so the game loop never
// touches the DOM events itself.

// Keys the game cares about, by KeyboardEvent.code.
const KEYMAP = {
  KeyW: 'throttleUp',
  ArrowUp: 'pitchDown',
  KeyS: 'throttleDown',
  ArrowDown: 'pitchUp',
  KeyA: 'rollLeft',
  ArrowLeft: 'rollLeft',
  KeyD: 'rollRight',
  ArrowRight: 'rollRight',
  KeyF: 'flaps',
  KeyB: 'brake',
  KeyP: 'pause',
  KeyM: 'menu',
  KeyR: 'reset',
  Enter: 'confirm',
  Digit1: 'mission1',
  Digit2: 'mission2',
  Digit3: 'mission3',
  Digit4: 'mission4',
};

export function createInput() {
  return {
    keys: new Set(),       // codes held down right now
    pressed: new Set(),    // codes pressed since the last frame was read
    mouseX: 0,             // pointer x in canvas pixels, for mouse steering
    mouseY: 0,
    mouseDown: false,
    mouseSteer: false,     // true once the pilot drags: mouse steers the plane
    wheelDelta: 0,         // accumulated wheel ticks, for throttle
  };
}

export function attachInput(input, canvas) {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouseDown = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
    if (input.mouseDown) input.mouseSteer = true;
  });
  canvas.addEventListener('pointerdown', (e) => {
    input.mouseDown = true;
    const rect = canvas.getBoundingClientRect();
    input.mouseX = e.clientX - rect.left;
    input.mouseY = e.clientY - rect.top;
  });
  window.addEventListener('pointerup', () => {
    input.mouseDown = false;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.wheelDelta += e.deltaY;
  }, { passive: false });
}

// Read the held keys once per frame and clear the edge-triggered set.
export function readFrame(input) {
  const held = (code) => input.keys.has(code);
  const wasPressed = (code) => input.pressed.has(code);
  const frame = {
    throttleDelta: 0,
    pitchInput: 0,
    rollInput: 0,
    flapsToggle: wasPressed('KeyF'),
    brake: held('KeyB'),
    pausePressed: wasPressed('KeyP'),
    menuPressed: wasPressed('KeyM'),
    resetPressed: wasPressed('KeyR'),
    confirmPressed: wasPressed('Enter'),
    missionPressed: [1, 2, 3, 4].find((n) => wasPressed(`Digit${n}`)) ?? 0,
    mouseSteer: input.mouseSteer,
    mouseX: input.mouseX,
    mouseY: input.mouseY,
    canvasWidth: 0,
  };
  if (held('KeyW')) frame.throttleDelta += 0.55;
  if (held('KeyS')) frame.throttleDelta -= 0.55;
  if (input.wheelDelta !== 0) {
    frame.throttleDelta -= Math.sign(input.wheelDelta) * 0.12;
    input.wheelDelta = 0;
  }
  // Pitch: Up (or W's neighbour) pushes the nose down, Down pulls it up.
  if (held('ArrowUp')) frame.pitchInput -= 1;
  if (held('ArrowDown')) frame.pitchInput += 1;
  if (held('KeyA') || held('ArrowLeft')) frame.rollInput -= 1;
  if (held('KeyD') || held('ArrowRight')) frame.rollInput += 1;
  input.pressed.clear();
  return frame;
}

// Mouse steering: while the pointer is dragged, its offset from the centre
// of the screen banks and pitches the aircraft, like a stick.
export function mouseSteering(frame, canvasWidth, canvasHeight) {
  if (!frame.mouseSteer) return { pitchInput: 0, rollInput: 0 };
  const nx = (frame.mouseX / canvasWidth - 0.5) * 2;
  const ny = (frame.mouseY / canvasHeight - 0.5) * 2;
  return {
    rollInput: clamp(nx * 1.4, -1, 1),
    pitchInput: clamp(-ny * 1.2, -1, 1),
  };
}

// Which mission card (if any) sits under a click, for the menu screen.
export function missionCardAt(mx, my, w, h, count) {
  const cardW = 300, cardH = 132, gap = 22;
  const totalW = count * cardW + (count - 1) * gap;
  const x0 = (w - totalW) / 2;
  const y0 = h * 0.38;
  if (my < y0 || my > y0 + cardH) return 0;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * (cardW + gap);
    if (mx >= x && mx <= x + cardW) return i + 1;
  }
  return 0;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Human-readable control list, shown on the menu and in the status line.
export const CONTROLS_SUMMARY =
  'W/S throttle, arrows or A/D pitch and bank, F flaps, B brake, P pause, R reset';

// True when the pilot pressed anything at all this frame: handy for
// dismissing a toast or a "press any key" prompt.
export function anyKeyPressed(input) {
  return input.pressed.size > 0;
}


