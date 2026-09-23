// Duck Hunt game engine.
//
// Pure simulation with no host imports: the React host drives it with
// update(dt) / shoot(x, y) and reads state back through the exported getters.
// Coordinates are in logical canvas pixels (origin top-left).

// Game phases (mirrored in src/engine.ts)
const PHASE_READY: i32 = 0;
const PHASE_WAVE: i32 = 1;
const PHASE_WAVE_END: i32 = 2;
const PHASE_ROUND_END: i32 = 3;
const PHASE_GAME_OVER: i32 = 4;

// Duck states (mirrored in src/engine.ts)
const DUCK_FLYING: i32 = 0;
const DUCK_HIT: i32 = 1;
const DUCK_FALLING: i32 = 2;
const DUCK_ESCAPING: i32 = 3;
const DUCK_DONE: i32 = 4;

// Per-duck round results (mirrored in src/engine.ts)
const RESULT_PENDING: i32 = 0;
const RESULT_HIT: i32 = 1;
const RESULT_MISS: i32 = 2;

const DUCKS_PER_WAVE: i32 = 2;
const WAVES_PER_ROUND: i32 = 5;
const DUCKS_PER_ROUND: i32 = DUCKS_PER_WAVE * WAVES_PER_ROUND;
const SHOTS_PER_WAVE: i32 = 3;
const PERFECT_BONUS: i32 = 10000;

const WAVE_TIME: f64 = 6.0;
const HIT_TIME: f64 = 0.35;
const WAVE_END_TIME: f64 = 1.2;
const ROUND_END_TIME: f64 = 2.5;
const HIT_RADIUS: f64 = 32.0;
const FALL_SPEED: f64 = 340.0;
const ESCAPE_SPEED: f64 = 280.0;
const EDGE_MARGIN: f64 = 24.0;

let width: f64 = 800.0;
let height: f64 = 600.0;
let groundY: f64 = 468.0;
let rng: u32 = 1;

let phase: i32 = PHASE_READY;
let phaseTimer: f64 = 0.0;
let waveTime: f64 = 0.0;
let round: i32 = 1;
let wave: i32 = 0;
let ammo: i32 = SHOTS_PER_WAVE;
let score: i32 = 0;
let roundHits: i32 = 0;
let totalHits: i32 = 0;
let shotsFired: i32 = 0;

const duckX = new StaticArray<f64>(DUCKS_PER_WAVE);
const duckY = new StaticArray<f64>(DUCKS_PER_WAVE);
const duckVX = new StaticArray<f64>(DUCKS_PER_WAVE);
const duckVY = new StaticArray<f64>(DUCKS_PER_WAVE);
const duckTimer = new StaticArray<f64>(DUCKS_PER_WAVE);
const duckFlap = new StaticArray<f64>(DUCKS_PER_WAVE);
const duckState = new StaticArray<i32>(DUCKS_PER_WAVE);
const results = new StaticArray<i32>(DUCKS_PER_ROUND);

// xorshift32: deterministic for a given seed, which keeps tests reproducible.
function random(): f64 {
  rng ^= rng << 13;
  rng ^= rng >> 17;
  rng ^= rng << 5;
  return <f64>rng / 4294967296.0;
}

export function init(w: f64, h: f64, seed: u32): void {
  width = w;
  height = h;
  groundY = h * 0.78;
  rng = seed == 0 ? 0x9e3779b9 : seed;
  phase = PHASE_READY;
  resetGame();
  for (let i = 0; i < DUCKS_PER_WAVE; i++) duckState[i] = DUCK_DONE;
}

export function start(): void {
  if (phase != PHASE_READY && phase != PHASE_GAME_OVER) return;
  resetGame();
  startWave();
}

export function update(dt: f64): void {
  // Clamp large steps (e.g. after a background tab) so ducks don't teleport.
  if (dt > 0.1) dt = 0.1;
  if (dt <= 0.0) return;

  if (phase == PHASE_WAVE) {
    updateWave(dt);
  } else if (phase == PHASE_WAVE_END) {
    phaseTimer -= dt;
    if (phaseTimer <= 0.0) {
      wave++;
      if (wave < WAVES_PER_ROUND) startWave();
      else endRound();
    }
  } else if (phase == PHASE_ROUND_END) {
    phaseTimer -= dt;
    if (phaseTimer <= 0.0) {
      round++;
      resetRound();
      startWave();
    }
  }
}

// Fire at (x, y). Returns the index of the duck hit, -1 for a miss,
// or -2 when shooting is not possible (wrong phase or out of ammo).
export function shoot(x: f64, y: f64): i32 {
  if (phase != PHASE_WAVE || ammo <= 0) return -2;
  ammo--;
  shotsFired++;

  let hit: i32 = -1;
  let best: f64 = HIT_RADIUS * HIT_RADIUS;
  for (let i = 0; i < DUCKS_PER_WAVE; i++) {
    if (duckState[i] != DUCK_FLYING) continue;
    const dx = duckX[i] - x;
    const dy = duckY[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= best) {
      best = d2;
      hit = i;
    }
  }

  if (hit >= 0) {
    duckState[hit] = DUCK_HIT;
    duckTimer[hit] = HIT_TIME;
    duckVX[hit] = 0.0;
    duckVY[hit] = 0.0;
    results[wave * DUCKS_PER_WAVE + hit] = RESULT_HIT;
    roundHits++;
    totalHits++;
    score += pointsPerDuck();
  }

  if (ammo == 0) scatter();
  return hit;
}

