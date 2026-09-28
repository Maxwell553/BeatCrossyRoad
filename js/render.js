import { COLS, EAGLE_TIME, HOP_TIME, getRow, placedMovers, trainSpan, trainState } from "./sim.js";

export const VIEW_W = 420;
export const VIEW_H = 760;

const COL_W = 34;
const LANE = 44;
const SKEW = 10;
const THICK = 9;
const GROUND = VIEW_H * 0.8;

const CHARACTERS = {
  chicken: { body: "#F4F1EE", accent: "#F472B6", beak: "#FF8A3D", feet: "#FF8A65", wing: "#E7E2DC" },
  duck: { body: "#FFE082", accent: "#FFB300", beak: "#FB8C00", feet: "#EF6C00", wing: "#FFD54F" },
  bunny: { body: "#F6E7D8", accent: "#F48FB1", beak: "#F48FB1", feet: "#E7B89A", wing: "#FFF8F2" },
};

export function createView(world, follow = 3.7) {
  return {
    cam: world.player.rowF - follow,
    follow,
    shake: 0,
    flash: 0,
    pop: 0,
    particles: [],
    facing: -1,
    deathAge: 0,
    sawDeath: false,
  };
}

export function pushEvents(view, world, events) {
  for (const event of events) {
    if (event.type === "hop") puff(view, world.player.x, world.player.row, "#FFFFFF", 4);
    else if (event.type === "coin") {
      puff(view, event.x, event.row, "#FFE082", 6);
      view.pop = Math.max(view.pop, 0.35);
    } else if (event.type === "score") view.pop = 1;
    else if (event.type === "death") {
      view.shake = 10;
      view.flash = 1;
      view.sawDeath = true;
      const colors = event.reason === "splash" ? ["#E1F5FE", "#81D4FA", "#FFFFFF"] : ["#FFFFFF", "#FF8A65", "#F48FB1"];
      for (let i = 0; i < 14; i++) {
        view.particles.push({
          x: event.x + (Math.random() - 0.5) * 0.4,
          row: event.row,
          vx: (Math.random() - 0.5) * 3,
          vr: (Math.random() - 0.2) * 2,
          life: 0.55 + Math.random() * 0.35,
          max: 0.9,
          color: colors[i % colors.length],
          r: 3 + Math.random() * 3,
        });
      }
    }
  }
}

function puff(view, x, row, color, n) {
  for (let i = 0; i < n; i++) {
    view.particles.push({
      x,
      row,
      vx: (Math.random() - 0.5) * 1.4,
      vr: Math.random() * 0.5,
      life: 0.25,
      max: 0.35,
      color,
      r: 2 + Math.random() * 2,
    });
  }
}

function project(x, row, h, cam) {
  const dx = x - (COLS - 1) / 2;
  const dz = row - cam;
  return {
    x: VIEW_W / 2 + dx * COL_W + dz * SKEW,
    y: GROUND - dz * LANE - h,
  };
}

function shade(color, amount) {
  let r;
  let g;
  let b;
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const parts = color.match(/\d+/g);
    r = Number(parts[0]);
    g = Number(parts[1]);
    b = Number(parts[2]);
  }
  const channel = (value) => Math.max(0, Math.min(255, value + amount));
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}

function quad(ctx, pts, color) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function box(ctx, x, row, w, d, h, color, cam, base = 0) {
  const top = base + h;
  const a = project(x, row, top, cam);
  const b = project(x + w, row, top, cam);
  const c = project(x + w, row + d, top, cam);
  const dpt = project(x, row + d, top, cam);
  const a0 = project(x, row, base, cam);
  const b0 = project(x + w, row, base, cam);
  const d0 = project(x, row + d, base, cam);
  quad(ctx, [a, dpt, d0, a0], shade(color, -38));
  quad(ctx, [a, b, b0, a0], shade(color, -18));
  quad(ctx, [a, b, c, dpt], shade(color, 24));
}

