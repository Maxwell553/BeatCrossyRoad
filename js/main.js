import { createWorld, DT, HOP_STEPS, update } from "./sim.js";
import { chooseAfter, chooseBefore } from "./bot.js";
import { VIEW_W, VIEW_H, createView, draw, pushEvents } from "./render.js?v=lanes3";
import { isMuted, play, setMuted } from "./audio.js";

const ANIMATION_SEED = 23;
const BEST_KEY = "crossy-best";

const menu = document.getElementById("menu");
const gameover = document.getElementById("gameover");
const pad = document.getElementById("pad");
const back = document.getElementById("back");
const mute = document.getElementById("mute");
const lede = document.getElementById("lede");
const colB = document.getElementById("col-b");
const titleA = document.getElementById("title-a");
const canvasA = document.getElementById("cv-a");
const canvasB = document.getElementById("cv-b");

let character = "chicken";
let sessions = [];
let humanSession = null;

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  } catch {
    return 0;
  }
}

function remember(score) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* ignore private mode */
  }
  const line = document.getElementById("best-line");
  if (line) line.textContent = `Best ${score}`;
}

function prepare(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(VIEW_W * dpr);
  canvas.height = Math.round(VIEW_H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

class Session {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.ctx = prepare(canvas);
    this.mode = options.mode;
    this.seed = options.seed;
    this.title = options.title || "";
    this.follow = options.follow ?? 3.7;
    this.autoRestart = options.autoRestart ?? false;
    this.character = options.character || character;
    this.world = createWorld(this.seed);
    if (options.eagle === false) this.world.eagle = false;
    this.view = createView(this.world, this.follow);
    this.view.character = this.character;
    this.lock = 0;
    this.buffer = null;
    this.acc = 0;
    this.deaths = 0;
    this.deathHold = 0;
    this.countedDeath = false;
    this.best = loadBest();
    this.bestAtStart = this.best;
    this.hint = this.mode === "human";
  }

  restart(seed = this.seed) {
    this.seed = seed;
    this.world = createWorld(seed);
    this.view = createView(this.world, this.follow);
    this.view.character = this.character;
    this.lock = 0;
    this.acc = 0;
    this.deathHold = 0;
    this.countedDeath = false;
    this.buffer = null;
    this.hint = this.mode === "human";
    this.bestAtStart = this.best;
  }

  decide() {
    if (this.mode === "after") return chooseAfter(this.world);
    if (this.mode === "before") return chooseBefore(this.world);
    const action = this.buffer;
    this.buffer = null;
    return action;
  }

  step(dt) {
    this.acc += dt;
    let guard = 0;
    while (this.acc >= DT && this.world.player.alive && guard < 6) {
      this.acc -= DT;
      guard += 1;
      if (this.mode === "preview") {
        update(this.world, DT, null);
      } else if (this.lock > 0) {
        this.lock -= 1;
        update(this.world, DT, null);
      } else {
        const action = this.decide();
        const beforeHop = this.world.player.hop;
        update(this.world, DT, action);
        const started = this.world.player.hop && !beforeHop;
        if (this.mode !== "human" || started) this.lock = HOP_STEPS - 1;
      }
      this.react();
    }
  }

  react() {
    for (const event of this.world.events) {
      if (this.mode === "human") {
        if (event.type === "hop") play("hop");
        else if (event.type === "coin") play("coin");
        else if (event.type === "death") play(event.reason === "train" ? "train" : "death");
      } else if (event.type === "death") {
        play(event.reason === "train" ? "train" : "death");
      }
    }
    pushEvents(this.view, this.world, this.world.events);
    const player = this.world.player;
    if (this.mode === "human" && player.maxRow > this.best) {
      this.best = player.maxRow;
      remember(this.best);
    }
  }

  frame(dt) {
    const capped = Math.min(dt, 0.05);
    if (!this.world.player.alive && this.autoRestart) {
      this.deathHold += capped;
      if (this.deathHold > 1.3) this.restart();
    }
    if (this.world.player.alive) this.step(capped);

    const player = this.world.player;
    if (!player.alive && !this.countedDeath) {
      this.countedDeath = true;
      this.deaths += 1;
      if (this.mode === "human") showGameOver(this);
    }

    const target = player.rowF - this.follow;
    const blend = 1 - Math.pow(0.0015, capped);
    this.view.cam += (target - this.view.cam) * blend;

    const rate = this.world.t > 0.25 ? (player.maxRow / this.world.t).toFixed(1) : "0.0";
    const bot = this.mode === "before" || this.mode === "after";
    draw(this.ctx, this.world, this.view, capped, {
      title: this.title,
      extra: bot ? `${this.deaths} ${this.deaths === 1 ? "death" : "deaths"} · ${rate} rows/s` : "",
      best: this.mode === "human" ? this.best : null,
      hint: this.hint && player.alive && player.maxRow === 0 && !player.hop,
      quiet: this.mode === "preview",
    });
  }
}

function showMenu() {
  humanSession = null;
  menu.classList.remove("hidden");
  gameover.classList.add("hidden");
  pad.classList.remove("visible");
  back.classList.add("hidden");
  lede.classList.add("hidden");
  colB.classList.add("hidden");
  titleA.classList.add("hidden");
  document.body.classList.remove("compare");
  sessions = [new Session(canvasA, { mode: "preview", seed: ANIMATION_SEED, follow: 7.2, eagle: false })];
}

function showGameOver(session) {
  const player = session.world.player;
  const titles = {
    car: "Splat!",
    splash: "You fell in!",
    train: "The train got you!",
    eagle: "The eagle got you!",
    boundary: "You drifted off the map!",
  };
  document.getElementById("go-title").textContent = titles[player.death] || "Ouch!";
  document.getElementById("go-score").textContent = String(player.maxRow);
  const fresh = player.maxRow > session.bestAtStart;
  document.getElementById("go-kicker").textContent = fresh ? "New best" : "Run over";
  const coinWord = player.coins === 1 ? "coin" : "coins";
  document.getElementById("go-detail").textContent = `${player.coins} ${coinWord} · seed ${session.seed}`;
  gameover.classList.remove("hidden");
  pad.classList.remove("visible");
}

function startHuman(seed = (Math.random() * 1e9) >>> 0) {
  humanSession = new Session(canvasA, {
    mode: "human",
    seed,
    character,
    follow: 3.7,
  });
  sessions = [humanSession];
  menu.classList.add("hidden");
  gameover.classList.add("hidden");
  back.classList.remove("hidden");
  pad.classList.add("visible");
  lede.classList.add("hidden");
  colB.classList.add("hidden");
  titleA.classList.add("hidden");
  document.body.classList.remove("compare");
}

function startWatch(kind) {
  menu.classList.add("hidden");
  gameover.classList.add("hidden");
  pad.classList.remove("visible");
  back.classList.remove("hidden");
  humanSession = null;
  if (kind === "compare") {
    document.body.classList.add("compare");
    lede.classList.remove("hidden");
    colB.classList.remove("hidden");
    titleA.classList.remove("hidden");
    titleA.textContent = "Before";
    sessions = [
      new Session(canvasA, {
        mode: "before",
        seed: ANIMATION_SEED,
        title: "BEFORE",
        autoRestart: true,
        follow: 3.7,
      }),
      new Session(canvasB, {
        mode: "after",
        seed: ANIMATION_SEED,
        title: "AFTER",
        follow: 3.7,
      }),
    ];
    return;
  }
  document.body.classList.remove("compare");
  lede.classList.add("hidden");
  colB.classList.add("hidden");
  titleA.classList.remove("hidden");
  titleA.textContent = kind === "after" ? "After" : "Before";
  sessions = [
    new Session(canvasA, {
      mode: kind,
      seed: ANIMATION_SEED,
      title: kind === "after" ? "AFTER" : "BEFORE",
      autoRestart: kind === "before",
      follow: 3.7,
    }),
  ];
}

document.getElementById("chars").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  character = button.dataset.character;
  for (const candidate of document.querySelectorAll("#chars button")) {
    candidate.classList.toggle("selected", candidate === button);
  }
  if (sessions[0]?.mode === "preview") sessions[0].view.character = character;
});

