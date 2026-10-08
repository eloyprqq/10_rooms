const B = 40;
const W = 12 * B;
const SPEED = 9.6 * B;
const CUBE_G = 78 * B;
const CUBE_JUMP = 19.4 * B;
const SHIP_G = 28 * B;
const SHIP_LIFT = 46 * B;
const BALL_G = 70 * B;

let onWin = () => {};
let onAbort = () => {};
let open = false;
let raf = 0;
let color = "#d7c4a3";
let hold = false;
let clickBuf = 0;
let last = 0;
let scene = 0;
let deadT = 0;
let attempts = 1;
let run = null;
let level = null;
let camX = 0;

function $(id) {
  return document.getElementById(id);
}

function canvas() {
  return $("dash-view");
}

export function dashOpen() {
  return open;
}

export function initDash() {
  const overlay = $("dash-overlay");
  if (!overlay) return;
  const go = (e) => {
    if (!open || scene < 2.6 || deadT > 0) return;
    if (e && e.preventDefault) e.preventDefault();
    hold = true;
    clickBuf = 0.14;
    pulse();
  };
  const up = () => {
    hold = false;
  };
  overlay.addEventListener("pointerdown", go);
  window.addEventListener("pointerup", up);
  window.addEventListener("blur", up);
  window.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (!e.repeat) go();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") up();
  });
}

export function openDash(opts) {
  if (open) return;
  onWin = opts.onWin || (() => {});
  onAbort = opts.onAbort || (() => {});
  color = opts.color || "#d7c4a3";
  open = true;
  scene = 0;
  deadT = 0;
  attempts = 1;
  hold = false;
  clickBuf = 0;
  level = buildLevel();
  run = spawn(2 * B);
  camX = 0;
  last = 0;
  $("dash-overlay").classList.remove("hidden");
  resize();
  raf = requestAnimationFrame(loop);
}

export function closeDash(abort) {
  if (!open) return;
  open = false;
  hold = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  $("dash-overlay").classList.add("hidden");
  if (abort) onAbort();
}

function spawn(x) {
  const cp = checkpointAt(x);
  return {
    x,
    y: cp.y,
    vy: 0,
    rot: 0,
    mode: cp.mode,
    mini: cp.mini,
    grav: cp.grav,
    ufo: cp.ufo,
    ground: true,
    coyote: 0,
    blink: cp.blink,
  };
}

function checkpointAt(x) {
  let mode = "cube";
  let mini = false;
  let grav = 1;
  let ufo = false;
  let blink = false;
  let y = 0;
  for (const p of level.portals) {
    if (p.x <= x + B * 0.6) {
      if (p.kind === "cube" || p.kind === "ship" || p.kind === "ball" || p.kind === "spider") mode = p.kind;
      if (p.kind === "mini") mini = true;
      if (p.kind === "big") mini = false;
      if (p.kind === "grav") grav = -grav;
      if (p.kind === "ufo") ufo = true;
      if (p.kind === "blink") blink = true;
      if (p.kind === "see") blink = false;
      y = p.y ?? y;
    }
  }
  return { mode, mini, grav, ufo, blink, y };
}

function sizeOf(p) {
  return p.mini ? B * 0.58 : B * 0.92;
}