function resetGame(): void {
  round = 1;
  score = 0;
  totalHits = 0;
  shotsFired = 0;
  resetRound();
}

function resetRound(): void {
  wave = 0;
  roundHits = 0;
  for (let i = 0; i < DUCKS_PER_ROUND; i++) results[i] = RESULT_PENDING;
}

function duckSpeed(): f64 {
  return 170.0 + 30.0 * <f64>(round - 1);
}

function pointsPerDuck(): i32 {
  return 500 + 100 * (round - 1);
}

function startWave(): void {
  phase = PHASE_WAVE;
  ammo = SHOTS_PER_WAVE;
  waveTime = 0.0;
  for (let i = 0; i < DUCKS_PER_WAVE; i++) spawnDuck(i);
}

function spawnDuck(i: i32): void {
  duckX[i] = width * (0.2 + 0.6 * random());
  duckY[i] = groundY - 10.0;
  // Launch upward within a 108° cone.
  const angle = Math.PI * (0.2 + 0.6 * random());
  const speed = duckSpeed();
  duckVX[i] = Math.cos(angle) * speed;
  duckVY[i] = -Math.sin(angle) * speed;
  duckTimer[i] = 0.8 + random();
  duckFlap[i] = random();
  duckState[i] = DUCK_FLYING;
}

function updateWave(dt: f64): void {
  waveTime += dt;
  if (waveTime >= WAVE_TIME) scatter();

  let active = 0;
  for (let i = 0; i < DUCKS_PER_WAVE; i++) {
    const state = duckState[i];
    if (state == DUCK_DONE) continue;
    active++;
    duckFlap[i] += dt * 7.0;

    if (state == DUCK_FLYING) {
      fly(i, dt);
    } else if (state == DUCK_HIT) {
      duckTimer[i] -= dt;
      if (duckTimer[i] <= 0.0) duckState[i] = DUCK_FALLING;
    } else if (state == DUCK_FALLING) {
      duckY[i] += FALL_SPEED * dt;
      if (duckY[i] >= groundY) {
        duckY[i] = groundY;
        duckState[i] = DUCK_DONE;
      }
    } else if (state == DUCK_ESCAPING) {
      duckX[i] += duckVX[i] * dt;
      duckY[i] += duckVY[i] * dt;
      if (duckY[i] < -60.0) duckState[i] = DUCK_DONE;
    }
  }

  if (active == 0) {
    phase = PHASE_WAVE_END;
    phaseTimer = WAVE_END_TIME;
  }
}

function fly(i: i32, dt: f64): void {
  duckX[i] += duckVX[i] * dt;
  duckY[i] += duckVY[i] * dt;

  if ((duckX[i] < EDGE_MARGIN && duckVX[i] < 0.0) || (duckX[i] > width - EDGE_MARGIN && duckVX[i] > 0.0)) {
    duckVX[i] = -duckVX[i];
  }
  if ((duckY[i] < EDGE_MARGIN && duckVY[i] < 0.0) || (duckY[i] > groundY - 40.0 && duckVY[i] > 0.0)) {
    duckVY[i] = -duckVY[i];
  }

  // Change heading every so often to keep flight unpredictable.
  duckTimer[i] -= dt;
  if (duckTimer[i] <= 0.0) {
    duckTimer[i] = 0.6 + 1.2 * random();
    const angle = 2.0 * Math.PI * random();
    const speed = duckSpeed();
    duckVX[i] = Math.cos(angle) * speed;
    duckVY[i] = Math.sin(angle) * speed;
  }
}

// Remaining flying ducks give up and fly off the top of the screen.
function scatter(): void {
  for (let i = 0; i < DUCKS_PER_WAVE; i++) {
    if (duckState[i] != DUCK_FLYING) continue;
    duckState[i] = DUCK_ESCAPING;
    duckVX[i] = duckVX[i] * 0.25;
    duckVY[i] = -ESCAPE_SPEED;
    results[wave * DUCKS_PER_WAVE + i] = RESULT_MISS;
  }
}

function endRound(): void {
  if (roundHits >= requiredHits()) {
    if (roundHits == DUCKS_PER_ROUND) score += PERFECT_BONUS;
    phase = PHASE_ROUND_END;
    phaseTimer = ROUND_END_TIME;
  } else {
    phase = PHASE_GAME_OVER;
  }
}

export function requiredHits(): i32 {
  return min<i32>(9, 6 + (round - 1) / 2);
}

export function getPhase(): i32 { return phase; }
export function getRound(): i32 { return round; }
export function getWave(): i32 { return wave; }
export function getAmmo(): i32 { return ammo; }
export function getScore(): i32 { return score; }
export function getRoundHits(): i32 { return roundHits; }
export function getTotalHits(): i32 { return totalHits; }
export function getShotsFired(): i32 { return shotsFired; }
export function getGroundY(): f64 { return groundY; }
export function getWaveTimeLeft(): f64 { return max<f64>(0.0, WAVE_TIME - waveTime); }
export function getDuckCount(): i32 { return DUCKS_PER_WAVE; }
export function getDucksPerRound(): i32 { return DUCKS_PER_ROUND; }
export function getDuckX(i: i32): f64 { return duckX[i]; }
export function getDuckY(i: i32): f64 { return duckY[i]; }
export function getDuckVX(i: i32): f64 { return duckVX[i]; }
export function getDuckState(i: i32): i32 { return duckState[i]; }
export function getDuckFlap(i: i32): f64 { return duckFlap[i]; }
export function getResult(i: i32): i32 { return results[i]; }