document.getElementById("play").addEventListener("click", () => startHuman());
document.getElementById("watch-before").addEventListener("click", () => startWatch("before"));
document.getElementById("watch-after").addEventListener("click", () => startWatch("after"));
document.getElementById("watch-both").addEventListener("click", () => startWatch("compare"));
document.getElementById("retry").addEventListener("click", () => {
  if (!humanSession) return startHuman();
  const seed = humanSession.seed;
  startHuman(seed);
});
document.getElementById("new-run").addEventListener("click", () => startHuman());
document.getElementById("to-menu").addEventListener("click", showMenu);
back.addEventListener("click", showMenu);

function syncMute() {
  mute.textContent = isMuted() ? "Muted" : "Sound";
}
mute.addEventListener("click", () => {
  setMuted(!isMuted());
  syncMute();
  if (!isMuted()) play("hop");
});
syncMute();

pad.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("button");
  if (!button || !humanSession?.world.player.alive) return;
  event.preventDefault();
  humanSession.buffer = button.dataset.dir;
});

const keys = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyA: "left",
  KeyS: "down",
  KeyD: "right",
  Space: "up",
  " ": "up",
};
window.addEventListener("keydown", (event) => {
  const action = keys[event.code] || keys[event.key];
  if (!action || !humanSession?.world.player.alive) return;
  event.preventDefault();
  humanSession.buffer = action;
});

