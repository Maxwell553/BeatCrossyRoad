import assert from "node:assert/strict";
import { createWorld, stepControlled } from "../js/sim.js";
import { chooseAfter, chooseBefore } from "../js/bot.js";

function run(chooser, seed, seconds) {
  const world = createWorld(seed);
  const start = performance.now();
  let hops = 0;
  while (world.t < seconds && world.player.alive && hops < seconds * 20) {
    const action = chooser(world);
    stepControlled(world, action);
    hops += 1;
  }
  return {
    seed,
    alive: world.player.alive,
    death: world.player.death,
    score: world.player.maxRow,
    coins: world.player.coins,
    t: world.t,
    hops,
    rate: world.player.maxRow / world.t,
    ms: performance.now() - start,
    row: world.player.row,
    x: world.player.x,
  };
}

const seeds = [1, 2, 7, 11, 42];
const results = seeds.map((seed) => run(chooseAfter, seed, 45));
for (const result of results) {
  console.log(
    `after seed ${result.seed}: score ${result.score} in ${result.t.toFixed(1)}s ` +
      `(${result.rate.toFixed(2)} rows/s) alive=${result.alive} death=${result.death} ` +
      `hops=${result.hops} search=${result.ms.toFixed(0)}ms`,
  );
  assert.equal(result.alive, true, `after bot died on seed ${result.seed}: ${result.death} at row ${result.row}`);
  assert.ok(result.score >= 90, `after bot score ${result.score} is too low on seed ${result.seed}`);
  assert.ok(result.rate >= 2.4, `after bot only scored ${result.rate.toFixed(2)} rows/s on seed ${result.seed}`);
}

const before = [1, 3, 5, 8, 23].map((seed) => run(chooseBefore, seed, 40));
for (const result of before) {
  console.log(
    `before seed ${result.seed}: score ${result.score} death=${result.death} t=${result.t.toFixed(2)}`,
  );
  assert.equal(result.alive, false, `before bot should die on seed ${result.seed}`);
  assert.ok(result.t < 40, `before bot survived the whole window on seed ${result.seed}`);
}

const sameSeedBefore = run(chooseBefore, 23, 40);
const sameSeedAfter = run(chooseAfter, 23, 40);
assert.equal(sameSeedBefore.alive, false);
assert.equal(sameSeedBefore.death, "train");
assert.ok(sameSeedBefore.score >= 30);
assert.equal(sameSeedAfter.alive, true);
assert.ok(sameSeedAfter.score > sameSeedBefore.score + 40);

const marathon = run(chooseAfter, 23, 120);
assert.equal(marathon.alive, true, marathon.death);
assert.ok(marathon.score >= 400, `marathon score ${marathon.score}`);
console.log(
  `marathon seed 23: score ${marathon.score} rate ${marathon.rate.toFixed(2)} alive=${marathon.alive}`,
);
console.log("ok");
