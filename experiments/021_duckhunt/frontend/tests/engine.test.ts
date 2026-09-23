import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DuckState, instantiateEngine, Phase, Result, type Engine } from "../src/engine";

const WASM = fileURLToPath(new URL("../public/duckhunt.wasm", import.meta.url));
const W = 800;
const H = 600;

let bytes: Uint8Array<ArrayBuffer>;
let engine: Engine;

function step(seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) engine.update(dt);
}

function shootAllFlying(): void {
  for (let i = 0; i < engine.getDuckCount(); i++) {
    if (engine.getDuckState(i) === DuckState.Flying) {
      engine.shoot(engine.getDuckX(i), engine.getDuckY(i));
    }
  }
}

function waitForPhaseChange(from: number, maxSeconds = 20): void {
  for (let t = 0; t < maxSeconds && engine.getPhase() === from; t += 1 / 60) engine.update(1 / 60);
}

function playWave(hit: boolean): void {
  expect(engine.getPhase()).toBe(Phase.Wave);
  if (hit) shootAllFlying();
  else for (let i = 0; i < 3; i++) engine.shoot(-1000, -1000);
  waitForPhaseChange(Phase.Wave);
  expect(engine.getPhase()).toBe(Phase.WaveEnd);
  waitForPhaseChange(Phase.WaveEnd);
}

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(WASM));
});

beforeEach(async () => {
  engine = await instantiateEngine(bytes);
  engine.init(W, H, 12345);
});

describe("initial state", () => {
  it("starts in the ready phase with a fresh round", () => {
    expect(engine.getPhase()).toBe(Phase.Ready);
    expect(engine.getRound()).toBe(1);
    expect(engine.getScore()).toBe(0);
    expect(engine.getAmmo()).toBe(3);
    expect(engine.requiredHits()).toBe(6);
    expect(engine.getGroundY()).toBeCloseTo(H * 0.78);
    expect(engine.getDucksPerRound()).toBe(10);
  });

  it("does not allow shooting before the game starts", () => {
    expect(engine.shoot(100, 100)).toBe(-2);
    expect(engine.getShotsFired()).toBe(0);
  });
});

describe("waves", () => {
  beforeEach(() => engine.start());

  it("spawns flying ducks with full ammo", () => {
    expect(engine.getPhase()).toBe(Phase.Wave);
    expect(engine.getAmmo()).toBe(3);
    for (let i = 0; i < engine.getDuckCount(); i++) {
      expect(engine.getDuckState(i)).toBe(DuckState.Flying);
    }
  });

  it("keeps flying ducks inside the play field", () => {
    for (let frame = 0; frame < 300; frame++) {
      engine.update(1 / 60);
      for (let i = 0; i < engine.getDuckCount(); i++) {
        if (engine.getDuckState(i) !== DuckState.Flying) continue;
        expect(engine.getDuckX(i)).toBeGreaterThan(-10);
        expect(engine.getDuckX(i)).toBeLessThan(W + 10);
        expect(engine.getDuckY(i)).toBeGreaterThan(-10);
        expect(engine.getDuckY(i)).toBeLessThan(engine.getGroundY());
      }
    }
  });

  it("scores a hit when shooting at a duck", () => {
    step(0.5);
    const hit = engine.shoot(engine.getDuckX(0), engine.getDuckY(0));
    expect(hit).toBe(0);
    expect(engine.getDuckState(0)).toBe(DuckState.Hit);
    expect(engine.getScore()).toBe(500);
    expect(engine.getRoundHits()).toBe(1);
    expect(engine.getResult(0)).toBe(Result.Hit);
    expect(engine.getAmmo()).toBe(2);
  });

  it("cannot hit the same duck twice", () => {
    step(0.5);
    const x = engine.getDuckX(0);
    const y = engine.getDuckY(0);
    engine.shoot(x, y);
    const second = engine.shoot(x, y);
    expect(second === -1 || second === 1).toBe(true);
    expect(engine.getRoundHits()).toBe(second === 1 ? 2 : 1);
  });

  it("hit ducks fall to the ground", () => {
    step(0.5);
    engine.shoot(engine.getDuckX(0), engine.getDuckY(0));
    step(0.5);
    expect(engine.getDuckState(0)).toBe(DuckState.Falling);
    step(3);
    expect(engine.getDuckState(0)).toBe(DuckState.Done);
  });

  it("ducks fly away once ammo runs out", () => {
    for (let i = 0; i < 3; i++) expect(engine.shoot(-1000, -1000)).toBe(-1);
    expect(engine.getAmmo()).toBe(0);
    expect(engine.shoot(0, 0)).toBe(-2);
    expect(engine.getDuckState(0)).toBe(DuckState.Escaping);
    expect(engine.getResult(0)).toBe(Result.Miss);
    expect(engine.getResult(1)).toBe(Result.Miss);
    waitForPhaseChange(Phase.Wave);
    expect(engine.getPhase()).toBe(Phase.WaveEnd);
  });

  it("ducks fly away when the wave timer expires", () => {
    step(6.1);
    expect(engine.getWaveTimeLeft()).toBe(0);
    expect(engine.getDuckState(0)).toBe(DuckState.Escaping);
  });

  it("clamps large time steps", () => {
    const x = engine.getDuckX(0);
    engine.update(5);
    // One clamped 0.1s step at ~170px/s moves the duck well under 50px.
    expect(Math.abs(engine.getDuckX(0) - x)).toBeLessThan(50);
    expect(engine.getPhase()).toBe(Phase.Wave);
  });
});

describe("rounds", () => {
  beforeEach(() => engine.start());

  it("advances to the next round with a perfect bonus", () => {
    for (let w = 0; w < 5; w++) playWave(true);
    expect(engine.getPhase()).toBe(Phase.RoundEnd);
    expect(engine.getRoundHits()).toBe(10);
    expect(engine.getScore()).toBe(10 * 500 + 10000);

    waitForPhaseChange(Phase.RoundEnd);
    expect(engine.getPhase()).toBe(Phase.Wave);
    expect(engine.getRound()).toBe(2);
    expect(engine.getRoundHits()).toBe(0);
    expect(engine.getResult(0)).toBe(Result.Pending);
  });

  it("ends the game when the hit quota is missed", () => {
    playWave(true);
    for (let w = 1; w < 5; w++) playWave(false);
    expect(engine.getPhase()).toBe(Phase.GameOver);
    expect(engine.getScore()).toBe(1000);

    engine.start();
    expect(engine.getPhase()).toBe(Phase.Wave);
    expect(engine.getScore()).toBe(0);
    expect(engine.getRound()).toBe(1);
  });

  it("start() is ignored mid-game", () => {
    step(0.5);
    engine.shoot(engine.getDuckX(0), engine.getDuckY(0));
    engine.start();
    expect(engine.getScore()).toBe(500);
  });
});

describe("determinism", () => {
  it("produces identical flights for identical seeds", async () => {
    const other = await instantiateEngine(bytes);
    other.init(W, H, 12345);
    engine.start();
    other.start();
    for (let i = 0; i < 120; i++) {
      engine.update(1 / 60);
      other.update(1 / 60);
    }
    expect(other.getDuckX(0)).toBe(engine.getDuckX(0));
    expect(other.getDuckY(1)).toBe(engine.getDuckY(1));
  });
});
