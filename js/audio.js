let ctx = null;
let master = null;
let drone = null;
let droneGain = null;
let heartTimer = 0;
let alarmTimer = 0;
let muted = false;
let mood = { heartbeat: 0, alarm: false, powerOff: false };

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    droneGain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 46;
    filter.type = "lowpass";
    filter.frequency.value = 140;
    droneGain.gain.value = 0.0;
    osc.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(master);
    osc.start();
    drone = osc;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ac();
  if (c && c.state === "suspended") c.resume();
  if (c) setMood({ ...mood });
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.22;
}

export function isMuted() {
  return muted;
}

export function setMood(next) {
  mood = { ...mood, ...next };
  if (!ctx || !droneGain) return;
  const target = muted ? 0 : mood.powerOff ? 0.09 : 0.045;
  droneGain.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
  if (drone) drone.frequency.setTargetAtTime(mood.alarm ? 58 : mood.powerOff ? 40 : 46, ctx.currentTime, 0.5);
}

function blip(freq, dur, type, gain) {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(g);
  g.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}

export function playHurt() {
  blip(90, 0.35, "square", 0.18);
}

export function playPickup() {
  blip(520, 0.12, "sine", 0.08);
  setTimeout(() => blip(740, 0.1, "sine", 0.06), 70);
}

export function playBlackout() {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.6);
  g.gain.value = 0.12;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);
  osc.connect(g);
  g.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + 0.7);
}

export function updateAudio(dt) {
  if (!ctx || muted) return;
  heartTimer -= dt;
  alarmTimer -= dt;
  if (mood.heartbeat > 0 && heartTimer <= 0) {
    const speed = Math.max(0.28, 0.85 - mood.heartbeat * 0.1);
    heartTimer = speed;
    blip(70, 0.08, "sine", 0.16);
    setTimeout(() => blip(54, 0.1, "sine", 0.12), 120);
  }
  if (mood.alarm && alarmTimer <= 0) {
    alarmTimer = 0.85;
    blip(880, 0.18, "square", 0.05);
  }
}
