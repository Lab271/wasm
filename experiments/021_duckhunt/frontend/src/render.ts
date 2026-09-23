// Canvas renderer: draws the scene purely from engine state.

import { DuckState, Phase, Result, type Engine } from "./engine";

export const WIDTH = 800;
export const HEIGHT = 600;

export interface View {
  time: number;
  mouseX: number;
  mouseY: number;
  flash: number;
}

const FONT = '"Press Start 2P", ui-monospace, monospace';

export function drawScene(ctx: CanvasRenderingContext2D, engine: Engine, view: View): void {
  const groundY = engine.getGroundY();

  drawSky(ctx, view.time);
  drawTree(ctx, groundY);
  for (let i = 0; i < engine.getDuckCount(); i++) drawDuckAt(ctx, engine, i);
  drawGround(ctx, groundY);
  drawHud(ctx, engine, groundY);
  drawMessage(ctx, engine);
  drawCrosshair(ctx, view.mouseX, view.mouseY);

  if (view.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, view.flash) * 0.6})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

function drawSky(ctx: CanvasRenderingContext2D, time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#4f9df0");
  sky.addColorStop(1, "#bfe3ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const clouds: [number, number, number][] = [
    [120, 90, 1],
    [460, 60, 1.3],
    [690, 150, 0.9],
  ];
  for (const [x0, y, s] of clouds) {
    const x = ((x0 + time * 8 * s) % (WIDTH + 200)) - 100;
    cloud(ctx, x, y, s);
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 22 * s, 0, Math.PI * 2);
  ctx.arc(x + 26 * s, y - 10 * s, 28 * s, 0, Math.PI * 2);
  ctx.arc(x + 56 * s, y, 22 * s, 0, Math.PI * 2);
  ctx.rect(x, y, 56 * s, 22 * s);
  ctx.fill();
}