let pointer = null;
canvasA.addEventListener("pointerdown", (event) => {
  if (!humanSession?.world.player.alive) return;
  if (event.target !== canvasA) return;
  pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
  canvasA.setPointerCapture(event.pointerId);
});
canvasA.addEventListener("pointerup", (event) => {
  if (!pointer || pointer.id !== event.pointerId || !humanSession?.world.player.alive) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer = null;
  if (Math.hypot(dx, dy) < 18) humanSession.buffer = "up";
  else if (Math.abs(dx) > Math.abs(dy)) humanSession.buffer = dx > 0 ? "right" : "left";
  else humanSession.buffer = dy > 0 ? "down" : "up";
});
canvasA.addEventListener("pointercancel", () => {
  pointer = null;
});

window.addEventListener("resize", () => {
  for (const session of sessions) session.ctx = prepare(session.canvas);
});

remember(loadBest());
const watch = new URLSearchParams(location.search).get("watch");
if (watch === "before" || watch === "after" || watch === "compare") startWatch(watch);
else showMenu();

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!window.__recording) {
    for (const session of sessions) session.frame(dt);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__crossy = {
  state() {
    return sessions.map((session) => ({
      mode: session.mode,
      score: session.world.player.maxRow,
      alive: session.world.player.alive,
      death: session.world.player.death,
      deaths: session.deaths,
      coins: session.world.player.coins,
      t: Number(session.world.t.toFixed(2)),
      row: session.world.player.row,
      x: Number(session.world.player.x.toFixed(2)),
    }));
  },
  async record(name, ms = 12000, untilT = 0) {
    window.__recording = true;
    try {
      for (const session of sessions) {
        if (session.mode === "before" || session.mode === "after") {
          session.deaths = 0;
          session.restart();
        }
      }
      const wide = sessions.length > 1;
      const canvas = document.createElement("canvas");
      canvas.width = wide ? 900 : 420;
      canvas.height = 760;
      const ctx = canvas.getContext("2d");
      const paint = () => {
        ctx.fillStyle = "#9fd8ef";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (wide) {
          ctx.drawImage(sessions[0].canvas, 10, 0, 420, 760);
          ctx.drawImage(sessions[1].canvas, 470, 0, 420, 760);
        } else {
          ctx.drawImage(sessions[0].canvas, 0, 0, 420, 760);
        }
      };
      const fps = 24;
      const frameDt = 1 / fps;
      const maxFrames = Math.ceil(((ms + 25000) / 1000) * fps);
      let frames = 0;
      let reason = "timeout";
      for (let i = 0; i < maxFrames; i++) {
        for (const session of sessions) session.frame(frameDt);
        paint();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
        const index = String(i).padStart(5, "0");
        const response = await fetch(`http://127.0.0.1:8766/frame/${name}/${index}.jpg`, { method: "POST", body: blob });
        if (!response.ok && response.status !== 204) throw new Error(`save failed ${response.status}`);
        frames += 1;
        const simTime = Math.min(...sessions.map((session) => session.world.t));
        const before = sessions.find((session) => session.mode === "before");
        const crashOnScreen = before && before.deaths > 0 && !before.world.player.alive && before.deathHold > 0.75;
        if (crashOnScreen) reason = "crash";
        else if ((i / fps) * 1000 >= ms && simTime >= untilT) reason = "sim";
        else reason = "";
        if (reason) break;
      }
      window.__recordStop = {
        reason: reason || "timeout",
        frames,
        simTime: Math.min(...sessions.map((session) => session.world.t)),
        untilT,
        ms,
      };
      return { name, frames, state: this.state(), stop: window.__recordStop };
    } finally {
      window.__recording = false;
    }
  },
};
