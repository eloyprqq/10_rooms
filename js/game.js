import { ROOMS, roomById, roomCenter, anchorOf, getFloorCanvas, drawSchematic, isWalkable, locate } from "./map.js";
import { createMatch, advance, scatterMonsters, applyMonsterView, rollDelta } from "./sim.js";
import { unlockAudio, setMuted, isMuted, setMood, playHurt, playPickup, playBlackout, updateAudio } from "./audio.js";
import { initMinigames, openWires, openCard, closeMinigames, minigameOpen } from "./minigames.js";
import { isFirebaseConfigured, createRoom, joinRoom, watchRoom, pushSelf, pushRoom, pushWorld, signal, sendRevive, leaveRoom, amHost, selfId, currentCode } from "./net.js";

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const ctx = canvas.getContext("2d");

const ITEM = {
  bread: "빵",
  stim: "자극제",
  flashlight: "손전등",
  cctv: "리모컨",
  cross: "십자가",
  clock: "시계",
  bandage: "붕대",
};

const MARK = {
  bread: "#d2b48a",
  stim: "#d25a52",
  flashlight: "#e0b15a",
  cctv: "#7ec8c8",
  cross: "#e7e1d4",
  clock: "#c4b0d4",
  bandage: "#d7d0c8",
};

const LOBBY = { x: 160, y: 150, w: 900, h: 440 };
const SUPPLY_MS = 20000;

const state = {
  phase: "menu",
  difficulty: "normal",
  multi: false,
  paused: false,
  name: "탐색자",
  color: "#d7c4a3",
  applied: 1,
  synced: false,
  localExp: {},
  supplyCd: {},
  cctvReadyAt: 0,
  cctvItem: null,
  seen: { blackout: 0, reactor: 0, scatter: 0, power: 0, reactorFix: 0, revive: 0 },
  roomData: null,
  lastPush: 0,
  menuPan: 0,
  boostUntil: 0,
  lampAcc: 0,
  shake: 0,
  dirty: true,
  clockMood: "",
  launching: false,
  countdownSent: false,
};

const player = { x: 950, y: 478, facing: 0, hp: 100, alive: true, r: 12 };
const cam = { x: 400, y: 200 };
const keys = new Set();
let pointer = false;
let selected = 0;
let inv = [];
let ground = [];
let sim = null;
let uid = 1;
let last = performance.now();
let timer = 0;
let viewW = 1280;
let viewH = 720;
let ghosts = new Map();

function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function show(id) {
  $(id).classList.remove("hidden");
}

function hide(id) {
  $(id).classList.add("hidden");
}

function bodyId() {
  return state.multi ? selfId() : "you";
}

function playerRoom() {
  const loc = locate(player.x, player.y);
  return loc.kind === "room" ? loc.id : null;
}

function placeLabel() {
  const loc = locate(player.x, player.y);
  if (loc.kind === "room") return roomById(loc.id).name;
  if (loc.id === "diag") return "암복도";
  if (loc.kind === "corridor") return "복도";
  return "시설";
}

function makeItem(type, extra = {}) {
  const item = { uid: uid++, type, ...extra };
  if (type === "flashlight" && item.dura == null) item.dura = 100;
  if (type === "cctv" && item.dura == null) item.dura = 3;
  if (type === "clock" && item.left == null) item.left = 30;
  return item;
}

function renderHotbar() {
  const root = $("hotbar");
  root.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const item = inv[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot" + (i === selected ? " on" : "");
    btn.dataset.i = String(i);
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = String(i + 1);
    btn.appendChild(key);
    if (item) {
      const mark = document.createElement("i");
      mark.className = "mark";
      mark.style.background = MARK[item.type] || "#ccc";
      const name = document.createElement("span");
      name.className = "iname";
      name.textContent = ITEM[item.type] || item.type;
      btn.appendChild(mark);
      btn.appendChild(name);
      if (item.dura != null || item.left != null) {
        const max = item.type === "flashlight" ? 100 : item.type === "cctv" ? 3 : 30;
        const val = item.dura != null ? item.dura : item.left;
        const bar = document.createElement("div");
        bar.className = "dura";
        const fill = document.createElement("i");
        fill.style.width = `${Math.max(0, (val / max) * 100)}%`;
        bar.appendChild(fill);
        btn.appendChild(bar);
      }
    }
    root.appendChild(btn);
  }
  state.dirty = false;
}

function updateDuraBar() {
  const item = inv[selected];
  const slot = $("hotbar").children[selected];
  if (!slot) return;
  const fill = slot.querySelector(".dura i");
  if (!item || !fill) return;
  const max = item.type === "flashlight" ? 100 : item.type === "cctv" ? 3 : 30;
  const val = item.dura != null ? item.dura : item.left || 0;
  fill.style.width = `${Math.max(0, (val / max) * 100)}%`;
}

function give(type) {
  if (inv.length >= 4) {
    toast("가방이 가득 찼다.");
    return false;
  }
  inv.push(makeItem(type));
  state.dirty = true;
  playPickup();
  return true;
}

function removeItem(item) {
  inv = inv.filter((it) => it.uid !== item.uid);
  if (selected >= inv.length) selected = Math.max(0, inv.length - 1);
  state.dirty = true;
}