function drawTree(ctx: CanvasRenderingContext2D, groundY: number): void {
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(92, groundY - 190, 26, 190);
  ctx.fillStyle = "#2e8b3a";
  for (const [x, y, r] of [
    [105, groundY - 230, 58],
    [65, groundY - 185, 42],
    [148, groundY - 180, 46],
    [105, groundY - 160, 40],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround(ctx: CanvasRenderingContext2D, groundY: number): void {
  // Bushy grass edge that ducks rise from behind.
  ctx.fillStyle = "#3aa641";
  ctx.beginPath();
  ctx.moveTo(0, HEIGHT);
  ctx.lineTo(0, groundY);
  for (let x = 0; x <= WIDTH; x += 40) {
    ctx.quadraticCurveTo(x + 20, groundY - 28 - ((x * 7) % 18), x + 40, groundY);
  }
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#8a5a2b";
  ctx.fillRect(0, groundY + 40, WIDTH, HEIGHT - groundY - 40);
}

function drawDuckAt(ctx: CanvasRenderingContext2D, engine: Engine, i: number): void {
  const state = engine.getDuckState(i);
  if (state === DuckState.Done) return;
  const facing = engine.getDuckVX(i) < 0 ? -1 : 1;
  drawDuck(ctx, engine.getDuckX(i), engine.getDuckY(i), facing, engine.getDuckFlap(i), state);
}

function drawDuck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  flap: number,
  state: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  if (state === DuckState.Falling) ctx.rotate(Math.PI / 2);

  // Tail
  ctx.fillStyle = "#3b2a1a";
  ctx.beginPath();
  ctx.moveTo(-20, -4);
  ctx.lineTo(-32, -10);
  ctx.lineTo(-30, 4);
  ctx.closePath();
  ctx.fill();

  // Body and belly
  ctx.fillStyle = "#6b4a2b";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d9c9a3";
  ctx.beginPath();
  ctx.ellipse(3, 5, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head, collar, beak
  ctx.fillStyle = "#1f6b3a";
  ctx.beginPath();
  ctx.arc(19, -12, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillRect(13, -6, 10, 3);
  ctx.fillStyle = "#f2a516";
  ctx.beginPath();
  ctx.moveTo(26, -14);
  ctx.lineTo(37, -11);
  ctx.lineTo(26, -8);
  ctx.closePath();
  ctx.fill();

  // Eye: an X once shot
  if (state === DuckState.Hit || state === DuckState.Falling) {
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, -17);
    ctx.lineTo(23, -12);
    ctx.moveTo(23, -17);
    ctx.lineTo(18, -12);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(21, -14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(22, -14, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Wing: flaps while flying, spread when hit, folded when falling
  let wingAngle = Math.sin(flap * Math.PI * 2) * 0.9;
  if (state === DuckState.Hit) wingAngle = -1.2;
  if (state === DuckState.Falling) wingAngle = 0.2;
  ctx.save();
  ctx.translate(-2, -5);
  ctx.rotate(wingAngle);
  ctx.fillStyle = "#4a3320";
  ctx.beginPath();
  ctx.ellipse(-8, -6, 16, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3b5fc0";
  ctx.fillRect(-14, -6, 8, 3);
  ctx.restore();

  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, engine: Engine, groundY: number): void {
  const top = groundY + 56;
  ctx.font = `12px ${FONT}`;
  ctx.textBaseline = "top";

  // Round
  panel(ctx, 20, top, 90, 58);
  ctx.fillStyle = "#9ef01a";
  ctx.fillText(`R=${engine.getRound()}`, 32, top + 22);

  // Shots left
  panel(ctx, 124, top, 100, 58);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < engine.getAmmo() ? "#f2a516" : "#333";
    ctx.fillRect(140 + i * 24, top + 10, 12, 22);
  }
  ctx.fillStyle = "#4fc3f7";
  ctx.fillText("SHOT", 150, top + 40);

  // Per-duck hit markers plus the round's quota
  panel(ctx, 238, top, 360, 58);
  ctx.fillStyle = "#9ef01a";
  ctx.fillText("HIT", 250, top + 10);
  const n = engine.getDucksPerRound();
  for (let i = 0; i < n; i++) {
    const r = engine.getResult(i);
    ctx.fillStyle = r === Result.Hit ? "#e53935" : r === Result.Miss ? "#555" : "#fff";
    miniDuck(ctx, 310 + i * 27, top + 16);
  }
  ctx.fillStyle = "#4fc3f7";
  ctx.fillRect(304, top + 38, engine.requiredHits() * 27, 4);
  ctx.fillStyle = "#fff";
  ctx.fillText(`${engine.getRoundHits()}/${engine.requiredHits()}`, 310, top + 44);

  // Score
  panel(ctx, 612, top, 168, 58);
  ctx.fillStyle = "#fff";
  ctx.fillText(String(engine.getScore()).padStart(6, "0"), 632, top + 12);
  ctx.fillText("SCORE", 652, top + 36);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "#111";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#9ef01a";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function miniDuck(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 9, 6, 0, 0, Math.PI * 2);
  ctx.arc(x + 7, y - 3, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawMessage(ctx: CanvasRenderingContext2D, engine: Engine): void {
  let text = "";
  const phase = engine.getPhase();
  if (phase === Phase.WaveEnd) {
    const base = engine.getWave() * engine.getDuckCount();
    for (let i = 0; i < engine.getDuckCount(); i++) {
      if (engine.getResult(base + i) === Result.Miss) text = "FLY AWAY!";
    }
  } else if (phase === Phase.RoundEnd) {
    text = engine.getRoundHits() === engine.getDucksPerRound() ? "PERFECT!" : "ROUND CLEAR!";
  }
  if (!text) return;

  ctx.font = `24px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 48;
  ctx.fillStyle = "#111";
  ctx.fillRect(WIDTH / 2 - w / 2, 190, w, 64);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, WIDTH / 2, 223);
  ctx.textAlign = "start";
}

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = "#e53935";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.moveTo(x - 24, y);
  ctx.lineTo(x - 6, y);
  ctx.moveTo(x + 6, y);
  ctx.lineTo(x + 24, y);
  ctx.moveTo(x, y - 24);
  ctx.lineTo(x, y - 6);
  ctx.moveTo(x, y + 6);
  ctx.lineTo(x, y + 24);
  ctx.stroke();
}
