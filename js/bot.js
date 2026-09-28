import { COLS, cloneWorld, getRow, logUnder, stepControlled } from "./sim.js";

const ACTIONS = ["up", "left", "right", "down", "wait"];

function simulate(world, action) {
  const next = cloneWorld(world);
  stepControlled(next, action);
  return next;
}

// One hop of lookahead. It refuses a move that kills it immediately, then
// grabs the biggest score it can see, so it plays for a while and still
// walks into traps it would have noticed with a longer plan.
export function chooseBefore(world) {
  let best = null;
  for (const action of ACTIONS) {
    const next = simulate(world, action);
    if (!next.player.alive) continue;
    const player = next.player;
    const score = player.maxRow * 100 + player.row * 5 - Math.abs(player.x - (COLS - 1) / 2);
    if (!best || score > best.score) best = { action, score };
  }
  return best ? best.action : "up";
}

function heuristic(world) {
  const player = world.player;
  if (!player.alive) return -1e12;
  let score = player.maxRow * 1000 + player.row * 10 + player.coins * 2;
  const edge = Math.min(player.x, COLS - 1 - player.x);
  score += edge * 4;
  score -= player.idle * 3;
  const row = getRow(world, player.row);
  if (row.type === "grass") score += 6;
  if (row.type === "road" || row.type === "rail") score -= 4;
  if (row.type === "river") {
    const log = logUnder(row, player.x, world.t);
    if (log) {
      const mid = (log.start + log.end) / 2;
      score += 8 - Math.abs(player.x - mid) * 2;
    }
  }
  return score;
}

// Beam search over the real rules. Every candidate that dies is dropped, and
// the surviving path with the highest row after a short horizon is taken.
// Replanning every hop keeps the chicken on a route that both scores fast
// and stays alive.
export function chooseAfter(world) {
  const depthLimit = 8;
  const width = 36;
  const startRow = world.player.maxRow;
  let beam = [{ world, first: null, h: heuristic(world) }];

  for (let depth = 0; depth < depthLimit; depth++) {
    const pool = [];
    for (const node of beam) {
      for (const action of ACTIONS) {
        const next = simulate(node.world, action);
        if (!next.player.alive) continue;
        pool.push({
          world: next,
          first: node.first ?? action,
          h: heuristic(next),
        });
      }
    }
    if (pool.length === 0) break;
    pool.sort((a, b) => b.h - a.h);
    const seen = new Set();
    const nextBeam = [];
    for (const item of pool) {
      const player = item.world.player;
      const key = `${player.row}:${player.x.toFixed(1)}:${player.riding ? 1 : 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nextBeam.push(item);
      if (nextBeam.length >= width) break;
    }
    beam = nextBeam;
    if (beam[0].world.player.maxRow >= startRow + depthLimit && beam[0].first) break;
  }

  const ranked = [...beam].sort((a, b) => b.h - a.h);
  for (const node of ranked) {
    if (!node.first) continue;
    const check = simulate(world, node.first);
    if (check.player.alive) return node.first;
  }
  for (const action of ACTIONS) {
    if (simulate(world, action).player.alive) return action;
  }
  return "wait";
}
