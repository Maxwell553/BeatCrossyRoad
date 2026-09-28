let audioCtx = null;
let muted = false;

try {
  muted = localStorage.getItem("crossy-muted") === "1";
} catch {
  muted = false;
}

function ctx() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function burst(freq, duration, type, peak) {
  const ac = ctx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(peak, ac.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration + 0.02);
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem("crossy-muted", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function play(name) {
  if (muted) return;
  try {
    if (name === "hop") burst(320, 0.07, "square", 0.035);
    else if (name === "coin") {
      burst(880, 0.08, "sine", 0.05);
      setTimeout(() => burst(1320, 0.1, "sine", 0.04), 60);
    } else if (name === "death") {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(240, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ac.currentTime + 0.35);
      gain.gain.setValueAtTime(0.05, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.38);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.4);
    } else if (name === "train") burst(110, 0.28, "square", 0.04);
  } catch {
    /* autoplay can block the first gesture */
  }
}