function rollSupply() {
  const pool = ["bread", "bread", "stim", "flashlight", "cctv", "cross", "clock"];
  if (state.multi) pool.push("bandage");
  return pool[Math.floor(Math.random() * pool.length)];
}

function hurt(amount, source) {
  if (!player.alive || state.phase === "dead") return;
  player.hp -= amount;
  state.shake = 14;
  playHurt();
  $("hurt").style.background = "rgba(150,0,0,0.55)";
  setTimeout(() => {
    $("hurt").style.background = "rgba(140,0,0,0)";
  }, 180);
  if (player.hp > 0) {
    pushPresence();
    return;
  }
  const cross = inv.find((it) => it.type === "cross");
  if (cross && source !== "meltdown") {
    removeItem(cross);
    player.hp = 35;
    toast("십자가가 부서졌다. 괴물들이 흩어졌다.");
    doScatter();
    pushPresence();
    return;
  }
  player.hp = 0;
  player.alive = false;
  pushPresence();
  if (source === "meltdown" || !state.multi) {
    state.phase = "dead";
    clearInterval(timer);
    $("death-title").textContent = source === "meltdown" ? "원자로가 폭파했다" : "어둠에 남았다";
    $("death-sub").textContent = `버틴 시각 ${sim ? sim.time : 0}`;
    hide("downed");
    show("death");
    hide("hud");
  } else {
    show("downed");
  }
}

function doScatter() {
  if (!sim) return;
  if (!state.multi || amHost()) {
    scatterMonsters(sim);
    if (state.multi && amHost()) publish();
    return;
  }
  signal({ scatterAt: Date.now() });
}

function others() {
  const data = state.roomData;
  if (!data?.players) return [];
  return Object.entries(data.players)
    .filter(([id]) => id !== bodyId())
    .map(([id, p]) => ({ id, ...p }));
}

function describeAt(x, y) {
  const loc = locate(x, y);
  return {
    room: loc.kind === "room" ? loc.id : null,
    hall: loc.kind === "corridor" ? loc.id : null,
  };
}

function bodies() {
  const here = describeAt(player.x, player.y);
  const me = {
    id: bodyId(),
    x: player.x,
    y: player.y,
    room: here.room,
    hall: here.hall,
    alive: player.alive,
  };
  if (!state.multi) return [me];
  const list = [me];
  for (const o of others()) {
    list.push({
      id: o.id,
      x: o.x || 0,
      y: o.y || 0,
      room: o.room || null,
      hall: o.hall || null,
      alive: o.alive !== false,
    });
  }
  return list;
}

function publish() {
  if (!state.multi || !amHost() || !sim) return Promise.resolve();
  return pushWorld({
    time: sim.time,
    power: sim.power,
    reactor: sim.reactor,
    meltdown: !!sim.meltdown,
    monsters: sim.monsters.map((m) => ({
      id: m.id,
      type: m.place.type,
      loc: m.place.id,
      lockUntil: m.lockUntil,
    })),
    history: sim.history,
    beat: Date.now(),
  });
}

function purgeClocks() {
  const before = inv.length + ground.length;
  inv = inv.filter((it) => it.type !== "clock" || it.left > 0);
  ground = ground.filter((it) => it.type !== "clock" || it.left > 0);
  if (inv.length + ground.length !== before) {
    toast("시계가 부서졌다.");
    state.dirty = true;
  }
}

function consume(snap) {
  if (!sim || snap.t <= state.applied) return;
  applyMonsterView(sim, snap.monsters);
  sim.time = snap.t;
  sim.power = snap.power;
  sim.reactor = snap.reactor;
  sim.meltdown = !!snap.meltdown;
  state.applied = snap.t;
  for (const it of inv.concat(ground)) {
    if (it.type === "clock") it.left -= 1;
  }
  purgeClocks();
  const room = playerRoom();
  const seen = new Set();
  for (const raw of snap.monsters) {
    if (room && raw.type === "room" && raw.loc === room) {
      state.localExp[raw.id] = (state.localExp[raw.id] || 0) + 1;
      seen.add(raw.id);
    }
  }
  for (const id of Object.keys(state.localExp)) {
    if (!seen.has(Number(id)) && !seen.has(id)) state.localExp[id] = 0;
  }
  if (snap.t % 7 === 0 && snap.power === false && state.seen.blackout !== snap.t) {
    state.seen.blackout = snap.t;
    toast("정전이다.");
    playBlackout();
  }
  if (snap.reactor && state.seen.reactor !== snap.reactor.start) {
    state.seen.reactor = snap.reactor.start;
    toast("원자로 이상. 시간 9 안에 카드를 긁어라.");
  }
  for (const hit of snap.hits || []) {
    if (hit.playerId === bodyId()) hurt(hit.amount, "monster");
  }
  if (snap.meltdown && state.phase === "play") hurt(9999, "meltdown");
  state.dirty = true;
}