function buildLevel() {
  const L = {
    solids: [],
    spikes: [],
    pads: [],
    orbs: [],
    portals: [],
    gates: [],
    beams: [],
    dashes: [],
    end: 268 * B,
  };
  const solid = (x, y, w, h) => L.solids.push({ x: x * B, y: y * B, w: w * B, h: h * B });
  const spike = (x, y, dir = 1) => L.spikes.push({ x: x * B, y: y * B, dir });
  const pad = (x, y, kind = "yellow") => L.pads.push({ x: x * B + B * 0.15, y: y * B, kind, w: B * 0.7, h: B * 0.22 });
  const orb = (x, y, kind = "yellow") => L.orbs.push({ x: x * B + B * 0.5, y: y * B + B * 0.5, kind, r: B * 0.38, used: 0 });
  const portal = (x, y, kind) => L.portals.push({ x: x * B, y: y * B, kind });
  const gate = (x, y, gap, period, phase) => L.gates.push({ x: x * B, y: y * B, w: B * 1.15, h: B * 5.2, gap: gap * B, period, phase });
  const beam = (x, y, w, delay, on, loop) => L.beams.push({ x: x * B, y: y * B, w: w * B, h: B * 0.42, delay, on, loop });

  for (let i = 0; i < 18; i++) solid(i, -1, 1, 1);
  spike(6, 0);
  spike(10, 0);
  pad(12, 0);
  spike(14, 0);
  spike(15, 0);
  solid(18, 0, 2, 1);
  spike(21, 0);
  solid(23, 0, 3, 2);
  spike(27, 0);
  spike(28, 0);
  pad(30, 0);
  solid(33, 1, 2, 1);
  spike(36, 0);
  portal(38, 0, "mini");
  for (let i = 38; i < 54; i++) solid(i, -1, 1, 1);
  spike(41, 0);
  spike(43, 0);
  pad(45, 0);
  spike(47, 0);
  spike(48, 0);
  orb(51, 1.15);
  spike(52, 0);

  portal(54, 8, "ship");
  portal(54.2, 8, "grav");
  portal(54.4, 8, "mini");
  solid(54, 11, 40, 1);
  for (let i = 0; i < 6; i++) gate(58 + i * 4.2, 3.2, 1.35 + (i % 2) * 0.15, 0.62, i * 0.16);
  spike(82, 11, -1);
  spike(83, 11, -1);

  portal(88, 0, "cube");
  portal(88.2, 0, "big");
  portal(88.4, 0, "ball");
  for (let i = 88; i < 128; i++) solid(i, -1, 1, 1);
  solid(88, 11, 40, 1);
  spike(92, 0);
  orb(94, 2.2, "blue");
  spike(96, 11, -1);
  orb(99, 8.4, "blue");
  spike(102, 0);
  spike(103, 0);
  orb(106, 2.4, "blue");
  spike(109, 11, -1);
  portal(112, 3, "ufo");
  for (let i = 0; i < 7; i++) orb(114 + i * 1.7, 3.2 + (i % 2), "yellow");
  spike(124, 0);
  spike(125, 11, -1);

  portal(128, 0, "spider");
  portal(128.2, 0, "blink");
  for (let i = 128; i < 158; i++) solid(i, -1, 1, 1);
  solid(128, 11, 32, 1);
  spike(132, 0);
  spike(135, 11, -1);
  spike(138, 0);
  spike(141, 11, -1);
  solid(144, 0, 1, 3);
  spike(147, 0);
  spike(150, 11, -1);
  spike(153, 0);

  portal(158, 3, "ship");
  portal(158.2, 3, "see");
  portal(158.4, 3, "big");
  solid(158, -1, 80, 1);
  solid(158, 11, 80, 1);
  beam(164, 2.2, 7, 0.15, 0.38, 1.15);
  beam(171, 7.6, 6, 0.55, 0.32, 1.15);
  beam(178, 4.8, 8, 0.2, 0.28, 0.95);
  for (let i = 0; i < 4; i++) orb(188 + i * 1.35, 4.6);
  beam(196, 2.0, 5, 0.05, 0.3, 1.05);
  beam(196, 8.4, 5, 0.05, 0.3, 1.05);
  orb(204, 5.5, "red");
  beam(208, 4.6, 9, 0.4, 0.22, 1.2);
  orb(216, 3.2, "black");
  beam(220, 7.2, 6, 0.1, 0.34, 1.0);
  orb(226, 6.4);

  portal(232, 0, "spider");
  portal(232.2, 0, "mini");
  for (let i = 232; i < 250; i++) solid(i, -1, 1, 1);
  solid(232, 11, 20, 1);
  spike(236, 0);
  spike(239, 11, -1);
  spike(242, 0);
  spike(245, 11, -1);

  portal(250, 4, "ship");
  portal(250.2, 4, "big");
  for (let i = 0; i < 8; i++) L.dashes.push({ x: (252 + i * 1.4) * B + B * 0.5, y: 5.2 * B, r: B * 0.34 });
  L.end = 266 * B;
  return L;
}

