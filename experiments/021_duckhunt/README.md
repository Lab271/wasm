# Duck Hunt — AssemblyScript engine, React renderer, FastAPI host

## Version: 0.1.0

A browser remake of the NES light-gun classic. The whole game simulation (duck
flight, hit detection, ammo, waves, rounds, scoring) runs as a WASM module
compiled from **AssemblyScript**. **React** draws it on a `<canvas>` and owns the
menus, and a **FastAPI** backend serves the page and keeps a high-score table.
After the page loads, nothing goes over the network except saving a high score.

## Architecture

The engine is a **state machine with a flat scalar ABI**. The host pushes
time and input in, and pulls state out through getters. No strings, structs or
linear-memory pointers cross the boundary, only `f64` and `i32`:

```js
const { instance } = await WebAssembly.instantiate(bytes, {
  env: { abort() { throw new Error("duckhunt.wasm aborted"); } },
});
const e = instance.exports;
e.init(800, 600, seed);   // logical canvas size + PRNG seed
e.start();
e.update(dt);             // every animation frame, dt in seconds
e.shoot(x, y);            // -> duck index hit, -1 miss, -2 can't shoot now
e.getDuckX(0); e.getPhase(); e.getScore(); // ...read back for rendering
```

| Direction | Exports |
|-----------|---------|
| Host → engine | `init(w, h, seed)`, `start()`, `update(dt)`, `shoot(x, y)` |
| Game state | `getPhase`, `getRound`, `getWave`, `getAmmo`, `getScore`, `getRoundHits`, `getTotalHits`, `getShotsFired`, `requiredHits`, `getWaveTimeLeft`, `getGroundY` |
| Per duck (`i` = 0..1) | `getDuckX`, `getDuckY`, `getDuckVX`, `getDuckState`, `getDuckFlap` |
| Per round slot (`i` = 0..9) | `getResult` (pending / hit / miss), `getDucksPerRound`, `getDuckCount` |

The phase, duck-state and result enums are integer constants defined in
`assembly/index.ts` and copied into `src/engine.ts`. If you change one, change
the other.

**Game rules** (all in the engine):
- Ducks come in waves of 2, and you get 3 shots per wave.
- Ducks fly away when your ammo runs out or after 6 seconds.
- A round is 5 waves (10 ducks). To advance you need 6 hits in rounds 1–2,
  rising by one every two rounds to a maximum of 9.
- Duck speed goes up 30 px/s per round.
- A duck is worth `500 + 100 × (round − 1)` points, and a perfect round
  (10/10) adds a 10,000-point bonus.

**Determinism:** the engine uses its own xorshift32 PRNG, seeded by the host
through `init`, and never calls `Math.random`. That removes the `env.seed`
import and makes a seed reproduce a whole game, which the tests rely on.
`update` clamps `dt` to 100 ms, so switching back to a background tab doesn't
make the ducks jump across the screen.

- `frontend/assembly/`: the engine, compiled by `asc` with `--runtime stub`.
  All allocation (a few `StaticArray`s) happens once at module start, so the
  stub runtime never frees memory and never needs to.
- `frontend/src/`: `engine.ts` (typed loader and constants), `render.ts`
  (draws the canvas purely from engine getters), `App.tsx` (the
  `requestAnimationFrame` loop, pointer input, overlays), `api.ts`
  (high-score client) and `audio.ts` (WebAudio shot and quack sounds,
  synthesised so there are no audio files).
- `backend/`: FastAPI app. It serves `frontend/dist` as static files and
  exposes `/api/health` and `/api/highscores`.

React only re-renders when the game **phase** changes (ready → playing →
game over). The per-frame drawing goes straight to the canvas from the
engine getters, so the 60 fps loop never goes through React state.

## Usage

```bash
make serve                # builds the wasm engine + React app, serves at http://127.0.0.1:8000
make serve PORT=9000      # different port (HOST is overridable too)
```

For UI work with hot reload, run `make serve` in one terminal and
`npm --prefix frontend run dev` in another. The Vite dev server forwards `/api`
to the backend on port 8000.

| Target | What it does |
|--------|--------------|
| `make help` | List all targets (default; generated from `##` comments) |
| `make install` | `npm install` the frontend, `uv sync` the backend |
| `make build` | `asc` → `public/duckhunt.wasm`, then `tsc --noEmit` and `vite build` → `frontend/dist/` |
| `make serve` | `build`, then run uvicorn |
| `make test` | `test-backend` + `test-frontend` |
| `make lint` | `ruff check`, `ruff format --check`, `tsc --noEmit` |
| `make clean` | Remove `frontend/dist/` and the compiled `.wasm` |

The first frontend target that needs npm packages installs them. `uv run`
syncs the backend environment on its own.

Set `DUCKHUNT_STATIC_DIR` to serve the frontend from another directory. If the
build output is missing, `/` returns a hint to run `make build` instead of a
404.

