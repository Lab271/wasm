// Typed wrapper around the AssemblyScript engine (assembly/index.ts).

export const Phase = {
  Ready: 0,
  Wave: 1,
  WaveEnd: 2,
  RoundEnd: 3,
  GameOver: 4,
} as const;

export const DuckState = {
  Flying: 0,
  Hit: 1,
  Falling: 2,
  Escaping: 3,
  Done: 4,
} as const;

export const Result = {
  Pending: 0,
  Hit: 1,
  Miss: 2,
} as const;

export interface Engine {
  init(width: number, height: number, seed: number): void;
  start(): void;
  update(dt: number): void;
  shoot(x: number, y: number): number;
  requiredHits(): number;
  getPhase(): number;
  getRound(): number;
  getWave(): number;
  getAmmo(): number;
  getScore(): number;
  getRoundHits(): number;
  getTotalHits(): number;
  getShotsFired(): number;
  getGroundY(): number;
  getWaveTimeLeft(): number;
  getDuckCount(): number;
  getDucksPerRound(): number;
  getDuckX(i: number): number;
  getDuckY(i: number): number;
  getDuckVX(i: number): number;
  getDuckState(i: number): number;
  getDuckFlap(i: number): number;
  getResult(i: number): number;
}

export async function instantiateEngine(bytes: BufferSource): Promise<Engine> {
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      abort(_msg: number, _file: number, line: number, column: number) {
        throw new Error(`duckhunt.wasm aborted at ${line}:${column}`);
      },
    },
  });
  return instance.exports as unknown as Engine;
}

export async function loadEngine(url = "/duckhunt.wasm"): Promise<Engine> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return instantiateEngine(await response.arrayBuffer());
}