function catchUp(world) {
  if (!world || !sim) return;
  if (!state.synced) {
    if (world.monsters) applyMonsterView(sim, world.monsters);
    sim.time = world.time || 1;
    sim.power = world.power !== false;
    sim.reactor = world.reactor || null;
    sim.meltdown = !!world.meltdown;
    state.applied = world.time || 1;
    state.synced = true;
    return;
  }
  for (const snap of world.history || []) consume(snap);
  if (world.monsters) applyMonsterView(sim, world.monsters);
  sim.power = world.power !== false;
  sim.reactor = world.reactor || null;
  if (world.meltdown && state.phase === "play" && player.alive) hurt(9999, "meltdown");
}

function pushPresence() {
  if (!state.multi) return;
  const loc = locate(player.x, player.y);
  pushSelf({
    name: state.name,
    color: state.color,
    x: Math.round(player.x),
    y: Math.round(player.y),
    facing: player.facing,
    hp: Math.max(0, Math.round(player.hp)),
    alive: player.alive,
    room: loc.kind === "room" ? loc.id : "",
    hall: loc.kind === "corridor" ? loc.id : "",
  });
}

function resetRun(difficulty) {
  closeMinigames();
  hide("map-overlay");
  hide("cctv-overlay");
  hide("pause");
  hide("death");
  hide("downed");
  inv = [];
  ground = [];
  selected = 0;
  state.localExp = {};
  state.supplyCd = {};
  state.cctvReadyAt = 0;
  state.cctvItem = null;
  state.paused = false;
  state.applied = 1;
  state.synced = false;
  state.boostUntil = 0;
  state.seen = { blackout: 0, reactor: 0, scatter: 0, power: 0, reactorFix: 0, revive: 0 };
  player.hp = 100;
  player.alive = true;
  player.facing = 0;
  const spawn = roomCenter("cafeteria");
  player.x = spawn.x;
  player.y = spawn.y;
  sim = createMatch(difficulty);
  ghosts = new Map();
  const s2 = roomCenter("supply2");
  const s1 = roomCenter("supply1");
  ground.push({ ...makeItem("flashlight"), x: s2.x + 36, y: s2.y + 20 });
  ground.push({ ...makeItem("bread"), x: s1.x - 30, y: s1.y + 16 });
  state.dirty = true;
}

function beginSingle() {
  state.multi = false;
  state.phase = "boot";
  resetRun(state.difficulty);
  state.synced = true;
  state.phase = "play";
  hide("menu");
  show("hud");
  toast("식당이다. 보급소에 물건이 있다.");
  armTimer();
}

async function beginMatchLocal(world) {
  state.phase = "boot";
  resetRun(state.difficulty);
  if (world) {
    sim.monsters = [];
    sim.history = [];
    catchUp(world);
  } else if (state.multi && !amHost()) {
    sim.monsters = [];
    sim.history = [];
    state.synced = false;
  } else {
    state.synced = true;
  }
  state.phase = "play";
  hide("menu");
  hide("lobby");
  hide("multi-setup");
  show("hud");
  if (state.multi && amHost()) await publish();
  armTimer();
}

function armTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (state.phase !== "play" || state.paused || !sim) return;
    if (!state.multi && !player.alive) return;
    if (state.multi && !amHost()) return;
    const delta = rollDelta();
    const snaps = advance(sim, delta, bodies());
    for (const snap of snaps) {
      consume(snap);
      if (state.phase !== "play") break;
    }
    if (state.multi) publish();
  }, 3000);
}

function fixPower() {
  if (!sim) return;
  sim.power = true;
  toast("전력이 돌아왔다.");
  if (state.multi) {
    if (amHost()) publish();
    else signal({ powerFixAt: Date.now() });
  }
}

function fixReactor() {
  if (!sim || !sim.reactor) return;
  sim.reactor = null;
  toast("원자로가 안정됐다.");
  if (state.multi) {
    if (amHost()) publish();
    else signal({ reactorFixAt: Date.now() });
  }
}

