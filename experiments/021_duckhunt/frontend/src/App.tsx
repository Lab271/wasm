import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { fetchHighScores, submitHighScore, type HighScore } from "./api";
import { playQuack, playShot } from "./audio";
import { loadEngine, Phase, type Engine } from "./engine";
import { drawScene, HEIGHT, WIDTH, type View } from "./render";

type Status = "loading" | "ready" | "error";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const viewRef = useRef<View>({ time: 0, mouseX: -100, mouseY: -100, flash: 0 });
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<number>(Phase.Ready);
  const [scores, setScores] = useState<HighScore[] | null>(null);

  const refreshScores = useCallback(() => {
    fetchHighScores()
      .then(setScores)
      .catch(() => setScores(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadEngine()
      .then((engine) => {
        if (cancelled) return;
        engine.init(WIDTH, HEIGHT, (Math.random() * 0xffffffff) >>> 0);
        engineRef.current = engine;
        setStatus("ready");
      })
      .catch((err: unknown) => {
        setError(String(err));
        setStatus("error");
      });
    refreshScores();
    return () => {
      cancelled = true;
    };
  }, [refreshScores]);

  // Game loop: step the wasm engine, redraw, and surface phase changes to React.
  useEffect(() => {
    const engine = engineRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (status !== "ready" || !engine || !ctx) return;

    let raf = 0;
    let last = performance.now();
    let lastPhase = -1;
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const view = viewRef.current;
      engine.update(dt);
      view.time += dt;
      view.flash = Math.max(0, view.flash - dt * 8);
      drawScene(ctx, engine, view);

      const p = engine.getPhase();
      if (p !== lastPhase) {
        lastPhase = p;
        setPhase(p);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const toLogical = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * WIDTH) / rect.width,
      y: ((e.clientY - rect.top) * HEIGHT) / rect.height,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toLogical(e);
    viewRef.current.mouseX = x;
    viewRef.current.mouseY = y;
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    onPointerMove(e);
    const { x, y } = toLogical(e);
    const hit = engine.shoot(x, y);
    if (hit === -2) return;
    playShot();
    viewRef.current.flash = 1;
    if (hit >= 0) playQuack();
  };

  const start = () => engineRef.current?.start();
  const engine = engineRef.current;

  return (
    <main className="app">
      <h1>DUCK HUNT</h1>
      <div className="stage">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
        />
        {status === "loading" && <div className="overlay">Loading…</div>}
        {status === "error" && (
          <div className="overlay">
            <p>Could not load the game engine.</p>
            <p className="muted">{error}</p>
          </div>
        )}
        {status === "ready" && engine && phase === Phase.Ready && (
          <div className="overlay">
            <p>Shoot the ducks before they fly away.</p>
            <p className="muted">3 shots per pair · hit the quota to advance</p>
            <button onClick={start}>START</button>
            <ScoreTable scores={scores} />
          </div>
        )}
        {status === "ready" && engine && phase === Phase.GameOver && (
          <GameOver engine={engine} scores={scores} onSubmitted={setScores} onRestart={start} />
        )}
      </div>
    </main>
  );
}

interface GameOverProps {
  engine: Engine;
  scores: HighScore[] | null;
  onSubmitted: (scores: HighScore[]) => void;
  onRestart: () => void;
}

function GameOver({ engine, scores, onSubmitted, onRestart }: GameOverProps) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const score = engine.getScore();
  const round = engine.getRound();
  const shots = engine.getShotsFired();
  const accuracy = shots ? Math.round((engine.getTotalHits() / shots) * 100) : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await submitHighScore({ name: name.trim(), score, round });
      onSubmitted(result.scores);
      setMessage(result.rank ? `You placed #${result.rank}!` : "Not quite a high score.");
      setSubmitted(true);
    } catch {
      setMessage("Could not reach the score server.");
    }
  };

  return (
    <div className="overlay">
      <h2>GAME OVER</h2>
      <p>
        Score {score} · Round {round} · Accuracy {accuracy}%
      </p>
      {!submitted && (
        <form onSubmit={submit}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            placeholder="YOUR NAME"
            aria-label="Your name"
            autoFocus
          />
          <button type="submit" disabled={!name.trim()}>
            SAVE
          </button>
        </form>
      )}
      {message && <p className="muted">{message}</p>}
      <button onClick={onRestart}>PLAY AGAIN</button>
      <ScoreTable scores={scores} />
    </div>
  );
}

function ScoreTable({ scores }: { scores: HighScore[] | null }) {
  if (scores === null) return <p className="muted">High scores unavailable</p>;
  if (scores.length === 0) return <p className="muted">No high scores yet</p>;
  return (
    <table className="scores">
      <tbody>
        {scores.map((s, i) => (
          <tr key={i}>
            <td>{i + 1}.</td>
            <td>{s.name}</td>
            <td>{s.score}</td>
            <td>R{s.round}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