## Testing

```bash
make test-frontend   # asc build, then vitest: the compiled .wasm in Node + the API client
make test-backend    # pytest + coverage: API, validation, static serving, score table
```

`tests/engine.test.ts` loads the **compiled** `public/duckhunt.wasm` artifact
with `WebAssembly.instantiate` rather than importing the AssemblyScript
source, so what gets tested is the binary the browser runs. Each test gets a
fresh instance with a fixed seed. The tests play the game through the ABI:
hitting a duck by shooting at its reported position, the fall to the ground,
ducks flying away on empty ammo and on timeout, a perfect round advancing
with its bonus, a missed quota ending the game, `start()` being ignored
mid-game, `dt` clamping, and two instances with the same seed producing
identical flights.

The backend tests use FastAPI's `TestClient` against `create_app(static_dir)`
with a temporary directory, so they don't depend on a frontend build.

## Structure

```
duckhunt/
├── README.md
├── Makefile                      # help, install, build, serve, test, test-backend, test-frontend, lint, clean
├── frontend/
│   ├── asconfig.json             # release/debug targets → public/duckhunt.wasm, runtime: stub
│   ├── assembly/
│   │   └── index.ts              # the engine: simulation, rules, PRNG, exported getters
│   ├── src/
│   │   ├── engine.ts             # WASM loader + typed Engine interface + enum constants
│   │   ├── render.ts             # canvas scene, ducks, HUD, crosshair
│   │   ├── App.tsx               # rAF loop, pointer input, start / game-over overlays
│   │   ├── api.ts                # high-score client
│   │   └── audio.ts              # synthesised WebAudio SFX
│   ├── tests/
│   │   ├── engine.test.ts        # compiled .wasm, driven through its exports, in Node
│   │   └── api.test.ts           # fetch-mocked API client
│   ├── index.html
│   └── vite.config.ts            # React plugin, /api dev proxy, vitest config
└── backend/
    ├── pyproject.toml            # uv project: fastapi, uvicorn; dev: pytest, ruff, httpx2
    ├── src/duckhunt_server/
    │   └── app.py                # create_app(), HighScoreTable, static mount
    └── tests/
        └── test_app.py
    # frontend/public/duckhunt.wasm and frontend/dist/ are build output, gitignored
```

## High-score API

```bash
curl http://127.0.0.1:8000/api/highscores
# [{"name": "ann", "score": 5500, "round": 2}, ...]   top 10, highest first

curl -X POST http://127.0.0.1:8000/api/highscores \
     -H 'content-type: application/json' \
     -d '{"name": "ann", "score": 5500, "round": 2}'
# 201 {"rank": 1, "scores": [...]}   rank is null if the score didn't make the table
```

Validation (422 on failure):
- `name`: 1–12 characters of letters, digits, space, `.`, `-` or `_`, with
  surrounding whitespace trimmed
- `score`: 0 to 10,000,000
- `round`: at least 1

When two scores tie, the earlier one stays ahead.

The table is **in memory**, so it resets when the server restarts. Scores are
also taken on trust: the client reports its own score and nothing checks it.
That's fine for a demo. A real leaderboard would need the server to verify
scores, for example by replaying the seed and the recorded shots through the
same deterministic wasm.

## Measured

| Artifact | Raw | Gzip | Brotli |
|----------|-----|------|--------|
| `duckhunt.wasm` | 5,468 B | 2,871 B | 2,692 B |
| `dist/assets/index-*.js` (React + app) | 228,933 B | 71,321 B | — |

**The engine is about 4% of what the browser downloads.** React and ReactDOM
make up almost all of the JS bundle. As in `wasm/experiments/010_mastermind_web`,
moving the logic to WASM isn't what decides the payload size. Here it's the UI
framework.

**The `abort` import stays even with `--noAssert`.** Mastermind got to zero
imports by using only scalar counters. This engine keeps its duck state in
`StaticArray`s, and indexing those is bounds-checked whether or not asserts
are enabled. Building with `--noAssert` produced a **byte-identical** binary
that still imports `env.abort`. Removing it would mean unrolling the two-duck
state into separate globals or using `unchecked()` indexing. Neither is worth
it for one small import the host has to provide anyway.

## What this builds on

- `wasm/experiments/010_mastermind_web`: the same "pure logic in WASM, UI in
  the browser" split. Mastermind's ABI is a single stateless function. This
  engine keeps state between calls and runs every frame, so the ABI is a
  handful of verbs plus read-only getters.
- `wasm/experiments/016_ffi_assemblyscript`: AssemblyScript calling host
  functions. That experiment also notes that array indexing is what pulls in
  the `abort` import, which matches what was measured here. Duck Hunt goes
  the other way: `abort` is its only host import, and all data flows out
  through exports.