function interact() {
  if (state.phase !== "play" || !player.alive || minigameOpen()) return;
  const loc = locate(player.x, player.y);
  if (loc.kind === "room") {
    const c = roomCenter(loc.id);
    const near = Math.hypot(player.x - c.x, player.y - c.y) < 118;
    if (near && loc.id === "electrical") {
      if (sim.power) toast("전력은 정상이다.");
      else openWires();
      return;
    }
    if (near && loc.id === "reactor") {
      if (!sim.reactor) toast("원자로는 안정적이다.");
      else openCard();
      return;
    }
    if (near && loc.id === "cctv") {
      openCctv("room", null);
      return;
    }
    if (near && (loc.id === "supply1" || loc.id === "supply2")) {
      const ready = state.supplyCd[loc.id] || 0;
      if (performance.now() < ready) {
        toast(`보급까지 ${Math.ceil((ready - performance.now()) / 1000)}초`);
        return;
      }
      if (give(rollSupply())) {
        state.supplyCd[loc.id] = performance.now() + SUPPLY_MS;
        toast("보급품을 받았다.");
      }
      return;
    }
    if (near && loc.id === "map") {
      show("map-overlay");
      drawMap();
      return;
    }
  }
  let best = null;
  let bestD = 42;
  for (const g of ground) {
    const d = Math.hypot(g.x - player.x, g.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  if (best) {
    if (inv.length >= 4) {
      toast("가방이 가득 찼다.");
      return;
    }
    ground = ground.filter((g) => g !== best);
    inv.push(best);
    state.dirty = true;
    playPickup();
  }
}

function openCctv(mode, item) {
  if (performance.now() < state.cctvReadyAt) {
    toast(`CCTV 재사용까지 ${Math.ceil((state.cctvReadyAt - performance.now()) / 1000)}초`);
    return;
  }
  state.cctvItem = mode === "remote" ? item : null;
  const grid = $("cctv-grid");
  grid.innerHTML = "";
  for (const room of ROOMS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice";
    b.textContent = `${room.num}. ${room.name}`;
    b.addEventListener("click", () => viewRoom(room));
    grid.appendChild(b);
  }
  $("cctv-result").textContent = "번호를 고르세요. 키보드 1–9, 0은 옥상.";
  $("cctv-cool").textContent = state.cctvItem ? `리모컨 내구도 ${state.cctvItem.dura}` : "CCTV실 콘솔";
  show("cctv-overlay");
}

function viewRoom(room) {
  if (performance.now() < state.cctvReadyAt) return;
  if (state.cctvItem) {
    state.cctvItem.dura -= 1;
    if (state.cctvItem.dura <= 0) {
      removeItem(state.cctvItem);
      toast("리모컨이 부서졌다.");
      state.cctvItem = null;
    }
    state.dirty = true;
  }
  state.cctvReadyAt = performance.now() + 15000;
  const monsters = sim.monsters.filter((m) => m.place.type === "room" && m.place.id === room.id);
  const people = [];
  if (playerRoom() === room.id) people.push(state.name);
  for (const o of others()) {
    if (o.alive !== false && o.room === room.id) people.push(o.name || "동료");
  }
  const box = $("cctv-result");
  box.className = monsters.length ? "bad" : "good";
  box.textContent = monsters.length
    ? `${room.name}: 괴물 ${monsters.length} 감지. ${people.length ? "인원 " + people.join(", ") : "사람은 보이지 않는다."}`
    : `${room.name}: 이상 없음. ${people.length ? "인원 " + people.join(", ") : "빈 방."}`;
  $("cctv-cool").textContent = "다음 확인까지 15초";
}

function useSelected() {
  const item = inv[selected];
  if (!item || state.phase !== "play" || !player.alive) return;
  if (item.type === "bread") {
    player.hp = Math.min(100, player.hp + 50);
    removeItem(item);
    playPickup();
    toast("빵을 먹었다.");
    pushPresence();
  } else if (item.type === "stim") {
    removeItem(item);
    state.boostUntil = performance.now() + 15000;
    toast("다리가 가벼워진다.");
    hurt(10, "stim");
  } else if (item.type === "cctv") {
    openCctv("remote", item);
  } else if (item.type === "cross") {
    removeItem(item);
    doScatter();
    toast("십자가가 부서지고 괴물이 흩어졌다.");
  } else if (item.type === "bandage") {
    if (!state.multi) {
      toast("싱글에서는 쓸 일이 없다.");
      return;
    }
    const room = playerRoom();
    const target = others().find((o) => o.alive === false && o.room === room);
    if (!target) {
      toast("이 방에 쓰러진 사람이 없다.");
      return;
    }
    sendRevive(target.id);
    removeItem(item);
    toast("붕대를 감았다.");
  } else if (item.type === "clock") {
    toast(`시각 ${sim.time}. 시계는 ${Math.max(0, Math.ceil(item.left))} 남았다.`);
  }
}

function dropSelected() {
  const item = inv[selected];
  if (!item) return;
  const copy = { ...item, x: player.x + Math.cos(player.facing) * 28, y: player.y + Math.sin(player.facing) * 28 };
  removeItem(item);
  ground.push(copy);
  toast("바닥에 내려놓았다.");
}

function onRoom(data) {
  state.roomData = data;
  if (!data) return;
  renderLobby(data);
  if (data.phase === "playing" && state.phase === "lobby") {
    state.difficulty = data.difficulty || state.difficulty;
    beginMatchLocal(data.world);
    return;
  }
  if (data.phase === "playing" && state.phase === "play") {
    if (!amHost()) catchUp(data.world);
    if (amHost() && sim) {
      if (data.scatterAt && data.scatterAt !== state.seen.scatter) {
        state.seen.scatter = data.scatterAt;
        scatterMonsters(sim);
        publish();
      }
      if (data.powerFixAt && data.powerFixAt !== state.seen.power) {
        state.seen.power = data.powerFixAt;
        sim.power = true;
        publish();
      }
      if (data.reactorFixAt && data.reactorFixAt !== state.seen.reactorFix) {
        state.seen.reactorFix = data.reactorFixAt;
        sim.reactor = null;
        publish();
      }
    }
    const me = data.players?.[bodyId()];
    if (me?.reviveAt && me.reviveAt !== state.seen.revive && !player.alive) {
      state.seen.revive = me.reviveAt;
      player.alive = true;
      player.hp = 50;
      hide("downed");
      show("hud");
      toast("일어났다.");
      pushPresence();
    }
  }
}

function renderLobby(data) {
  if (state.phase !== "lobby" || !data) return;
  $("lobby-code").textContent = currentCode();
  const players = data.players ? Object.values(data.players) : [];
  $("lobby-list").innerHTML = players
    .map((p) => `<li style="color:${p.color || "#eee"}">${escapeHtml(p.name || "탐색자")}</li>`)
    .join("");
  const n = players.length;
  if (data.countdownEnd) {
    const sec = Math.max(0, Math.ceil((data.countdownEnd - Date.now()) / 1000));
    $("lobby-status").textContent = `${n}명 탑승. ${sec}초 후 시설로 진입한다.`;
  } else {
    $("lobby-status").textContent = `${n}명 대기 중. 2명이 모이면 출발한다. 난이도 ${data.difficulty || state.difficulty}`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = viewW + "px";
  canvas.style.height = viewH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function movePlayer(dt) {
  if (!player.alive || state.paused || minigameOpen()) return;
  if ($("map-overlay").classList.contains("hidden") === false) return;
  if (!$("cctv-overlay").classList.contains("hidden")) return;
  let x = 0;
  let y = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  const len = Math.hypot(x, y);
  if (!len) return;
  const boost = performance.now() < state.boostUntil ? 1.5 : 1;
  const speed = (state.phase === "lobby" ? 190 : 168) * boost;
  const dx = (x / len) * speed * dt;
  const dy = (y / len) * speed * dt;
  player.facing = Math.atan2(y, x);
  const walk = state.phase === "lobby" ? lobbyWalk : isWalkable;
  if (walk(player.x + dx, player.y)) player.x += dx;
  if (walk(player.x, player.y + dy)) player.y += dy;
}

function lobbyWalk(x, y) {
  return x > LOBBY.x + 28 && y > LOBBY.y + 28 && x < LOBBY.x + LOBBY.w - 28 && y < LOBBY.y + LOBBY.h - 28;
}

function holdLamp(dt) {
  const item = inv[selected];
  const on = item && item.type === "flashlight" && item.dura > 0 && (pointer || keys.has("KeyF")) && state.phase === "play" && player.alive && !state.paused;
  if (!on) return false;
  state.lampAcc += dt;
  while (state.lampAcc >= 0.1) {
    state.lampAcc -= 0.1;
    item.dura -= 3;
    if (item.dura <= 0) {
      item.dura = 0;
      removeItem(item);
      toast("손전등이 꺼졌다.");
      return false;
    }
  }
  return true;
}

function danger() {
  let best = 0;
  for (const v of Object.values(state.localExp)) best = Math.max(best, v || 0);
  return best;
}

function updateHud(lamp) {
  if (state.phase !== "play") return;
  const hp = Math.max(0, Math.round(player.hp));
  $("hp-num").textContent = String(hp);
  $("hp-fill").style.width = `${hp}%`;
  $("hp-fill").classList.toggle("low", hp > 0 && hp <= 30);
  $("room-label").textContent = placeLabel();
  const clock = inv.find((it) => it.type === "clock" && it.left > 0);
  $("clock-readout").classList.toggle("hidden", !clock);
  if (clock) $("clock-readout").textContent = `시각 ${sim.time}  ·  시계 ${Math.ceil(clock.left)}`;
  let alarm = "";
  if (sim.reactor) alarm = `원자로 멜트다운 — 남은 시간 ${Math.max(0, sim.reactor.deadline - sim.time)}`;
  else if (!sim.power) alarm = "정전 — 전기실에서 전선을 연결하라";
  $("alarm-line").textContent = alarm;
  const d = danger();
  $("warn-line").textContent = d >= 3 ? "이 방에 더 머물면 안 된다." : d > 0 ? "같은 방에 무언가가 있다." : "";
  $("hurt").style.background = d > 0 ? `rgba(120,0,0,${0.08 + d * 0.06})` : "rgba(140,0,0,0)";
  const mood = `${d}|${sim.reactor ? 1 : 0}|${sim.power ? 0 : 1}`;
  if (mood !== state.clockMood) {
    state.clockMood = mood;
    setMood({ heartbeat: d, alarm: !!sim.reactor, powerOff: !sim.power });
  }
  $("net-pill").classList.toggle("hidden", !state.multi);
  if (state.multi) $("net-pill").textContent = currentCode();
  if (state.dirty) renderHotbar();
  else if (lamp) updateDuraBar();
  $("prompt").textContent = promptText();
}

function promptText() {
  const loc = locate(player.x, player.y);
  if (loc.kind !== "room") {
    const g = ground.find((it) => Math.hypot(it.x - player.x, it.y - player.y) < 42);
    return g ? "E  줍기" : "";
  }
  const c = roomCenter(loc.id);
  const near = Math.hypot(player.x - c.x, player.y - c.y) < 118;
  if (!near) {
    const g = ground.find((it) => Math.hypot(it.x - player.x, it.y - player.y) < 42);
    return g ? "E  줍기" : "";
  }
  if (loc.id === "electrical") return sim.power ? "전력 정상" : "E  전선 연결";
  if (loc.id === "reactor") return sim.reactor ? "E  카드 긁기" : "원자로 안정";
  if (loc.id === "cctv") return "E  CCTV";
  if (loc.id === "map") return "E  도면";
  if (loc.id === "supply1" || loc.id === "supply2") return "E  보급";
  return "";
}

function drawActor(x, y, facing, color, alive) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(0, 14, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!alive) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "#3a2a2a";
    ctx.fillRect(-16, -7, 32, 14);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#2a2e38";
  ctx.beginPath();
  ctx.ellipse(0, 4, 12, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -8, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f0e2c4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.cos(facing) * 8, Math.sin(facing) * 8 - 2);
  ctx.lineTo(Math.cos(facing) * 18, Math.sin(facing) * 18 - 2);
  ctx.stroke();
  ctx.restore();
}

function drawMonster(x, y, now, i) {
  const flick = 0.28 + Math.sin(now / 70 + i) * 0.08;
  ctx.save();
  ctx.translate(x, y + Math.sin(now / 120 + i) * 2);
  ctx.globalAlpha = flick;
  ctx.fillStyle = "#d9d3c7";
  ctx.beginPath();
  ctx.ellipse(0, 6, 14, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -22, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "#7a1018";
  ctx.fillRect(-5, -25, 3, 3);
  ctx.fillRect(2, -25, 3, 3);
  ctx.restore();
}

function inCone(px, py, facing, mx, my) {
  const dx = mx - px;
  const dy = my - py;
  const dist = Math.hypot(dx, dy);
  if (dist > 310) return false;
  const ang = Math.atan2(dy, dx);
  const delta = Math.atan2(Math.sin(ang - facing), Math.cos(ang - facing));
  return Math.abs(delta) < 0.5;
}

function animateGhosts(dt) {
  if (!sim) return;
  const seen = new Set();
  for (const m of sim.monsters) {
    seen.add(m.id);
    const target = anchorOf(m.place);
    let g = ghosts.get(m.id);
    if (!g || Math.hypot(target.x - g.x, target.y - g.y) > 180) {
      g = { x: target.x, y: target.y };
      ghosts.set(m.id, g);
    }
    const k = Math.min(1, dt * 3.2);
    g.x += (target.x - g.x) * k;
    g.y += (target.y - g.y) * k;
  }
  for (const id of ghosts.keys()) if (!seen.has(id)) ghosts.delete(id);
}

function drawDark(w, h, lamp, now) {
  const px = player.x - cam.x;
  const py = player.y - cam.y;
  const haunted = danger() > 0 && sim.power;
  ctx.save();
  const dark = sim.power ? (haunted ? 0.55 + Math.sin(now / 80) * 0.08 : 0.42) : 0.93;
  ctx.fillStyle = `rgba(0,0,0,${dark})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-out";
  const rad = sim.power ? 240 : 56;
  const g = ctx.createRadialGradient(px, py, rad * 0.15, px, py, rad);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(px, py, rad, 0, Math.PI * 2);
  ctx.fill();
  if (lamp) {
    ctx.fillStyle = "rgba(0,0,0,0.95)";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 320, player.facing - 0.48, player.facing + 0.48);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawFacility(now, lamp) {
  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  state.shake *= 0.86;
  const tx = Math.round(player.x - viewW / 2);
  const ty = Math.round(player.y - viewH / 2);
  cam.x += (tx - cam.x) * 0.12;
  cam.y += (ty - cam.y) * 0.12;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-cam.x + shakeX, -cam.y + shakeY);
  ctx.drawImage(getFloorCanvas(), 0, 0);
  for (const g of ground) {
    ctx.fillStyle = MARK[g.type] || "#ccc";
    ctx.fillRect(g.x - 8, g.y - 8, 16, 16);
    ctx.font = '11px "IBM Plex Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#07080c";
    ctx.strokeText(ITEM[g.type] || "", g.x, g.y - 14);
    ctx.fillStyle = "#f4efe4";
    ctx.fillText(ITEM[g.type] || "", g.x, g.y - 14);
  }
  for (const o of others()) drawActor(o.x, o.y, o.facing || 0, o.color || "#88a", o.alive !== false);
  ctx.restore();
  drawDark(viewW, viewH, lamp, now);
  drawActor(player.x - cam.x, player.y - cam.y, player.facing, state.color, player.alive);
  if (lamp) {
    for (const m of sim.monsters) {
      const g = ghosts.get(m.id);
      if (!g) continue;
      if (!inCone(player.x, player.y, player.facing, g.x, g.y)) continue;
      drawMonster(g.x - cam.x, g.y - cam.y, now, m.id);
    }
  }
}

function drawLobbyScene() {
  ctx.clearRect(0, 0, viewW, viewH);
  const ox = viewW / 2 - (LOBBY.x + LOBBY.w / 2);
  const oy = viewH / 2 - (LOBBY.y + LOBBY.h / 2) + 40;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = "#10141c";
  ctx.fillRect(LOBBY.x, LOBBY.y, LOBBY.w, LOBBY.h);
  ctx.strokeStyle = "#8b97a8";
  ctx.lineWidth = 6;
  ctx.strokeRect(LOBBY.x, LOBBY.y, LOBBY.w, LOBBY.h);
  ctx.fillStyle = "#070b14";
  ctx.fillRect(LOBBY.x + 70, LOBBY.y + 36, 240, 90);
  ctx.strokeStyle = "#9fd0e6";
  ctx.strokeRect(LOBBY.x + 70, LOBBY.y + 36, 240, 90);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = "rgba(220,230,255,0.7)";
    ctx.fillRect(LOBBY.x + 80 + ((i * 47) % 210), LOBBY.y + 48 + ((i * 19) % 60), 2, 2);
  }
  ctx.fillStyle = "rgba(231,225,212,0.7)";
  ctx.font = '600 22px "IBM Plex Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("대기실", LOBBY.x + LOBBY.w / 2, LOBBY.y + 70);
  ctx.font = "14px sans-serif";
  ctx.fillText("2명이 모이면 시설로 간다", LOBBY.x + LOBBY.w / 2, LOBBY.y + LOBBY.h - 36);
  for (const o of others()) drawActor(o.x, o.y, o.facing || 0, o.color || "#88a", true);
  drawActor(player.x, player.y, player.facing, state.color, true);
  ctx.restore();
}

function drawMenu(dt) {
  state.menuPan += dt * 24;
  cam.x = 180 + (state.menuPan % 700);
  cam.y = 260 + Math.sin(state.menuPan / 180) * 30;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  ctx.drawImage(getFloorCanvas(), 0, 0);
  ctx.restore();
}

function drawMap() {
  const c = $("map-canvas");
  const mctx = c.getContext("2d");
  const list = others().map((o) => ({ x: o.x, y: o.y, name: o.name, color: o.color, alive: o.alive !== false }));
  drawSchematic(mctx, c.width, c.height, player, list);
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.phase === "menu") drawMenu(dt);
  else     if (state.phase === "lobby") {
    movePlayer(dt);
    pollLobby();
    drawLobbyScene();
    if (now - state.lastPush > 120) {
      state.lastPush = now;
      pushPresence();
    }
    if (state.roomData) renderLobby(state.roomData);
  } else if (state.phase === "play" || state.phase === "dead") {
    if (state.phase === "play") movePlayer(dt);
    const lamp = holdLamp(dt);
    animateGhosts(dt);
    if (sim) drawFacility(now, lamp);
    if (state.phase === "play") updateHud(lamp);
    if (!$("map-overlay").classList.contains("hidden")) drawMap();
    if (state.multi && state.phase === "play" && now - state.lastPush > 120) {
      state.lastPush = now;
      pushPresence();
    }
  }
  updateAudio(dt);
  requestAnimationFrame(loop);
}

function typing() {
  const el = document.activeElement;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

function closeTop() {
  if (minigameOpen()) {
    closeMinigames();
    return true;
  }
  if (!$("cctv-overlay").classList.contains("hidden")) {
    hide("cctv-overlay");
    return true;
  }
  if (!$("map-overlay").classList.contains("hidden")) {
    hide("map-overlay");
    return true;
  }
  if (!$("manual").classList.contains("hidden")) {
    hide("manual");
    return true;
  }
  if (!$("firebase-help").classList.contains("hidden")) {
    hide("firebase-help");
    return true;
  }
  return false;
}

function pollLobby() {
  const data = state.roomData;
  if (state.phase !== "lobby" || !state.multi || !amHost() || !data || data.phase !== "lobby" || state.launching) return;
  const count = data.players ? Object.keys(data.players).length : 0;
  if (count >= 2 && !data.countdownEnd && !state.countdownSent) {
    state.countdownSent = true;
    pushRoom({ countdownEnd: Date.now() + 5000 });
    return;
  }
  if (count < 2) {
    state.countdownSent = false;
    if (data.countdownEnd) pushRoom({ countdownEnd: 0 });
    return;
  }
  if (data.countdownEnd && Date.now() >= data.countdownEnd) {
    state.launching = true;
    state.difficulty = data.difficulty || state.difficulty;
    void (async () => {
      await beginMatchLocal(null);
      pushRoom({ phase: "playing", countdownEnd: 0, difficulty: state.difficulty });
    })();
  }
}

function goMenu() {
  clearInterval(timer);
  state.phase = "menu";
  state.paused = false;
  state.launching = false;
  state.countdownSent = false;
  closeMinigames();
  hide("hud");
  hide("death");
  hide("downed");
  hide("pause");
  hide("lobby");
  hide("multi-setup");
  hide("map-overlay");
  hide("cctv-overlay");
  show("menu");
  if (state.multi) leaveRoom().catch(() => {});
  state.multi = false;
  state.roomData = null;
}

function bind() {
  initMinigames({ onPower: fixPower, onReactor: fixReactor });
  for (const btn of document.querySelectorAll(".diff")) {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      state.difficulty = btn.dataset.diff;
    });
  }
  $("btn-single").addEventListener("click", () => {
    unlockAudio();
    state.name = ($("player-name").value || "탐색자").slice(0, 12);
    beginSingle();
  });
  $("btn-multi").addEventListener("click", () => {
    unlockAudio();
    state.name = ($("player-name").value || "탐색자").slice(0, 12);
    if (!isFirebaseConfigured()) {
      hide("menu");
      show("firebase-help");
      return;
    }
    hide("menu");
    show("multi-setup");
    $("multi-error").textContent = "";
  });
  $("btn-manual").addEventListener("click", () => show("manual"));
  $("manual-close").addEventListener("click", () => hide("manual"));
  $("firebase-close").addEventListener("click", () => {
    hide("firebase-help");
    if (state.phase === "menu") show("menu");
  });
  $("multi-back").addEventListener("click", () => {
    hide("multi-setup");
    show("menu");
  });
  $("btn-create").addEventListener("click", async () => {
    $("multi-error").textContent = "";
    try {
      state.color = colorOf(selfId() || state.name);
      const code = await createRoom({ name: state.name, color: colorOf(state.name + "host"), difficulty: state.difficulty });
      state.color = colorOf(selfId());
      state.multi = true;
      watchRoom(onRoom);
      enterLobby();
      toast(`방 코드 ${code}`);
    } catch (err) {
      $("multi-error").textContent = err.message || "방을 만들지 못했습니다.";
    }
  });
  $("btn-join").addEventListener("click", async () => {
    $("multi-error").textContent = "";
    try {
      const data = await joinRoom({ code: $("room-code").value, name: state.name, color: "#d7c4a3" });
      state.color = colorOf(selfId());
      pushSelf({ color: state.color, name: state.name });
      state.multi = true;
      state.difficulty = data.difficulty || state.difficulty;
      watchRoom(onRoom);
      if (data.phase === "playing") {
        beginMatchLocal(data.world);
      } else enterLobby();
    } catch (err) {
      $("multi-error").textContent = err.message || "참여하지 못했습니다.";
    }
  });
  $("lobby-leave").addEventListener("click", goMenu);
  $("resume").addEventListener("click", () => {
    state.paused = false;
    hide("pause");
  });
  $("pause-menu").addEventListener("click", goMenu);
  $("retry").addEventListener("click", () => {
    hide("death");
    if (state.multi) goMenu();
    else beginSingle();
  });
  $("death-menu").addEventListener("click", goMenu);
  $("downed-menu").addEventListener("click", goMenu);
  $("map-close").addEventListener("click", () => hide("map-overlay"));
  $("cctv-close").addEventListener("click", () => hide("cctv-overlay"));
  $("mute-btn").addEventListener("click", () => {
    unlockAudio();
    setMuted(!isMuted());
    $("mute-btn").textContent = isMuted() ? "음소거" : "소리";
  });
  $("hotbar").addEventListener("click", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot) return;
    selected = Number(slot.dataset.i);
    state.dirty = true;
    renderHotbar();
  });
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest("button, input, a, .panel")) return;
    pointer = true;
    const item = inv[selected];
    if (item && item.type !== "flashlight" && state.phase === "play") useSelected();
  });
  window.addEventListener("mouseup", () => {
    pointer = false;
  });
  window.addEventListener("blur", () => {
    keys.clear();
    pointer = false;
  });
  window.addEventListener("wheel", (e) => {
    if (state.phase !== "play" || typing()) return;
    selected = (selected + (e.deltaY > 0 ? 1 : 3)) % 4;
    state.dirty = true;
    renderHotbar();
  }, { passive: true });
  window.addEventListener("pointerdown", () => unlockAudio());
}

function colorOf(seed) {
  const palette = ["#d7c4a3", "#7fbfa0", "#d08978", "#7ea2d8", "#d2b15a", "#c49ad0"];
  let h = 0;
  for (const ch of String(seed || "x")) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function enterLobby() {
  state.phase = "lobby";
  player.x = LOBBY.x + LOBBY.w / 2;
  player.y = LOBBY.y + LOBBY.h / 2 + 40;
  player.alive = true;
  player.hp = 100;
  hide("menu");
  hide("multi-setup");
  hide("hud");
  show("lobby");
  pushPresence();
}

function onKey(e) {
  if (e.code === "Escape") {
    if (closeTop()) return;
    if (state.phase === "play" && !state.multi) {
      state.paused = !state.paused;
      if (state.paused) show("pause");
      else hide("pause");
    } else if (state.phase === "play" && state.multi) {
      toast("멀티에서는 시간이 멈추지 않는다.");
    }
    return;
  }
  if (typing()) return;
  keys.add(e.code);
  if (e.repeat) return;
  if (!$("cctv-overlay").classList.contains("hidden")) {
    const num = digit(e.code);
    if (num) {
      const room = ROOMS.find((r) => r.num === num);
      if (room) viewRoom(room);
      e.preventDefault();
    }
    return;
  }
  if (!$("map-overlay").classList.contains("hidden") || minigameOpen()) return;
  if (state.phase === "play" && player.alive && !state.paused) {
    if (e.code === "KeyE") interact();
    if (e.code === "KeyQ") dropSelected();
    if (e.code === "KeyF") useSelected();
    const num = digit(e.code);
    if (num && num <= 4) {
      selected = num - 1;
      state.dirty = true;
      renderHotbar();
    }
  }
  if (["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(e.code)) e.preventDefault();
}

function digit(code) {
  if (code.startsWith("Digit")) {
    const n = Number(code.slice(5));
    return n === 0 ? 10 : n;
  }
  if (code.startsWith("Numpad")) {
    const n = Number(code.slice(6));
    return n === 0 ? 10 : n;
  }
  return 0;
}

bind();
resize();
renderHotbar();
requestAnimationFrame(loop);