function pulse() {
  if (!run || deadT > 0 || scene < 1) return;
  if (run.mode === "ball" || run.mode === "spider") clickBuf = 0.14;
}

function loop(now) {
  if (!open) return;
  if (!last) last = now;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clickBuf = Math.max(0, clickBuf - dt);
  if (scene < 2.6) {
    scene += dt;
    draw(now, true);
    raf = requestAnimationFrame(loop);
    return;
  }
  if (deadT > 0) {
    deadT -= dt;
    draw(now, false);
    if (deadT <= 0) {
      attempts += 1;
      const x = checkpointX(run.x);
      resetPickups(x);
      run = spawn(x);
      camX = Math.max(0, run.x - 5 * B);
    }
    raf = requestAnimationFrame(loop);
    return;
  }
  step(dt, now);
  draw(now, false);
  raf = requestAnimationFrame(loop);
}

function checkpointX(x) {
  let best = 2 * B;
  for (const p of level.portals) {
    if (p.x + B < x && (p.kind === "cube" || p.kind === "ship" || p.kind === "ball" || p.kind === "spider")) {
      best = p.x + B * 0.4;
    }
  }
  return best;
}

function step(dt, now) {
  const p = run;
  const s = sizeOf(p);
  const prevX = p.x;
  p.x += SPEED * dt;
  camX += (p.x - 5.2 * B - camX) * Math.min(1, dt * 8);
  applyPortals(p, prevX, s);

  if (p.mode === "cube") stepCube(p, s, dt);
  else if (p.mode === "ship") stepShip(p, s, dt);
  else if (p.mode === "ball") stepBall(p, s, dt);
  else stepSpider(p, s, dt);

  for (const d of level.dashes) {
    if (Math.hypot(p.x + s / 2 - d.x, p.y + s / 2 - d.y) < s / 2 + d.r && hold) {
      p.vy = 0;
      p.y += (d.y - s / 2 - p.y) * Math.min(1, dt * 14);
    }
  }

  if (p.y < -B || p.y + s > W + B) die();
  if (hitSpike(p, s) || hitGate(p, s, now) || hitBeam(p, s, now)) die();
  if (p.x > level.end) {
    closeDash(false);
    onWin();
  }
}

function applyPortals(p, prevX, s) {
  for (const portal of level.portals) {
    const crossed = prevX + s <= portal.x && p.x + s > portal.x;
    if (!crossed) continue;
    if (portal.kind === "cube" || portal.kind === "ship" || portal.kind === "ball" || portal.kind === "spider") {
      p.mode = portal.kind;
      p.vy = 0;
      p.rot = 0;
    }
    if (portal.kind === "mini") p.mini = true;
    if (portal.kind === "big") p.mini = false;
    if (portal.kind === "grav") p.grav = -p.grav;
    if (portal.kind === "ufo") p.ufo = true;
    if (portal.kind === "blink") p.blink = true;
    if (portal.kind === "see") p.blink = false;
  }
}

