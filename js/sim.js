// Deterministic Crossy Road-style simulation.
// Row geometry is a pure function of (seed, index, time), so a bot can
// preview the future by stepping a clone of the world.

export const COLS = 11;
export const DT = 1 / 60;
export const HOP_STEPS = 8;
export const HOP_TIME = DT * HOP_STEPS;
export const EAGLE_TIME = 8;
export const PLAYER_HALF = 0.34;

const PATTERN = [
  "road", "road", "grass",
  "road", "road", "road", "grass",
  "river", "river", "grass",
  "road", "grass",
  "rail", "grass",
  "road", "road", "grass",
  "river", "grass",
  "road", "road", "road", "grass", "grass",
  "river", "river", "grass",
  "rail", "grass",
];

export const CAR_COLORS = [
  "#E53935", "#1E88E5", "#FDD835", "#8E24AA",
  "#FB8C00", "#00ACC1", "#43A047", "#F06292",
  "#5E35B1", "#00897B",
];

function hash(a, b) {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0x165667b1, 0xc2b2ae35);
  x = Math.imul(x ^ (x >>> 13), 0x5bd1e995);
  return (x ^ (x >>> 16)) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(x, period) {
  return ((x % period) + period) % period;
}

export function createWorld(seed = 1) {
  return {
    seed: seed >>> 0,
    t: 0,
    rows: new Map(),
    collected: new Set(),
    events: [],
    eagle: true,
    player: {
      x: 5,
      row: 0,
      rowF: 0,
      hop: null,
      alive: true,
      death: null,
      maxRow: 0,
      coins: 0,
      idle: 0,
      riding: false,
      rideVx: 0,
    },
  };
}

export function cloneWorld(world) {
  const p = world.player;
  return {
    seed: world.seed,
    t: world.t,
    rows: world.rows,
    collected: new Set(world.collected),
    events: [],
    eagle: world.eagle,
    player: {
      x: p.x,
      row: p.row,
      rowF: p.rowF,
      hop: p.hop ? { ...p.hop } : null,
      alive: p.alive,
      death: p.death,
      maxRow: p.maxRow,
      coins: p.coins,
      idle: p.idle,
      riding: p.riding,
      rideVx: p.rideVx,
    },
  };
}

function rowType(index) {
  if (index < 3) return "grass";
  return PATTERN[(index - 3) % PATTERN.length];
}

// Farther lanes are faster and denser, the way Crossy Road ramps the run.
function difficulty(index) {
  return Math.min(1, Math.max(0, index) / 170);
}

export function getRow(world, index) {
  if (world.rows.has(index)) return world.rows.get(index);
  const row = makeRow(world.seed, index);
  world.rows.set(index, row);
  return row;
}

function makeRow(seed, index) {
  const type = index < 0 ? "grass" : rowType(index);
  const rng = mulberry32(hash(seed, index + 17));
  const direction = index % 2 === 0 ? 1 : -1;
  const base = { index, type, direction };

  if (type === "grass") {
    const trees = [];
    const count = index <= 0 ? 0 : index < 3 ? 2 : 2 + Math.floor(rng() * 3);
    let guard = 0;
    while (trees.length < count && guard < 40) {
      const x = Math.floor(rng() * COLS);
      guard += 1;
      if (index < 3 && x === 5) continue;
      if (trees.some((tree) => tree.x === x)) continue;
      trees.push({ x, variant: Math.floor(rng() * 3) });
    }
    const flowers = [];
    for (let x = 0; x < COLS; x++) {
      if (trees.some((tree) => tree.x === x)) continue;
      if (rng() < 0.18) flowers.push({ x, hue: rng() });
    }
    const coins = [];
    if (index > 0) {
      for (let x = 0; x < COLS; x++) {
        if (trees.some((tree) => tree.x === x)) continue;
        if (rng() < 0.12) coins.push(x);
      }
    }
    return { ...base, trees, flowers, coins };
  }

  if (type === "road") {
    const hard = difficulty(index);
    const count = hard < 0.45 ? 2 : 3;
    const speed = 3.15 + rng() * 0.7 + hard * 5.1;
    const vehicles = [];
    let cursor = 0.3;
    for (let i = 0; i < count; i++) {
      const long = rng() < 0.4;
      const length = long ? 2.05 + rng() * 0.35 : 1.35 + rng() * 0.25;
      const gap = 2.8 + speed * 0.38 + rng() * 0.4;
      vehicles.push({
        offset: cursor,
        length,
        color: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)],
        kind: length > 1.9 ? "truck" : "car",
      });
      cursor += length + gap;
    }
    const period = cursor + 0.4;
    return { ...base, period, speed, vehicles };
  }

  if (type === "river") {
    const hard = difficulty(index);
    const period = 18 - hard * 3;
    const speed = 0.85 + rng() * 0.3 + hard * 1.15;
    const length = 3.7 - hard * 0.55;
    const logs = [0, 1, 2].map((i) => ({
      offset: 0.4 + i * (period / 3),
      length: length - i * 0.08,
    }));
    return { ...base, period, speed, logs };
  }

  const hard = difficulty(index);
  const length = 12 + Math.round(hard * 6);
  const speed = 15 + hard * 12;
  const warning = 1.75 - hard * 0.4;
  const travel = COLS + length + 1;
  const duration = travel / speed;
  const period = warning + duration + Math.max(1.8, 5.2 - hard * 2.6);
  return {
    ...base,
    period,
    warning,
    duration,
    length,
    speed,
    phase: rng() * period,
  };
}