function shadow(ctx, x, row, rx, ry, cam, alpha = 0.14) {
  const p = project(x, row, 0, cam);
  ctx.fillStyle = `rgba(50, 60, 40, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 6, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function tileHash(x, row) {
  let n = Math.imul((x + 13) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(row + 3, 0xc2b2ae35);
  n = Math.imul(n ^ (n >>> 13), 0x5bd1e995);
  return (n ^ (n >>> 16)) >>> 0;
}

export function draw(ctx, world, view, dt, hud) {
  const player = world.player;
  if (!player.alive) view.deathAge += dt;
  else view.deathAge = 0;
  view.pop = Math.max(0, view.pop - dt * 2.4);
  view.shake = Math.max(0, view.shake - dt * 28);
  view.flash = Math.max(0, view.flash - dt * 1.6);
  for (const particle of view.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.row += particle.vr * dt;
  }
  view.particles = view.particles.filter((particle) => particle.life > 0);
  if (player.hop && player.hop.toX !== player.hop.fromX) {
    view.facing = Math.sign(player.hop.toX - player.hop.fromX) || view.facing;
  }

  ctx.fillStyle = "#7EC8EA";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  if (view.shake > 0) ctx.translate((Math.random() - 0.5) * view.shake, (Math.random() - 0.5) * view.shake);

  const far = Math.ceil(view.cam + (GROUND + 90) / LANE);
  const near = Math.floor(view.cam + (GROUND - VIEW_H - 90) / LANE);
  for (let index = far; index >= near; index--) drawRow(ctx, world, view, index);

  for (const particle of view.particles) {
    const p = project(particle.x, particle.row, 8, view.cam);
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.fillRect(p.x - particle.r / 2, p.y - particle.r / 2, particle.r, particle.r);
    ctx.globalAlpha = 1;
  }
  if (player.alive && player.idle > 5) drawEagleThreat(ctx, world, view);
  ctx.restore();
  if (view.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${view.flash * 0.55})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  drawHud(ctx, world, view, hud);
  if (!player.alive) drawDeath(ctx, player.death);
}

function drawRow(ctx, world, view, index) {
  const row = getRow(world, index);
  const y = project((COLS - 1) / 2, index, 0, view.cam).y;
  if (y < -140 || y > VIEW_H + 140) return;
  drawLane(ctx, row, view.cam);
  if (row.type === "road") drawTraffic(ctx, row, world, view.cam);
  if (row.type === "river") drawLogs(ctx, row, world, view.cam);
  if (row.type === "rail") drawRailProps(ctx, row, world, view.cam);
  if (row.type === "grass") drawGrassProps(ctx, row, world, view.cam);
  if (Math.round(world.player.rowF) === index) drawPlayer(ctx, world, view);
}

function laneColors(row) {
  if (row.type === "road") return { top: "#5C6770", side: "#3C444B" };
  if (row.type === "river") return { top: "#6AD4F6", side: "#2EADD8" };
  if (row.type === "rail") return { top: "#6B5646", side: "#4A3B32" };
  const flip = row.index % 2 === 0;
  return flip ? { top: "#A6DC55", side: "#73B534" } : { top: "#9AD44C", side: "#68A82E" };
}

function laneSpan(rowIndex, cam) {
  const dz = rowIndex - cam;
  const shift = (dz * SKEW) / COL_W;
  const half = VIEW_W / COL_W + 3;
  const mid = (COLS - 1) / 2;
  return { x0: mid - half - shift, x1: mid + half - shift };
}

function drawLane(ctx, row, cam) {
  const colors = laneColors(row);
  const { x0, x1 } = laneSpan(row.index, cam);
  quad(
    ctx,
    [
      project(x0, row.index, 0, cam),
      project(x1, row.index, 0, cam),
      project(x1, row.index + 1, 0, cam),
      project(x0, row.index + 1, 0, cam),
    ],
    colors.side,
  );
  const lip = 0.16;
  quad(
    ctx,
    [
      project(x0, row.index + lip, THICK, cam),
      project(x1, row.index + lip, THICK, cam),
      project(x1, row.index + 1, THICK, cam),
      project(x0, row.index + 1, THICK, cam),
    ],
    colors.top,
  );
  if (row.type === "road") {
    for (let x = Math.floor(x0); x < x1; x += 2) {
      quad(
        ctx,
        [
          project(x + 0.35, row.index + 0.46, THICK + 1, cam),
          project(x + 1.15, row.index + 0.46, THICK + 1, cam),
          project(x + 1.15, row.index + 0.56, THICK + 1, cam),
          project(x + 0.35, row.index + 0.56, THICK + 1, cam),
        ],
        "#ECEFF1",
      );
    }
  }
  if (row.type === "river") {
    for (let x = Math.floor(x0); x < x1; x++) {
      if (tileHash(x, row.index) % 7 !== 0) continue;
      quad(
        ctx,
        [
          project(x + 0.15, row.index + 0.38, THICK + 1, cam),
          project(x + 0.85, row.index + 0.3, THICK + 1, cam),
          project(x + 0.7, row.index + 0.62, THICK + 1, cam),
          project(x + 0.05, row.index + 0.7, THICK + 1, cam),
        ],
        "rgba(255,255,255,0.88)",
      );
    }
  }
}

function drawGrassProps(ctx, row, world, cam) {
  for (const flower of row.flowers || []) {
    if (flower.x < 0 || flower.x >= COLS) continue;
    box(ctx, flower.x + 0.4, row.index + 0.58, 0.14, 0.12, 6, flower.hue > 0.5 ? "#F48FB1" : "#FFE082", cam, THICK);
  }
  for (const tree of row.trees || []) drawTree(ctx, tree.x, row.index, cam, tree.variant);
  for (const coinX of row.coins || []) {
    if (world.collected.has(`${row.index},${coinX}`)) continue;
    drawCoin(ctx, coinX, row.index, cam, world.t);
  }
}

function drawTree(ctx, x, row, cam, variant) {
  const greens = ["#7CB342", "#8BC34A", "#689F38"];
  const color = greens[(variant || 0) % 3];
  const tall = 22 + ((variant || 0) % 3) * 12;
  shadow(ctx, x + 0.5, row + 0.7, 13, 4, cam, 0.12);
  box(ctx, x + 0.34, row + 0.46, 0.32, 0.22, 6, "#A07850", cam, THICK);
  box(ctx, x + 0.06, row + 0.16, 0.88, 0.7, tall, color, cam, THICK + 4);
}

function drawCoin(ctx, x, row, cam, t) {
  const bob = 3 + Math.sin(t * 5 + x) * 1.5;
  shadow(ctx, x + 0.5, row + 0.62, 8, 3, cam, 0.12);
  box(ctx, x + 0.28, row + 0.4, 0.44, 0.28, 5, "#F6C445", cam, THICK + bob);
  const p = project(x + 0.5, row + 0.54, THICK + bob + 6, cam);
  ctx.fillStyle = "#E53935";
  ctx.font = 'bold 11px "Nunito", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("C", p.x, p.y + 1);
}

function drawTraffic(ctx, row, world, cam) {
  for (const car of placedMovers(row, world.t)) {
    const mid = project(car.x + car.length / 2, row.index + 0.5, 0, cam);
    if (mid.x < -80 || mid.x > VIEW_W + 80) continue;
    drawCar(ctx, car, row, cam);
  }
}

function drawCar(ctx, car, row, cam) {
  const y = row.index + 0.2;
  const depth = 0.58;
  const bodyH = 15;
  shadow(ctx, car.x + car.length / 2, y + depth * 0.4, car.length * 12, 5, cam);
  box(ctx, car.x, y, car.length, depth, bodyH, car.color, cam, THICK);
  const cabW = Math.min(car.length * 0.48, 1.05);
  const cabX = row.direction === 1 ? car.x + car.length - cabW - 0.16 : car.x + 0.16;
  box(ctx, cabX, y + 0.1, cabW, depth - 0.18, 9, "#F7F8F6", cam, THICK + bodyH);
  for (const wx of [car.x + 0.12, car.x + car.length - 0.4]) {
    box(ctx, wx, y - 0.06, 0.28, 0.16, 7, "#1B1B1B", cam, THICK - 1);
  }
}

function drawLogs(ctx, row, world, cam) {
  for (const log of placedMovers(row, world.t)) {
    const mid = project(log.x + log.length / 2, row.index + 0.5, 0, cam);
    if (mid.x < -80 || mid.x > VIEW_W + 80) continue;
    shadow(ctx, log.x + log.length / 2, row.index + 0.5, log.length * 11, 4, cam, 0.1);
    box(ctx, log.x, row.index + 0.28, log.length, 0.42, 7, "#8D6E63", cam, THICK + 1);
  }
}

function drawRailProps(ctx, row, world, cam) {
  const state = trainState(row, world.t);
  const { x0, x1 } = laneSpan(row.index, cam);
  for (let x = Math.floor(x0); x < x1; x += 1) {
    box(ctx, x + 0.12, row.index + 0.34, 0.76, 0.06, 2, "#CFD8DC", cam, THICK + 1);
    box(ctx, x + 0.12, row.index + 0.62, 0.76, 0.06, 2, "#CFD8DC", cam, THICK + 1);
  }
  const blink = Math.sin(world.t * 16) > 0;
  const lamp = state === "clear" ? "#546E7A" : blink ? "#FF1744" : "#FF8A80";
  for (const x of [-0.15, COLS - 0.15]) {
    box(ctx, x, row.index + 0.38, 0.22, 0.2, 18, "#455A64", cam, THICK);
    box(ctx, x + 0.04, row.index + 0.42, 0.14, 0.12, 6, lamp, cam, THICK + 18);
  }
  const span = trainSpan(row, world.t);
  if (!span) return;
  const carLen = 2.05;
  const step = carLen + 0.18;
  for (let x = span.start; x < span.end - 0.2; x += step) {
    const len = Math.min(carLen, span.end - x);
    const mid = project(x + len / 2, row.index + 0.5, 0, cam);
    if (mid.x < -90 || mid.x > VIEW_W + 90) continue;
    const engine = row.direction === 1 ? x + len > span.end - step : x < span.start + step;
    box(ctx, x, row.index + 0.14, len, 0.7, 18, "#37474F", cam, THICK + 2);
    box(ctx, x + 0.18, row.index + 0.28, Math.max(0.3, len - 0.36), 0.34, 7, engine ? "#EF5350" : "#B0BEC5", cam, THICK + 14);
  }
}

function drawPlayer(ctx, world, view) {
  const player = world.player;
  if (!player.alive && (player.death === "splash" || player.death === "train")) {
    if (player.death === "splash") {
      const p = project(player.x, player.rowF, THICK, view.cam);
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.85 - view.deathAge)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 8 + view.deathAge * 26, 4 + view.deathAge * 10, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }
  const hop = player.hop ? Math.min(1, player.hop.elapsed / HOP_TIME) : 0;
  const lift = Math.sin(hop * Math.PI) * 22;
  const squash = !player.alive && player.death === "car" ? 0.45 : 1;
  shadow(ctx, player.x, player.rowF + 0.2, 12 - lift / 8, 5, view.cam, 0.2);
  const skin = CHARACTERS[view.character] || CHARACTERS.chicken;
  drawMascot(ctx, player.x, player.rowF, view.cam, view.facing, lift, squash, skin, view.character, player.alive);
  if (!player.alive && player.death === "eagle") {
    drawEagle(ctx, player.x, player.rowF, view.cam, 36 + view.deathAge * 30);
  }
}

function drawMascot(ctx, x, row, cam, facing, lift, squash, skin, id, alive) {
  const base = THICK + lift;
  const s = squash;
  const left = facing < 0;
  const bw = 0.7;
  const bd = 0.5;
  const bx = x - bw / 2;
  const by = row + 0.16;
  const bodyH = 28 * s;

  box(ctx, x - 0.28, row + 0.02, 0.22, 0.2, 5 * s, skin.feet, cam, base);
  box(ctx, x + 0.06, row + 0.02, 0.22, 0.2, 5 * s, skin.feet, cam, base);
  box(ctx, x - 0.22, row + 0.16, 0.12, 0.14, 12 * s, skin.feet, cam, base);
  box(ctx, x + 0.12, row + 0.16, 0.12, 0.14, 12 * s, skin.feet, cam, base);

  box(ctx, bx, by, bw, bd, bodyH, skin.body, cam, base + 10 * s);
  box(ctx, left ? bx - 0.02 : bx + bw - 0.2, by + 0.08, 0.22, 0.36, 14 * s, skin.wing, cam, base + 16 * s);

  if (id === "bunny") {
    box(ctx, x - 0.22, by + 0.16, 0.16, 0.16, 20, skin.body, cam, base + 10 * s + bodyH);
    box(ctx, x + 0.08, by + 0.16, 0.16, 0.16, 20, skin.body, cam, base + 10 * s + bodyH);
    box(ctx, x - 0.16, by + 0.22, 0.06, 0.08, 12, skin.accent, cam, base + 14 * s + bodyH);
    box(ctx, x + 0.12, by + 0.22, 0.06, 0.08, 12, skin.accent, cam, base + 14 * s + bodyH);
  } else if (id === "chicken") {
    box(ctx, x - 0.12, by + 0.22, 0.28, 0.18, 9, skin.accent, cam, base + 10 * s + bodyH);
  }

  const beakX = left ? bx - 0.2 : bx + bw - 0.02;
  box(ctx, beakX, by + 0.02, 0.24, 0.28, 9 * s, skin.beak, cam, base + 20 * s);
  if (id !== "bunny") {
    box(ctx, beakX + (left ? 0.02 : 0.08), by - 0.02, 0.12, 0.16, 8 * s, skin.accent, cam, base + 12 * s);
  }
  box(ctx, left ? bx + 0.08 : bx + bw - 0.2, by - 0.04, 0.1, 0.1, 6, alive ? "#1A1A1A" : "#E53935", cam, base + 26 * s);
}

function drawEagleThreat(ctx, world, view) {
  const player = world.player;
  const u = Math.min(1, (player.idle - 5) / (EAGLE_TIME - 5));
  const angle = world.t * (2 + u * 4);
  const radius = 0.9 * (1.2 - u * 0.45);
  drawEagle(
    ctx,
    player.x + Math.cos(angle) * radius,
    player.rowF + Math.sin(angle) * radius * 0.6,
    view.cam,
    28 + u * 10,
  );
}

function drawEagle(ctx, x, row, cam, h) {
  box(ctx, x - 0.45, row, 0.35, 0.16, 6, "#546E7A", cam, h);
  box(ctx, x + 0.12, row, 0.35, 0.16, 6, "#546E7A", cam, h);
  box(ctx, x - 0.12, row - 0.05, 0.26, 0.28, 12, "#455A64", cam, h);
  box(ctx, x - 0.04, row + 0.16, 0.1, 0.12, 5, "#F9A825", cam, h + 2);
}

function drawHud(ctx, world, view, hud) {
  if (hud.quiet) return;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  const scoreSize = 64 + view.pop * 16;
  if (hud.title) {
    ctx.font = '20px "Lilita One", "Arial Black", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#1B2838";
    ctx.fillStyle = hud.title === "AFTER" ? "#B9F6CA" : "#FFCDD2";
    ctx.strokeText(hud.title, VIEW_W / 2, 34);
    ctx.fillText(hud.title, VIEW_W / 2, 34);
  }
  ctx.font = `${scoreSize}px "Lilita One", "Arial Black", sans-serif`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#1B2838";
  ctx.fillStyle = "#FFFFFF";
  const scoreY = hud.title ? 96 : 78;
  ctx.strokeText(String(world.player.maxRow), VIEW_W / 2, scoreY);
  ctx.fillText(String(world.player.maxRow), VIEW_W / 2, scoreY);
  ctx.font = '16px "Nunito", sans-serif';
  ctx.lineWidth = 4;
  if (hud.extra) {
    ctx.strokeText(hud.extra, VIEW_W / 2, scoreY + 26);
    ctx.fillText(hud.extra, VIEW_W / 2, scoreY + 26);
  } else if (hud.best != null) {
    ctx.strokeText(`BEST ${hud.best}`, VIEW_W / 2, scoreY + 26);
    ctx.fillText(`BEST ${hud.best}`, VIEW_W / 2, scoreY + 26);
  }
  const coinX = VIEW_W - 58;
  const coinY = 36;
  ctx.fillStyle = "#F9A825";
  ctx.fillRect(coinX - 10, coinY - 10, 20, 20);
  ctx.fillStyle = "#E53935";
  ctx.font = 'bold 12px "Nunito", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("C", coinX, coinY + 4);
  ctx.textAlign = "left";
  ctx.font = '22px "Lilita One", "Arial Black", sans-serif';
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#1B2838";
  ctx.fillStyle = "#fff";
  ctx.strokeText(String(world.player.coins), coinX + 16, coinY + 8);
  ctx.fillText(String(world.player.coins), coinX + 16, coinY + 8);
  if (hud.hint && world.player.alive) {
    const bob = Math.sin(world.t * 5) * 4;
    ctx.textAlign = "center";
    ctx.font = '22px "Lilita One", "Arial Black", sans-serif';
    ctx.strokeText("TAP OR SWIPE TO HOP", VIEW_W / 2, VIEW_H - 78 + bob);
    ctx.fillText("TAP OR SWIPE TO HOP", VIEW_W / 2, VIEW_H - 78 + bob);
  }
}

function drawDeath(ctx, reason) {
  const word = { car: "SPLAT!", splash: "SPLASH!", train: "TRAIN!", eagle: "EAGLE!", boundary: "FELL OFF!" }[reason] || "OUCH!";
  ctx.textAlign = "center";
  ctx.font = '64px "Lilita One", "Arial Black", sans-serif';
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#1B2838";
  ctx.fillStyle = "#FFEB3B";
  ctx.strokeText(word, VIEW_W / 2, VIEW_H * 0.46);
  ctx.fillText(word, VIEW_W / 2, VIEW_H * 0.46);
}