function stepCube(p, s, dt) {
  p.vy -= CUBE_G * p.grav * dt;
  p.y += p.vy * dt;
  const landed = resolveSolid(p, s);
  p.ground = landed;
  if (landed) {
    p.coyote = 0.08;
    p.rot = Math.round(p.rot / 90) * 90;
  } else {
    p.coyote -= dt;
    p.rot += 380 * dt * (p.vy >= 0 ? -1 : 1) * p.grav;
  }
  if ((clickBuf > 0 && p.coyote > 0) || hitPad(p, s) || hitOrb(p, s, "yellow") || hitOrb(p, s, "red")) {
    const red = hitOrb(p, s, "red");
    p.vy = CUBE_JUMP * p.grav * (red ? 1.18 : 1);
    p.ground = false;
    p.coyote = 0;
    clickBuf = 0;
    consumeOrb(p, s);
  }
  if (hitOrb(p, s, "blue") && clickBuf > 0) {
    p.grav = -p.grav;
    p.vy = CUBE_JUMP * 0.35 * p.grav;
    clickBuf = 0;
    consumeOrb(p, s);
  }
  if (hitOrb(p, s, "black") && clickBuf > 0) {
    p.vy = -CUBE_JUMP * 1.35 * p.grav;
    clickBuf = 0;
    consumeOrb(p, s);
  }
}

function stepShip(p, s, dt) {
  const lift = hold ? SHIP_LIFT : 0;
  p.vy += (-SHIP_G * p.grav + lift * p.grav) * dt;
  p.vy = Math.max(-18 * B, Math.min(18 * B, p.vy));
  p.y += p.vy * dt;
  resolveSolid(p, s);
  p.rot = Math.max(-55, Math.min(55, -p.vy * 0.12));
  if (hitOrb(p, s, "yellow") && clickBuf > 0) {
    p.vy = CUBE_JUMP * 0.72 * p.grav;
    clickBuf = 0;
    consumeOrb(p, s);
  }
  if (hitOrb(p, s, "red") && clickBuf > 0) {
    p.vy = CUBE_JUMP * 0.95 * p.grav;
    clickBuf = 0;
    consumeOrb(p, s);
  }
  if (hitOrb(p, s, "black") && clickBuf > 0) {
    p.vy = -CUBE_JUMP * p.grav;
    clickBuf = 0;
    consumeOrb(p, s);
  }
}

function stepBall(p, s, dt) {
  if (p.ufo && clickBuf > 0) {
    p.grav = -p.grav;
    p.vy = 8 * B * p.grav;
    clickBuf = 0;
  }
  p.vy -= BALL_G * p.grav * dt;
  p.y += p.vy * dt;
  const landed = resolveSolid(p, s);
  p.ground = landed;
  p.rot += 420 * dt * (p.grav > 0 ? 1 : -1);
  if (!p.ufo && clickBuf > 0 && (landed || hitOrb(p, s, "blue") || hitOrb(p, s, "yellow"))) {
    p.grav = -p.grav;
    p.vy = 6 * B * p.grav;
    clickBuf = 0;
    consumeOrb(p, s);
  }
}

function stepSpider(p, s, dt) {
  p.vy -= CUBE_G * 1.2 * p.grav * dt;
  p.y += p.vy * dt;
  resolveSolid(p, s);
  p.rot = 0;
  if (clickBuf > 0) {
    clickBuf = 0;
    const up = p.grav > 0;
    const target = up ? W - s - 2 : 2;
    p.y = target;
    p.grav = -p.grav;
    p.vy = 0;
    resolveSolid(p, s);
  }
}

function resolveSolid(p, s) {
  let landed = false;
  p.y = Math.max(0, Math.min(W - s, p.y));
  if (p.y === 0 && p.grav > 0) {
    p.vy = Math.max(0, p.vy);
    landed = true;
  }
  if (p.y === W - s && p.grav < 0) {
    p.vy = Math.min(0, p.vy);
    landed = true;
  }
  for (const b of level.solids) {
    if (!overlap(p.x, p.y, s, s, b.x, b.y, b.w, b.h)) continue;
    const bottom = p.y + s - b.y;
    const top = b.y + b.h - p.y;
    const left = p.x + s - b.x;
    const right = b.x + b.w - p.x;
    const m = Math.min(bottom, top, left, right);
    if (m === bottom && p.vy <= 0) {
      p.y = b.y - s;
      p.vy = 0;
      if (p.grav > 0) landed = true;
    } else if (m === top && p.vy >= 0) {
      p.y = b.y + b.h;
      p.vy = 0;
      if (p.grav < 0) landed = true;
    } else die();
  }
  return landed;
}