export function isTree(world, x, row) {
  if (row < 0 || x < 0 || x > COLS - 1) return true;
  const data = getRow(world, row);
  if (data.type !== "grass") return false;
  return data.trees.some((tree) => tree.x === x);
}

function trainCycle(row, t) {
  return wrap(t + row.phase, row.period);
}

export function trainState(row, t) {
  const cycle = trainCycle(row, t);
  const activeStart = row.period - row.duration;
  const warnStart = activeStart - row.warning;
  if (cycle >= activeStart) return "active";
  if (cycle >= warnStart) return "warning";
  return "clear";
}

// The train drives in from one side and out the other. Only the cars
// overlapping the player are lethal, so it has to actually reach you.
export function trainSpan(row, t) {
  const cycle = trainCycle(row, t);
  const activeStart = row.period - row.duration;
  if (cycle < activeStart) return null;
  const progress = (cycle - activeStart) / row.duration;
  const travel = COLS + row.length + 1;
  const nose = row.direction === 1 ? -0.5 + progress * travel : COLS + 0.5 - progress * travel;
  const tail = nose - row.direction * row.length;
  return { start: Math.min(nose, tail), end: Math.max(nose, tail), nose, direction: row.direction };
}

function segments(offset, length, direction, speed, period, t) {
  const x = wrap(offset + direction * speed * t, period);
  return [0, -period, period].map((shift) => ({ start: x + shift, end: x + shift + length }));
}

export function vehicleHits(row, x, t, half = PLAYER_HALF) {
  const left = x - half;
  const right = x + half;
  for (const car of row.vehicles) {
    for (const seg of segments(car.offset, car.length, row.direction, row.speed, row.period, t)) {
      if (right > seg.start && left < seg.end) return true;
    }
  }
  return false;
}

export function logUnder(row, x, t) {
  const vx = row.direction * row.speed;
  for (let i = 0; i < row.logs.length; i++) {
    const log = row.logs[i];
    for (const seg of segments(log.offset, log.length, row.direction, row.speed, row.period, t)) {
      if (x >= seg.start + 0.16 && x <= seg.end - 0.16) {
        return { vx, id: i, start: seg.start, end: seg.end };
      }
    }
  }
  return null;
}

export function placedMovers(row, t) {
  if (row.type === "road") {
    return row.vehicles.flatMap((car) =>
      segments(car.offset, car.length, row.direction, row.speed, row.period, t).map((seg) => ({
        ...car,
        x: seg.start,
      })),
    );
  }
  if (row.type === "river") {
    return row.logs.flatMap((log, id) =>
      segments(log.offset, log.length, row.direction, row.speed, row.period, t).map((seg) => ({
        ...log,
        id,
        x: seg.start,
      })),
    );
  }
  return [];
}

function kill(world, reason) {
  const player = world.player;
  if (!player.alive) return;
  player.alive = false;
  player.death = reason;
  player.hop = null;
  player.riding = false;
  world.events.push({ type: "death", reason, x: player.x, row: player.rowF });
}