function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function hitSpike(p, s) {
  const inset = s * 0.18;
  for (const sp of level.spikes) {
    const y = sp.dir > 0 ? sp.y : sp.y - B;
    if (overlap(p.x + inset, p.y + inset, s - inset * 2, s - inset * 2, sp.x + 6, y + 4, B - 12, B - 8)) return true;
  }
  return false;
}

function resetPickups(fromX) {
  for (const o of level.orbs) {
    if (o.x >= fromX - B * 2) o.used = 0;
  }
  for (const pad of level.pads) {
    if (pad.x >= fromX - B * 2) pad.used = 0;
  }
}

function hitPad(p, s) {
  for (const pad of level.pads) {
    if (pad.used) continue;
    if (overlap(p.x, p.y, s, s, pad.x, pad.y, pad.w, pad.h)) {
      pad.used = 1;
      return true;
    }
  }
  return false;
}

function hitOrb(p, s, kind) {
  for (const o of level.orbs) {
    if (o.kind !== kind || o.used) continue;
    if (Math.hypot(p.x + s / 2 - o.x, p.y + s / 2 - o.y) < s / 2 + o.r) return true;
  }
  return false;
}

function consumeOrb(p, s) {
  for (const o of level.orbs) {
    if (o.used) continue;
    if (Math.hypot(p.x + s / 2 - o.x, p.y + s / 2 - o.y) < s / 2 + o.r + 8) o.used = 1;
  }
}

function gateClosed(g, now) {
  const t = (now / 1000 + g.phase) % g.period;
  return t > g.period * 0.48;
}

function hitGate(p, s, now) {
  for (const g of level.gates) {
    if (!gateClosed(g, now)) continue;
    if (overlap(p.x, p.y, s, s, g.x, g.y, g.w, g.h)) return true;
  }
  return false;
}

function beamOn(b, now) {
  const t = (now / 1000 - b.delay);
  if (t < 0) return false;
  const cyc = t % b.loop;
  return cyc < b.on;
}

function hitBeam(p, s, now) {
  for (const b of level.beams) {
    if (!beamOn(b, now)) continue;
    if (overlap(p.x, p.y, s, s, b.x, b.y, b.w, b.h)) return true;
  }
  return false;
}

function die() {
  if (deadT > 0) return;
  deadT = 0.42;
  hold = false;
}

function resize() {
  const c = canvas();
  if (!c) return;
  const r = c.parentElement.getBoundingClientRect();
  c.width = Math.max(640, Math.floor(r.width));
  c.height = Math.max(360, Math.floor(r.height));
}

function draw(now, intro) {
  const c = canvas();
  if (!c) return;
  const ctx = c.getContext("2d");
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);
  const scale = h / (W + 2.4 * B);
  ctx.save();
  ctx.translate(0, h);
  ctx.scale(scale, -scale);
  ctx.translate(-camX, 1.2 * B);

  ctx.fillStyle = "#14181f";
  ctx.fillRect(camX - 40, -1.2 * B, w / scale + 80, 1.2 * B);
  ctx.fillRect(camX - 40, W, w / scale + 80, 1.2 * B);

  const blinkOff = run?.blink && Math.sin(now / 90) > 0.35;
  if (!blinkOff) {
    ctx.fillStyle = "#2a313c";
    for (const b of level.solids) ctx.fillRect(b.x, b.y, b.w, b.h);
    for (const sp of level.spikes) {
      ctx.fillStyle = "#d7dde6";
      ctx.beginPath();
      if (sp.dir > 0) {
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x + B / 2, sp.y + B);
        ctx.lineTo(sp.x + B, sp.y);
      } else {
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x + B / 2, sp.y - B);
        ctx.lineTo(sp.x + B, sp.y);
      }
      ctx.closePath();
      ctx.fill();
    }
    for (const pad of level.pads) {
      ctx.fillStyle = "#e0b341";
      ctx.fillRect(pad.x, pad.y, pad.w, pad.h);
    }
    for (const o of level.orbs) {
      if (o.used) continue;
      ctx.strokeStyle = o.kind === "blue" ? "#5aa0e8" : o.kind === "red" ? "#e23b3b" : o.kind === "black" ? "#111" : "#e0b341";
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    for (const d of level.dashes) {
      ctx.strokeStyle = "#7ec8c8";
      ctx.lineWidth = 3;
      ctx.strokeRect(d.x - d.r, d.y - d.r * 0.4, d.r * 2, d.r * 0.8);
    }
    for (const g of level.gates) {
      const shut = gateClosed(g, now);
      ctx.fillStyle = shut ? "#e11d2e" : "rgba(225,29,46,0.18)";
      const lid = shut ? 0 : g.gap;
      ctx.beginPath();
      ctx.ellipse(g.x + g.w / 2, g.y + g.h / 2, g.w * 0.9, g.h / 2 - lid * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4a0408";
      ctx.beginPath();
      ctx.arc(g.x + g.w / 2, g.y + g.h / 2, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of level.beams) {
      if (!beamOn(b, now)) continue;
      ctx.fillStyle = "rgba(225, 40, 48, 0.85)";
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }

  if (run && run.x > 158 * B && run.x < 232 * B) {
    const ex = run.x + 7.5 * B;
    const ey = 6 * B + Math.sin(now / 160) * 28;
    drawBossEye(ctx, ex, ey, 1);
  }

  if (run && !intro) {
    const s = sizeOf(run);
    ctx.save();
    ctx.translate(run.x + s / 2, run.y + s / 2);
    ctx.rotate((run.rot * Math.PI) / 180);
    ctx.fillStyle = color;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.fillStyle = "#1b1d22";
    ctx.fillRect(-s * 0.18, s * 0.08, s * 0.22, s * 0.18);
    ctx.restore();
  }
  ctx.restore();

  if (intro) {
    const k = Math.min(1, scene / 0.6);
    ctx.fillStyle = `rgba(0,0,0,${1 - Math.max(0, (scene - 1.8) / 0.7)})`;
    ctx.fillRect(0, 0, w, h);
    const ex = w * 0.5;
    const ey = h * 0.42;
    const openLid = Math.min(1, Math.max(0, (scene - 0.35) / 0.7));
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, 0.12 + openLid * 0.88);
    ctx.fillStyle = "#e8eaee";
    ctx.beginPath();
    ctx.ellipse(0, 0, 160, 92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e11d2e";
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a0306";
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = `rgba(225,29,46,${Math.min(1, Math.max(0, scene - 1.1))})`;
    ctx.font = '700 42px "Black Han Sans", "IBM Plex Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("I SEE YOU", w / 2, h * 0.78);
    ctx.font = '500 16px "IBM Plex Sans KR", sans-serif';
    ctx.fillStyle = "rgba(231,225,212,0.7)";
    ctx.fillText("클릭 / 스페이스", w / 2, h * 0.86);
  }

  if (blinkOff && !intro) {
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(0, 0, w, h);
  }

  if (deadT > 0) {
    ctx.fillStyle = `rgba(154,36,48,${0.45 * (deadT / 0.42)})`;
    ctx.fillRect(0, 0, w, h);
  }

  const hud = $("dash-hud");
  if (hud && run && !intro) {
    const pct = Math.max(0, Math.min(100, Math.floor((run.x / level.end) * 100)));
    hud.textContent = `시도 ${attempts}   ${pct}%   ${label(run.mode)}`;
  } else if (hud && intro) hud.textContent = "";
}

function label(mode) {
  return { cube: "큐브", ship: "쉽", ball: "볼", spider: "거미" }[mode] || mode;
}

function drawBossEye(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "#e8eaee";
  ctx.beginPath();
  ctx.ellipse(0, 0, 46, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e11d2e";
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a0306";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

window.addEventListener("resize", () => {
  if (open) resize();
});