function nearRows(rowF) {
  const rows = [];
  const low = Math.floor(rowF);
  const high = Math.ceil(rowF);
  if (Math.abs(rowF - low) <= 0.45) rows.push(low);
  if (high !== low && Math.abs(rowF - high) <= 0.45) rows.push(high);
  if (rows.length === 0) rows.push(Math.round(rowF));
  return rows;
}

function checkTraffic(world) {
  const player = world.player;
  for (const index of nearRows(player.rowF)) {
    if (index < 0) continue;
    const row = getRow(world, index);
    if (row.type === "road" && vehicleHits(row, player.x, world.t)) {
      kill(world, "car");
      return;
    }
    if (row.type === "rail") {
      const span = trainSpan(row, world.t);
      if (span && player.x + PLAYER_HALF > span.start && player.x - PLAYER_HALF < span.end) {
        kill(world, "train");
        return;
      }
    }
  }
}

function land(world) {
  const player = world.player;
  if (player.row > player.maxRow) {
    player.maxRow = player.row;
    world.events.push({ type: "score", score: player.maxRow });
  }
  const row = getRow(world, player.row);
  if (row.type === "river") {
    const log = logUnder(row, player.x, world.t);
    if (!log) {
      kill(world, "splash");
      return;
    }
    player.riding = true;
    player.rideVx = log.vx;
  } else {
    player.riding = false;
    player.rideVx = 0;
  }
  if (row.type === "grass" && row.coins.includes(player.x)) {
    const key = `${player.row},${player.x}`;
    if (!world.collected.has(key)) {
      world.collected.add(key);
      player.coins += 1;
      world.events.push({ type: "coin", x: player.x, row: player.row });
    }
  }
}

function tryHop(world, action) {
  const player = world.player;
  const delta = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[action];
  if (!delta) return false;
  const toX = Math.round(player.x) + delta[0];
  const toRow = player.row + delta[1];
  if (toX < 0 || toX > COLS - 1 || toRow < 0) return false;
  if (isTree(world, toX, toRow)) return false;
  player.hop = {
    fromX: player.x,
    fromRow: player.row,
    toX,
    toRow,
    elapsed: 0,
  };
  player.riding = false;
  player.rideVx = 0;
  player.idle = 0;
  world.events.push({ type: "hop" });
  return true;
}

function slide(world, dt) {
  const player = world.player;
  player.x += player.rideVx * dt;
  const row = getRow(world, player.row);
  const log = row.type === "river" ? logUnder(row, player.x, world.t) : null;
  if (!log) {
    kill(world, "splash");
    return;
  }
  player.rideVx = log.vx;
  if (player.x < -0.05 || player.x > COLS - 0.95) kill(world, "boundary");
}

function advanceHop(world, dt) {
  const player = world.player;
  const hop = player.hop;
  const remain = HOP_TIME - hop.elapsed;
  const used = Math.min(dt, remain);
  hop.elapsed += used;
  const k = Math.min(1, hop.elapsed / HOP_TIME);
  player.x = hop.fromX + (hop.toX - hop.fromX) * k;
  player.rowF = hop.fromRow + (hop.toRow - hop.fromRow) * k;
  checkTraffic(world);
  if (!player.alive) return;
  if (hop.elapsed >= HOP_TIME - 1e-8) {
    player.x = hop.toX;
    player.row = hop.toRow;
    player.rowF = hop.toRow;
    player.hop = null;
    land(world);
    const left = dt - used;
    if (left > 1e-8 && player.alive && player.riding) slide(world, left);
  }
}

export function update(world, dt, action = null) {
  if (!world.player.alive) return;
  world.t += dt;
  world.events.length = 0;
  const player = world.player;

  if (player.hop) {
    advanceHop(world, dt);
  } else if (action && action !== "wait") {
    const started = tryHop(world, action);
    if (started) advanceHop(world, dt);
    else if (player.riding) slide(world, dt);
    else checkTraffic(world);
  } else if (player.riding) {
    slide(world, dt);
  } else {
    checkTraffic(world);
  }

  if (!player.alive) return;
  player.idle += dt;
  if (world.eagle !== false && player.idle > EAGLE_TIME) kill(world, "eagle");
}

export function stepControlled(world, action) {
  update(world, DT, action === "wait" || action == null ? null : action);
  for (let i = 1; i < HOP_STEPS; i++) {
    if (!world.player.alive) break;
    update(world, DT, null);
  }
}
