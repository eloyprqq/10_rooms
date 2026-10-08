import { ROOMS, roomById, roomCenter, anchorOf, getFloorCanvas, drawSchematic, drawMinimap, isWalkable, locate, WORLD, openAnnex, resetAnnex, annexIsOpen, annexLayer, leverSpot, whichWorld, corridorById, openSky, resetSky, skyIsOpen, skyLayer, endlessRect, paintSkyLive, cableLine, diagInfo } from "./map.js?v=46";
import { createMatch, advance, scatterMonsters, spawnAnnexMonsters, applyMonsterView, rollDelta } from "./sim.js?v=46";
import { unlockAudio, setMuted, isMuted, setMood, playHurt, playPickup, playBlackout, updateAudio } from "./audio.js?v=46";
import { initMinigames, openWires, openCard, closeMinigames, minigameOpen } from "./minigames.js?v=46";
import { TASKS, ANNEX_TASKS, DATA_ROOMS, ANNEX_DATA, initMissions, openRoomTasks, openSediment, closeMission, missionOpen, actionsFor } from "./missions.js?v=46";
import { isFirebaseConfigured, createRoom, joinRoom, watchRoom, pushSelf, pushRoom, pushWorld, signal, sendRevive, replaceLoot, placeLoot, patchLoot, removeLoot, claimLoot, leaveRoom, amHost, selfId, currentCode } from "./net.js?v=46";

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
  cell: "에너지 캡슐",
};

const MARK = {
  bread: "#d2b48a",
  stim: "#d25a52",
  flashlight: "#e0b15a",
  cctv: "#7ec8c8",
  cross: "#e7e1d4",
  clock: "#c4b0d4",
  bandage: "#d7d0c8",
  cell: "#8dce6a",
};

const PING = {
  danger: { label: "위험", color: "#e23b3b" },
  here: { label: "여기", color: "#e2c14a" },
  follow: { label: "따라와", color: "#7ec8c8" },
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
  seen: { blackout: 0, reactor: 0, scatter: 0, power: 0, reactorFix: 0, revive: 0, task: 0, lever: 0, sediment: 0, gate: 0, cell: 0, sedimentFix: 0, adminHalt: 0, adminPower: 0 },
  taskSig: null,
  roomData: null,
  lastPush: 0,
  menuPan: 0,
  boostUntil: 0,
  lampAcc: 0,
  lampOn: false,
  ping: null,
  pingAt: 0,
  shake: 0,
  dirty: true,
  clockMood: "",
  launching: false,
  countdownSent: false,
  admin: false,
  adminTasks: false,
  adminGod: false,
  adminFast: false,
  bossFight: false,
};

const player = { x: 950, y: 478, facing: 0, hp: 100, alive: true, r: 12 };
const cam = { x: 400, y: 200 };
const keys = new Set();
let pointer = false;
const mouse = { x: 0, y: 0 };
let selected = 0;
let inv = [];
let ground = [];
let sim = null;
let uid = 1;
const claiming = new Set();
const takenLoot = new Set();
const pendingDrop = new Set();
let last = performance.now();
let clockOn = false;
let timeAcc = 0;
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
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

function syncAdmin() {
  state.admin = String(state.name || "").trim().toLowerCase() === "adminstar";
  if (!state.admin) {
    state.adminTasks = false;
    state.adminGod = false;
    state.adminFast = false;
  }
  paintAdminTools();
}

function inBossFight() {
  return !!state.bossFight || state.phase === "boss";
}

function paintAdminTools() {
  const box = $("admin-tools");
  if (!box) return;
  box.classList.toggle("hidden", !state.admin || (state.phase !== "play" && state.phase !== "lobby"));
  const tasks = $("admin-tasks");
  const god = $("admin-god");
  const fast = $("admin-fast");
  if (tasks) {
    tasks.classList.toggle("on", !!state.adminTasks);
    tasks.textContent = state.adminTasks ? "미션 on" : "미션 off";
  }
  if (god) {
    god.classList.toggle("on", !!state.adminGod);
    god.textContent = state.adminGod ? "무적 on" : "무적 off";
  }
  if (fast) {
    const blocked = inBossFight();
    fast.disabled = blocked;
    fast.classList.toggle("on", !!state.adminFast && !blocked);
    fast.textContent = blocked ? "속도 보스" : state.adminFast ? "속도 on" : "속도 off";
  }
  const reactor = $("admin-reactor");
  const power = $("admin-power");
  if (reactor) {
    const on = !!sim?.reactorHalted;
    reactor.classList.toggle("on", on);
    reactor.textContent = on ? "원자로 정지" : "원자로 off";
  }
  if (power) {
    const on = !!sim?.powerStopped;
    power.classList.toggle("on", on);
    power.textContent = on ? "전기 정지" : "전기 off";
  }
}

function applyCompleteAll() {
  if (!sim) return;
  const rooms = DATA_ROOMS.concat(ANNEX_DATA);
  sim.dataGot = [...new Set([...(sim.dataGot || []), ...rooms])];
  for (const task of TASKS.concat(ANNEX_TASKS)) {
    if (!(sim.doneTasks || []).includes(task.id)) sim.doneTasks.push(task.id);
  }
  if (!sim.worldOpen) noteProgress();
  noteSky();
  toast("모든 미션을 마쳤다.");
  state.taskSig = null;
  updateTaskbar();
  if (state.multi && amHost()) publish();
}

function requestCompleteAll() {
  if (!sim || !state.admin) return;
  if (state.multi && !amHost()) {
    signal({ taskAt: Date.now(), taskKind: "adminAll", taskRoom: "all" });
    toast("미션 완료를 요청했다.");
    return;
  }
  applyCompleteAll();
}

function bodyId() {
  return state.multi ? selfId() : "you";
}

function playerRoom() {
  const loc = locate(player.x, player.y);
  return loc.kind === "room" ? loc.id : null;
}

function isGhost() {
  return state.multi && state.phase === "play" && !player.alive;
}

function placeLabel() {
  const loc = locate(player.x, player.y);
  if (loc.kind === "room") return roomById(loc.id).name;
  if (loc.id === "diag") return "암복도";
  if (loc.id === "cable") return "케이블카";
  if (loc.id === "endless") return "끝없는 복도";
  if (loc.kind === "corridor") return "복도";
  return "시설";
}

function nextUid() {
  uid += 1;
  return state.multi ? `${selfId()}-${uid}` : String(uid);
}

function makeItem(type, extra = {}) {
  const item = { uid: nextUid(), type, ...extra };
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
  if (state.admin && state.adminGod) return;
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
  player.corpse = { x: player.x, y: player.y };
  closeMinigames();
  closeMission();
  hide("cctv-overlay");
  hide("map-overlay");
  pushPresence();
  if (source === "meltdown" || !state.multi) {
    state.phase = "dead";
    stopClock();
    $("death-title").textContent = source === "meltdown" ? "원자로가 폭파했다" : source === "choke" ? "숨이 막혔다" : "어둠에 남았다";
    $("death-sub").textContent = `버틴 시각 ${sim ? sim.time : 0}`;
    hide("downed");
    show("death");
    hide("hud");
  } else {
    toast("유령이 되었다. 같은 방에서 붕대를 받으면 돌아온다.");
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
    tasks: (sim.doneTasks || []).slice(),
    dataGot: (sim.dataGot || []).slice(),
    worldOpen: !!sim.worldOpen,
    skyOpen: !!sim.skyOpen,
    reactorHalted: !!sim.reactorHalted,
    powerStopped: !!sim.powerStopped,
    powerHoldUntil: sim.powerHoldUntil || 0,
    sediment: sim.sediment && sim.sediment.start ? { start: sim.sediment.start, until: sim.sediment.until || sim.sediment.start + 10 } : { start: 0 },
    gateOpenUntil: sim.gateOpenUntil || 0,
    gateCardAt: sim.gateCardAt || 0,
    beat: Date.now(),
  });
}

function purgeClocks() {
  const before = inv.length + (state.multi ? 0 : ground.length);
  inv = inv.filter((it) => it.type !== "clock" || it.left > 0);
  if (!state.multi) ground = ground.filter((it) => it.type !== "clock" || it.left > 0);
  if (inv.length + (state.multi ? 0 : ground.length) !== before) {
    toast("시계가 부서졌다.");
    state.dirty = true;
  }
}

function starterLoot() {
  const s2 = roomCenter("supply2");
  const s1 = roomCenter("supply1");
  return [
    { ...makeItem("flashlight"), uid: "start-flashlight", x: s2.x + 36, y: s2.y + 20 },
    { ...makeItem("bread"), uid: "start-bread", x: s1.x - 30, y: s1.y + 16 },
  ];
}

function syncGround(loot) {
  const next = loot
    ? Object.entries(loot).map(([id, raw]) => {
        const item = { uid: id, type: raw.type, x: raw.x || 0, y: raw.y || 0 };
        if (raw.dura != null) item.dura = raw.dura;
        if (raw.left != null) item.left = raw.left;
        return item;
      })
    : [];
  const ids = new Set(next.map((it) => it.uid));
  for (const id of [...takenLoot]) if (!loot || loot[id] == null) takenLoot.delete(id);
  for (const id of [...pendingDrop]) if (ids.has(id)) pendingDrop.delete(id);
  const visible = next.filter((it) => !takenLoot.has(it.uid) && !claiming.has(it.uid));
  for (const it of ground) {
    if (pendingDrop.has(it.uid) && !ids.has(it.uid)) visible.push(it);
  }
  ground = visible;
}

function decaySharedClocks() {
  const gone = [];
  for (const it of ground) {
    if (it.type !== "clock") continue;
    it.left -= 1;
    if (it.left <= 0) {
      gone.push(it.uid);
      removeLoot(it.uid);
    } else patchLoot(it.uid, { left: it.left });
  }
  if (!gone.length) return;
  ground = ground.filter((it) => !gone.includes(it.uid));
  toast("시계가 부서졌다.");
}

function consume(snap) {
  if (!sim || snap.t <= state.applied) return;
  applyMonsterView(sim, snap.monsters);
  sim.time = snap.t;
  sim.power = snap.power;
  sim.reactor = snap.reactor;
  sim.meltdown = !!snap.meltdown;
  if ((snap.powerHoldUntil || 0) > (sim.powerHoldUntil || 0)) sim.powerHoldUntil = snap.powerHoldUntil;
  if (snap.sediment && snap.sediment.start) {
    if (!sim.sediment || sim.sediment.start !== snap.sediment.start) {
      sim.sediment = { start: snap.sediment.start, until: snap.sediment.until || snap.sediment.start + 10 };
      if (state.seen.sediment !== snap.sediment.start) {
        state.seen.sediment = snap.sediment.start;
        toast("침전물 위험 신호가 열렸다. 침전조로 가라.");
      }
    }
  } else if (snap.sediment && snap.sediment.start === 0) {
    if (sim.sediment && sim.time >= (sim.sediment.until || sim.sediment.start + 10)) toast("침전물 신호가 가라앉았다.");
    sim.sediment = null;
  }
  state.applied = snap.t;
  for (const it of inv) {
    if (it.type === "clock") it.left -= 1;
  }
  if (!state.multi) {
    for (const it of ground) {
      if (it.type === "clock") it.left -= 1;
    }
  }
  purgeClocks();
  if (state.multi && amHost()) decaySharedClocks();
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
  if (snap.t % 17 === 0 && snap.power === false && state.seen.blackout !== snap.t) {
    state.seen.blackout = snap.t;
    toast("정전이다.");
    playBlackout();
  }
  if (snap.reactor && state.seen.reactor !== snap.reactor.start) {
    state.seen.reactor = snap.reactor.start;
    toast("원자로 이상. 40초 안에 카드를 긁어라.");
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
    applyWorldMission(world);
    applyFacility(world);
    return;
  }
  for (const snap of world.history || []) consume(snap);
  if (world.monsters) applyMonsterView(sim, world.monsters);
  sim.power = world.power !== false;
  sim.reactor = world.reactor || null;
  applyWorldMission(world);
  applyFacility(world);
  if (world.meltdown && state.phase === "play" && player.alive) hurt(9999, "meltdown");
}

function revealAnnex() {
  if (!sim || annexIsOpen()) return false;
  sim.worldOpen = true;
  openAnnex();
  return true;
}

function revealSky() {
  if (!sim || skyIsOpen()) return false;
  sim.skyOpen = true;
  openSky();
  return true;
}

function noteProgress() {
  if (!sim || sim.worldOpen || coreDoneCount() < TASKS.length) return;
  sim.worldOpen = true;
  revealAnnex();
  if (!state.multi || amHost()) spawnAnnexMonsters(sim);
  toast("모든 미션을 마쳤다. 정원 서쪽에 통로가 열렸다.");
}

function noteSky() {
  if (!sim || skyIsOpen()) return;
  if (ANNEX_TASKS.some((task) => !(sim.doneTasks || []).includes(task.id))) return;
  if (!annexIsOpen() && coreDoneCount() < TASKS.length) return;
  if (!annexIsOpen()) {
    sim.worldOpen = true;
    revealAnnex();
    if (!state.multi || amHost()) spawnAnnexMonsters(sim);
  }
  revealSky();
  toast("옥상 위에 케이블카가 내려왔다.");
}

function applyFacility(world) {
  if (!world || !sim) return;
  if (world.worldOpen && revealAnnex() && state.phase === "play" && !amHost()) {
    toast("정원 서쪽에 통로가 열렸다.");
  }
  if (world.skyOpen && revealSky() && state.phase === "play" && !amHost()) {
    toast("옥상 위에 케이블카가 내려왔다.");
  }
  if (typeof world.reactorHalted === "boolean" && world.reactorHalted !== !!sim.reactorHalted) {
    sim.reactorHalted = world.reactorHalted;
    if (world.reactorHalted) sim.reactor = null;
    if (state.phase === "play") toast(world.reactorHalted ? "원자로 가동이 멈췄다. 이제는 폭파하지 않는다." : "원자로가 다시 돌아간다.");
  }
  if (typeof world.powerStopped === "boolean" && world.powerStopped !== !!sim.powerStopped) {
    sim.powerStopped = world.powerStopped;
    if (world.powerStopped) sim.power = false;
    else sim.power = true;
    if (state.phase === "play") {
      if (world.powerStopped) {
        toast("전기가 꺼졌다.");
        playBlackout();
      } else toast("전기가 돌아왔다.");
    }
  }
  if ((world.powerHoldUntil || 0) > (sim.powerHoldUntil || 0)) sim.powerHoldUntil = world.powerHoldUntil;
  if (world.sediment && world.sediment.start) {
    if (!sim.sediment || sim.sediment.start !== world.sediment.start) {
      sim.sediment = { start: world.sediment.start, until: world.sediment.until || world.sediment.start + 10 };
      if (state.phase === "play" && state.seen.sediment !== world.sediment.start) {
        state.seen.sediment = world.sediment.start;
        toast("침전물 위험 신호가 열렸다. 침전조로 가라.");
      }
    }
  } else if (world.sediment && world.sediment.start === 0) sim.sediment = null;
  if ((world.gateOpenUntil || 0) > (sim.gateOpenUntil || 0)) sim.gateOpenUntil = world.gateOpenUntil;
  if ((world.gateCardAt || 0) > (sim.gateCardAt || 0)) sim.gateCardAt = world.gateCardAt;
}

function applyReactorStop(on) {
  if (!sim) return;
  sim.reactorHalted = !!on;
  if (on) sim.reactor = null;
  toast(on ? "원자로 가동이 멈췄다. 이제는 폭파하지 않는다." : "원자로가 다시 돌아간다.");
  paintAdminTools();
  if (state.multi && amHost()) publish();
}

function applyPowerStop(on) {
  if (!sim) return;
  sim.powerStopped = !!on;
  sim.power = !on;
  if (on) {
    toast("전기가 꺼졌다.");
    playBlackout();
  } else toast("전기가 돌아왔다.");
  paintAdminTools();
  if (state.multi && amHost()) publish();
}

function haltReactor() {
  if (!sim || sim.reactorHalted) return;
  sim.reactorHalted = true;
  sim.reactor = null;
  toast("원자로 가동이 멈췄다. 이제는 폭파하지 않는다.");
  paintAdminTools();
  if (state.multi && amHost()) publish();
}

function requestHalt() {
  if (!sim || sim.reactorHalted) {
    toast("레버는 이미 내려가 있다.");
    return;
  }
  if (state.multi && !amHost()) {
    signal({ leverAt: Date.now() });
    toast("레버를 내렸다.");
    return;
  }
  haltReactor();
}

function nearLever() {
  const spot = leverSpot();
  if (!spot) return false;
  return Math.hypot(player.x - spot.x, player.y - spot.y) < 78;
}

function sendPing(kind) {
  if (state.phase !== "play" || state.paused || !PING[kind]) return;
  const now = Date.now();
  if (now - state.pingAt < 1200) return;
  state.pingAt = now;
  state.ping = { kind, at: now, x: player.x, y: player.y, name: state.name };
  pushPresence();
  toast(PING[kind].label);
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
    corpseX: player.corpse ? Math.round(player.corpse.x) : "",
    corpseY: player.corpse ? Math.round(player.corpse.y) : "",
    lamp: !!state.lampOn,
    ping: state.ping?.kind || "",
    pingAt: state.ping?.at || 0,
    pingX: state.ping ? Math.round(state.ping.x) : "",
    pingY: state.ping ? Math.round(state.ping.y) : "",
  });
}

function resetRun(difficulty) {
  resetSky();
  resetAnnex();
  state.bossFight = false;
  state.eye = null;
  state.eyeScene = null;
  state.eyeHitAt = 0;
  state.chaseBlocks = [];
  state.chaseLids = [];
  state.chaseLasers = [];
  state.eyeParts = [];
  state.cannon = null;
  state.eyeBall = null;
  state.cableRide = null;
  state.wallEyes = [];
  state.eyeSplit = null;
  state.hazHitAt = 0;
  closeMinigames();
  closeMission();
  hide("map-overlay");
  hide("cctv-overlay");
  hide("pause");
  hide("death");
  hide("downed");
  inv = [];
  ground = [];
  claiming.clear();
  takenLoot.clear();
  pendingDrop.clear();
  selected = 0;
  state.localExp = {};
  state.supplyCd = {};
  state.cctvReadyAt = 0;
  state.cctvItem = null;
  state.paused = false;
  state.applied = 1;
  state.synced = false;
  state.boostUntil = 0;
  state.seen = { blackout: 0, reactor: 0, scatter: 0, power: 0, reactorFix: 0, revive: 0, task: 0, lever: 0, sediment: 0, gate: 0, cell: 0, sedimentFix: 0, adminHalt: 0, adminPower: 0 };
  state.gateStay = 0;
  state.lampOn = false;
  state.ping = null;
  state.pingAt = 0;
  state.taskSig = null;
  player.hp = 100;
  player.alive = true;
  player.corpse = null;
  player.facing = 0;
  const spawn = roomCenter("cafeteria");
  player.x = spawn.x;
  player.y = spawn.y;
  sim = createMatch(difficulty);
  ghosts = new Map();
  if (!state.multi) {
    const s2 = roomCenter("supply2");
    const s1 = roomCenter("supply1");
    ground.push({ ...makeItem("flashlight"), x: s2.x + 36, y: s2.y + 20 });
    ground.push({ ...makeItem("bread"), x: s1.x - 30, y: s1.y + 16 });
  }
  state.dirty = true;
}

function beginSingle() {
  syncAdmin();
  state.multi = false;
  state.phase = "boot";
  resetRun(state.difficulty);
  state.synced = true;
  state.phase = "play";
  hide("menu");
  show("hud");
  toast(state.admin ? "관리자 권한. 시각과 괴물 위치가 보인다." : "식당이다. 보급소에 물건이 있다.");
  armTimer();
}

async function beginMatchLocal(world) {
  syncAdmin();
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
  if (state.admin) toast("관리자 권한. 시각과 괴물 위치가 보인다.");
  if (state.multi && amHost() && !world) await replaceLoot(starterLoot());
  if (state.multi) syncGround(state.roomData?.loot);
  if (state.multi && amHost()) await publish();
  armTimer();
}

function armTimer() {
  clockOn = true;
  timeAcc = 0;
}

function thawReactor() {
  if (sim?.reactor && state.pauseBegan) sim.reactor.deadlineAt += Date.now() - state.pauseBegan;
  state.pauseBegan = 0;
}

function stopClock() {
  clockOn = false;
  timeAcc = 0;
}

function tickReactor() {
  if (eyeSceneHold()) return;
  if (!sim?.reactor || sim.meltdown || state.paused || state.phase !== "play") return;
  if (state.multi && !amHost()) return;
  if (Date.now() < sim.reactor.deadlineAt) return;
  sim.reactor = null;
  sim.meltdown = true;
  hurt(9999, "meltdown");
  if (state.multi) publish();
}

function tickTime(dt) {
  if (eyeSceneHold()) return;
  if (!clockOn || state.phase !== "play" || state.paused || !sim) return;
  if (!state.multi && !player.alive) return;
  if (state.multi && !amHost()) return;
  timeAcc += dt * 1000;
  if (timeAcc < 6000) return;
  timeAcc -= 6000;
  if (timeAcc > 6000) timeAcc = 0;
  const snaps = advance(sim, rollDelta(), bodies(), Math.random, Date.now());
  for (const snap of snaps) {
    consume(snap);
    if (state.phase !== "play") break;
  }
  if (state.multi) publish();
}

function fixPower() {
  if (!sim) return;
  if (sim.powerStopped) {
    toast("전기는 멈춰 있다.");
    return;
  }
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

function busy() {
  return minigameOpen() || missionOpen();
}

function finishTask(roomId) {
  if (!sim || !roomId) return;
  if (state.multi && !amHost()) {
    signal({ taskAt: Date.now(), taskKind: "done", taskRoom: String(roomId) });
    return;
  }
  if (String(roomId).includes(",")) {
    for (const id of String(roomId).split(",")) finishTask(id);
    return;
  }
  if ((sim.doneTasks || []).includes(roomId)) return;
  const task = findTask(roomId);
  if (!task) return;
  sim.doneTasks.push(roomId);
  if (roomId === "shields") sim.shieldsAt = performance.now();
  const line = task.id.startsWith("data:") ? `${task.name} 데이터를 올렸다.` : `${task.name} · ${task.title} 완료.`;
  if (!sim.worldOpen && coreDoneCount() >= TASKS.length) noteProgress();
  else toast(line);
  noteSky();
  updateTaskbar();
  if (state.multi && amHost()) publish();
}

function noteDownload(roomId) {
  if (!sim || (sim.dataGot || []).includes(roomId)) return;
  if ((sim.doneTasks || []).includes(`data:${roomId}`)) return;
  if (state.multi && !amHost()) {
    signal({ taskAt: Date.now(), taskKind: "download", taskRoom: roomId });
    return;
  }
  sim.dataGot.push(roomId);
  const task = findTask(`data:${roomId}`);
  toast(`${task ? task.name : "시설"} 데이터를 받았다. 전기실에서 올려라.`);
  updateTaskbar();
  if (state.multi) publish();
}

function applyWorldMission(world) {
  if (!world || !sim) return;
  if (Array.isArray(world.dataGot)) {
    const prev = new Set(sim.dataGot || []);
    sim.dataGot = world.dataGot.slice();
    if (state.phase === "play") {
      for (const id of sim.dataGot) {
        if (prev.has(id)) continue;
        const task = findTask(`data:${id}`);
        toast(`${task ? task.name : "시설"} 데이터를 받았다. 전기실에서 올려라.`);
      }
    }
  }
  if ((world.tasks || []).includes("shields") && !sim.shieldsAt) {
    sim.shieldsAt = state.phase === "play" ? performance.now() : performance.now() - 20000;
  }
  if (Array.isArray(world.tasks)) syncTasks(world.tasks);
}

function syncTasks(list) {
  if (!sim || !Array.isArray(list)) return;
  const prev = new Set(sim.doneTasks || []);
  sim.doneTasks = list.slice();
  if (state.phase === "play") {
    const added = sim.doneTasks.filter((id) => !prev.has(id));
    const prevCore = TASKS.filter((task) => prev.has(task.id)).length;
    if (prevCore < TASKS.length && coreDoneCount() >= TASKS.length) noteProgress();
    noteSky();
    if (added.length) {
      const task = findTask(added[added.length - 1]);
      if (task) toast(`${task.name} 미션 완료.`);
    }
  }
  updateTaskbar();
}

function findTask(id) {
  return TASKS.find((task) => task.id === id) || ANNEX_TASKS.find((task) => task.id === id);
}

function coreDoneCount() {
  const done = sim?.doneTasks || [];
  return TASKS.filter((task) => done.includes(task.id)).length;
}

function missionSpan() {
  return annexIsOpen() ? TASKS.concat(ANNEX_TASKS) : TASKS;
}

function missionDoneCount() {
  const done = sim?.doneTasks || [];
  return missionSpan().filter((task) => done.includes(task.id)).length;
}

function updateTaskbar() {
  const done = sim?.doneTasks || [];
  const total = missionSpan().length;
  const count = missionDoneCount();
  const pct = (count / total) * 100;
  const fill = $("task-fill");
  const label = $("task-label");
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `미션 ${count}/${total}`;
  const got = sim?.dataGot || [];
  const sig = `${done.join(",")}|${got.join(",")}|${annexIsOpen() ? 1 : 0}`;
  if (sig === state.taskSig) return;
  state.taskSig = sig;
  const ul = $("task-list");
  if (!ul) return;
  ul.innerHTML = "";
  const list = missionSpan();
  for (const task of list) {
    const li = document.createElement("li");
    const on = done.includes(task.id);
    li.className = on ? "done" : "";
    if (task.id.startsWith("data:")) {
      const room = task.id.slice(5);
      if (on) li.textContent = `✓ ${task.name}  데이터 업로드`;
      else if (got.includes(room)) li.textContent = `↓ ${task.name}  데이터 받음 · 전기실`;
      else li.textContent = `· ${task.name}  데이터 다운로드`;
    } else li.textContent = `${on ? "✓" : "·"} ${task.name}  ${task.title}`;
    ul.appendChild(li);
  }
}

const ROOM_TASKS = {
  garden: ["garden-trash", "data:garden"],
  supply2: ["data:supply2"],
  map: ["data:map"],
  cafeteria: ["cafeteria", "data:cafeteria"],
  supply1: ["oxygen-supply1", "data:supply1"],
  cctv: ["shields", "data:cctv"],
  bedroom: ["oxygen-bedroom", "data:bedroom"],
  rooftop: ["meteor", "data:rooftop"],
  spare: ["spare-mag", "data:spare"],
  hold: ["hold-bolt", "data:hold"],
  cool: ["cool-valve", "data:cool"],
  filter: ["filter-swap", "filter-flow"],
  archive: ["archive-scan", "data:archive"],
  settle: ["settle-sludge"],
  vent: ["vent-fan", "data:vent"],
  pump: ["pump-leak"],
  kiln: ["kiln-light", "kiln-ash"],
  watch: ["watch-aim", "data:watch"],
  upper: ["upper-pipe", "upper-vent"],
  drain: ["drain-pump", "drain-grate"],
};

const WEST_ROOMS = new Set(["spare", "hold", "cool", "filter", "archive", "settle", "vent", "pump", "kiln", "watch", "upper", "drain"]);

function incompleteRooms() {
  const done = new Set(sim?.doneTasks || []);
  const open = annexIsOpen();
  const ids = [];
  for (const [roomId, tasks] of Object.entries(ROOM_TASKS)) {
    if (!open && WEST_ROOMS.has(roomId)) continue;
    if (tasks.some((id) => !done.has(id))) ids.push(roomId);
  }
  return ids;
}

function nearestGround() {
  let best = null;
  let bestD = 80;
  for (const g of ground) {
    const d = Math.hypot(g.x - player.x, g.y - player.y);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

function takeGround(best) {
  if (!best) return false;
  if (inv.length >= 4) {
    toast("가방이 가득 찼다.");
    return true;
  }
  if (!state.multi) {
    ground = ground.filter((g) => g !== best);
    inv.push(best);
    state.dirty = true;
    playPickup();
    return true;
  }
  if (claiming.has(best.uid)) return true;
  claiming.add(best.uid);
  const picked = { ...best };
  claimLoot(best.uid)
    .then((ok) => {
      claiming.delete(best.uid);
      if (!ok) {
        toast("이미 가져갔다.");
        return;
      }
      takenLoot.add(picked.uid);
      ground = ground.filter((g) => g.uid !== picked.uid);
      if (inv.length >= 4) {
        takenLoot.delete(picked.uid);
        placeLoot(picked).catch(() => {});
        toast("가방이 가득 찼다.");
        return;
      }
      inv.push(picked);
      state.dirty = true;
      playPickup();
    })
    .catch(() => {
      claiming.delete(best.uid);
      toast("줍지 못했다.");
    });
  return true;
}

function interact() {
  if (state.phase !== "play" || !player.alive || busy()) return;
  if (nearLever()) {
    requestHalt();
    return;
  }
  const loc = locate(player.x, player.y);
  if (loc.kind === "room") {
    const c = roomCenter(loc.id);
    const near = Math.hypot(player.x - c.x, player.y - c.y) < 200;
    if (near && loc.id === "electrical" && !sim.power) {
      openWires();
      return;
    }
    if (near && loc.id === "reactor" && sim.reactor) {
      openCard();
      return;
    }
    if (near && loc.id === "settle" && sim.sediment) {
      openSediment();
      return;
    }
    if (near && loc.id === "store") {
      takeCells();
      return;
    }
    if (near && loc.id === "release") {
      startBoss();
      return;
    }
    if (near && loc.id === "electrical" && cellCount() >= 3) {
      installCells();
      return;
    }
  }
  if (nearGatePanel()) {
    swipeGate();
    return;
  }
  if (tryCannonUse()) return;
  if (takeGround(nearestGround())) return;
  if (loc.kind === "room") {
    const c = roomCenter(loc.id);
    const near = Math.hypot(player.x - c.x, player.y - c.y) < 200;
    if (near && openRoomTasks(loc.id, missionProgress())) return;
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
    sendRevive(target.id, player.x, player.y);
    removeItem(item);
    toast("붕대를 감았다.");
  } else if (item.type === "clock") {
    toast(`시각 ${sim.time}. 시계는 ${Math.max(0, Math.ceil(item.left))} 남았다.`);
  }
}

function dropSelected() {
  const item = inv[selected];
  if (!item || (state.multi && !player.alive)) return;
  const copy = { ...item, x: player.x + Math.cos(player.facing) * 52, y: player.y + Math.sin(player.facing) * 52 };
  removeItem(item);
  if (!state.multi) {
    ground.push(copy);
    toast("바닥에 내려놓았다.");
    return;
  }
  pendingDrop.add(copy.uid);
  ground.push(copy);
  placeLoot(copy)
    .then(() => toast("바닥에 내려놓았다."))
    .catch(() => {
      pendingDrop.delete(copy.uid);
      ground = ground.filter((g) => g.uid !== copy.uid);
      if (inv.length < 4) inv.push(item);
      state.dirty = true;
      toast("내려놓지 못했다.");
    });
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
    syncGround(data.loot);
    if (!amHost()) catchUp(data.world);
    if (amHost() && sim) {
      if (data.scatterAt && data.scatterAt !== state.seen.scatter) {
        state.seen.scatter = data.scatterAt;
        scatterMonsters(sim);
        publish();
      }
      if (data.powerFixAt && data.powerFixAt !== state.seen.power) {
        state.seen.power = data.powerFixAt;
        if (!sim.powerStopped) sim.power = true;
        publish();
      }
      if (data.reactorFixAt && data.reactorFixAt !== state.seen.reactorFix) {
        state.seen.reactorFix = data.reactorFixAt;
        sim.reactor = null;
        publish();
      }
      if (data.leverAt && data.leverAt !== state.seen.lever) {
        state.seen.lever = data.leverAt;
        haltReactor();
      }
      if (data.sedimentFixAt && data.sedimentFixAt !== state.seen.sedimentFix) {
        state.seen.sedimentFix = data.sedimentFixAt;
        sim.sediment = null;
        publish();
      }
      if (data.cellAt && data.cellAt !== state.seen.cell) {
        state.seen.cell = data.cellAt;
        sim.powerHoldUntil = Math.max(sim.powerHoldUntil || 0, data.cellUntil || 0);
        publish();
      }
      if (data.gateAt && data.gateAt !== state.seen.gate) {
        state.seen.gate = data.gateAt;
        if ((data.gateCardAt || 0) > (sim.gateCardAt || 0)) sim.gateCardAt = data.gateCardAt;
        if (data.gateOk && (data.gateOpenUntil || 0) > (sim.gateOpenUntil || 0)) sim.gateOpenUntil = data.gateOpenUntil;
        publish();
      }
      if (data.adminHaltAt && data.adminHaltAt !== state.seen.adminHalt) {
        state.seen.adminHalt = data.adminHaltAt;
        applyReactorStop(!!data.adminHalt);
      }
      if (data.adminPowerAt && data.adminPowerAt !== state.seen.adminPower) {
        state.seen.adminPower = data.adminPowerAt;
        applyPowerStop(!!data.adminPowerOff);
      }
      if (data.taskAt && data.taskAt !== state.seen.task && data.taskRoom) {
        state.seen.task = data.taskAt;
        if (data.taskKind === "download") noteDownload(data.taskRoom);
        else if (data.taskKind === "adminAll") applyCompleteAll();
        else finishTask(data.taskRoom);
      }
    }
    const me = data.players?.[bodyId()];
    if (me?.reviveAt && me.reviveAt !== state.seen.revive && !player.alive) {
      state.seen.revive = me.reviveAt;
      const rx = Number(me.reviveX);
      const ry = Number(me.reviveY);
      if (Number.isFinite(rx) && Number.isFinite(ry)) {
        player.x = rx;
        player.y = ry;
      }
      player.alive = true;
      player.hp = 50;
      player.corpse = null;
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
  const start = $("lobby-start");
  if (start) {
    start.classList.toggle("hidden", !amHost());
    start.disabled = !!state.launching;
  }
  $("lobby-status").textContent = amHost()
    ? `${n}/4명 대기. 시작을 누르면 출발한다. 난이도 ${data.difficulty || state.difficulty}`
    : `${n}/4명 대기. 방장이 시작을 누르면 출발한다. 난이도 ${data.difficulty || state.difficulty}`;
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
  if (state.paused || busy() || eyeSceneHold()) return;
  if (!player.alive && !isGhost()) return;
  if ($("map-overlay").classList.contains("hidden") === false) return;
  if (!$("cctv-overlay").classList.contains("hidden")) return;
  if (tickCableRide(dt)) return;
  let x = 0;
  let y = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  const len = Math.hypot(x, y);
  const boost = performance.now() < state.boostUntil ? 1.5 : 1;
  const cheat = state.admin && state.adminFast && !inBossFight() ? 2 : 1;
  const chase = inChase() ? 1.5 : 1;
  const speed = (state.phase === "lobby" ? 240 : 230) * boost * cheat * chase;
  let dx = 0;
  let dy = 0;
  if (len) {
    dx = (x / len) * speed * dt;
    dy = (y / len) * speed * dt;
    player.facing = Math.atan2(y, x);
  }
  if (!dx && !dy) return;
  if (isGhost()) {
    player.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, player.x + dx));
    player.y = Math.max(WORLD.minY, Math.min(WORLD.maxY, player.y + dy));
    return;
  }
  const walk = state.phase === "lobby" ? lobbyWalk : isWalkable;
  const nx = player.x + dx;
  const ny = player.y + dy;
  const blocked = (x, y) => (state.phase === "play" && crossesGate(x, y) && !gateOpenNow()) || chaseBlocked(x, y);
  if (walk(nx, player.y) && !blocked(nx, player.y)) player.x = nx;
  if (walk(player.x, ny) && !blocked(player.x, ny)) player.y = ny;
}

function lobbyWalk(x, y) {
  return x > LOBBY.x + 28 && y > LOBBY.y + 28 && x < LOBBY.x + LOBBY.w - 28 && y < LOBBY.y + LOBBY.h - 28;
}

function cableVec() {
  const c = cableLine();
  const dx = c.x2 - c.x1;
  const dy = c.y2 - c.y1;
  const len = Math.hypot(dx, dy) || 1;
  return { c, len, ux: dx / len, uy: dy / len, px: -dy / len, py: dx / len };
}

function cablePoint(along, side) {
  const v = cableVec();
  return {
    x: v.c.x1 + v.ux * along + v.px * side,
    y: v.c.y1 + v.uy * along + v.py * side,
  };
}

function startCableRide() {
  if (state.cableRide?.active) return;
  const v = cableVec();
  const info = diagInfo(player.x, player.y, v.c);
  const along = info.t * v.len;
  state.cableRide = {
    active: true,
    along,
    side: (info.x - (v.c.x1 + v.ux * along)) * v.px + (info.y - (v.c.y1 + v.uy * along)) * v.py,
    dir: along < v.len * 0.5 ? 1 : -1,
  };
  toast(state.cableRide.dir > 0 ? "케이블카가 올라간다." : "케이블카가 내려간다.");
}

function tickCableRide(dt) {
  if (!skyIsOpen() || isGhost() || !player.alive) {
    if (state.cableRide) state.cableRide = null;
    return false;
  }
  const loc = locate(player.x, player.y);
  if (!state.cableRide?.active) {
    if (loc.id !== "cable") return false;
    startCableRide();
  }
  const ride = state.cableRide;
  if (!ride?.active) return false;
  const v = cableVec();
  ride.along += ride.dir * 268 * dt;
  let ix = 0;
  let iy = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) iy -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) iy += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
  const ilen = Math.hypot(ix, iy);
  if (ilen) {
    ix /= ilen;
    iy /= ilen;
    ride.side += (ix * v.px + iy * v.py) * 240 * dt;
  }
  const maxSide = v.c.half - 24;
  ride.side = Math.max(-maxSide, Math.min(maxSide, ride.side));
  if (ride.along <= 8) {
    const roof = roomById("rooftop");
    player.x = roof.x + roof.w - 160;
    player.y = roof.y + 210;
    state.cableRide = null;
    toast("옥상에 내렸다.");
    return true;
  }
  if (ride.along >= v.len - 8) {
    const watch = roomById("skywatch");
    player.x = watch.x + 180;
    player.y = watch.y + watch.h - 210;
    state.cableRide = null;
    toast("관측대에 도착했다.");
    return true;
  }
  const p = cablePoint(ride.along, ride.side);
  player.x = p.x;
  player.y = p.y;
  player.facing = Math.atan2(v.uy * ride.dir, v.ux * ride.dir);
  tickCableHazards(performance.now());
  return true;
}

function cableGiantEyes() {
  const v = cableVec();
  return [
    { along: v.len * 0.28, side: 168, phase: 0.1 },
    { along: v.len * 0.55, side: -176, phase: 1.2 },
    { along: v.len * 0.78, side: 160, phase: 0.6 },
  ];
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function tickCableHazards(now) {
  if (!player.alive || isGhost()) return;
  if (state.admin && state.adminGod) return;
  const ride = state.cableRide;
  if (!ride?.active) return;
  const v = cableVec();
  for (let i = 1; i <= 12; i++) {
    const along = (v.len * i) / 13;
    const side = i % 2 ? 1 : -1;
    const pop = peekAmt(i * 0.33, now, 1.85);
    if (pop < 0.25) continue;
    const wall = (v.c.half - 6) * side;
    const p = cablePoint(along, wall - side * pop * 54);
    if (Math.hypot(player.x - p.x, player.y - p.y) < 20 + pop * 8) {
      hazHit(20, "벽의 눈이 스쳤다.");
      return;
    }
  }
  for (const g of cableGiantEyes()) {
    const origin = cablePoint(g.along, g.side);
    const sweep = Math.sin(now / 700 + g.phase) * 0.55;
    const ang = Math.atan2(-g.side * v.py, -g.side * v.px) + sweep;
    const reach = v.c.half * 2 + 90;
    const x2 = origin.x + Math.cos(ang) * reach;
    const y2 = origin.y + Math.sin(ang) * reach;
    const on = (now / 1000 + g.phase) % 2.4 < 1.15;
    if (!on) continue;
    if (distToSeg(player.x, player.y, origin.x, origin.y, x2, y2) < 16) {
      hazHit(20, "레이저.");
      return;
    }
  }
}

function drawLidEye(x, y, r, open) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.22 + open * 0.78);
  ctx.fillStyle = "#e8eaee";
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e11d2e";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a0306";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCableRide() {
  if (!skyIsOpen()) return;
  const v = cableVec();
  const now = performance.now();
  for (let i = 1; i <= 12; i++) {
    const along = (v.len * i) / 13;
    const side = i % 2 ? 1 : -1;
    const pop = peekAmt(i * 0.33, now, 1.85);
    const wall = (v.c.half - 4) * side;
    const p = cablePoint(along, wall - side * pop * 54);
    drawLidEye(p.x, p.y, 18, 0.35 + pop * 0.65);
  }
  for (const g of cableGiantEyes()) {
    const origin = cablePoint(g.along, g.side);
    drawLidEye(origin.x, origin.y, 58, 0.92);
    const sweep = Math.sin(now / 700 + g.phase) * 0.55;
    const ang = Math.atan2(-g.side * v.py, -g.side * v.px) + sweep;
    const reach = v.c.half * 2 + 90;
    const on = (now / 1000 + g.phase) % 2.4 < 1.15;
    if (!on) continue;
    ctx.strokeStyle = "rgba(225, 29, 46, 0.82)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + Math.cos(ang) * reach, origin.y + Math.sin(ang) * reach);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 210, 210, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + Math.cos(ang) * reach, origin.y + Math.sin(ang) * reach);
    ctx.stroke();
  }
  const ride = state.cableRide;
  if (!ride?.active) return;
  const p = cablePoint(ride.along, ride.side);
  const sway = Math.sin(now / 180) * 3;
  ctx.save();
  ctx.translate(p.x + v.px * sway, p.y + v.py * sway);
  ctx.rotate(Math.atan2(v.uy, v.ux));
  ctx.fillStyle = "#1c1a16";
  ctx.fillRect(-34, 10, 68, 44);
  ctx.fillStyle = "#3a342c";
  ctx.fillRect(-30, 14, 60, 22);
  ctx.strokeStyle = "#8a8070";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-18, 10);
  ctx.lineTo(-18, -18);
  ctx.moveTo(18, 10);
  ctx.lineTo(18, -18);
  ctx.moveTo(-28, -18);
  ctx.lineTo(28, -18);
  ctx.stroke();
  ctx.restore();
}

function holdLamp(dt) {
  const item = inv[selected];
  const on = item && item.type === "flashlight" && item.dura > 0 && (pointer || keys.has("KeyF")) && state.phase === "play" && player.alive && !state.paused;
  state.lampOn = !!on;
  if (!on) return false;
  state.lampAcc += dt;
  while (state.lampAcc >= 0.1) {
    state.lampAcc -= 0.1;
    item.dura -= 3;
    if (item.dura <= 0) {
      item.dura = 0;
      state.lampOn = false;
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
  const showTime = state.admin || !!clock;
  $("clock-readout").classList.toggle("hidden", !showTime);
  if (state.admin) $("clock-readout").textContent = `시각 ${sim.time}`;
  else if (clock) $("clock-readout").textContent = `시각 ${sim.time}  ·  시계 ${Math.ceil(clock.left)}`;
  let alarm = "";
  if (sim.reactor) {
    const mark = state.paused && state.pauseBegan ? state.pauseBegan : Date.now();
    const sec = Math.max(0, Math.ceil((sim.reactor.deadlineAt - mark) / 1000));
    alarm = `원자로 멜트다운 — 남은 ${sec}초`;
  } else if (!sim.power) alarm = isGhost() ? "정전 · 유령은 어둠에 영향을 받지 않는다" : "정전 — 전기실에서 전선을 연결하라";
  else if (sim.sediment) {
    const left = Math.max(0, (sim.sediment.until || sim.sediment.start + 10) - sim.time);
    alarm = `침전물 위험 — 게임 시간 ${left} 남음. 침전조에서 닫아라`;
  }
  else if (playerRoom() === "gate" && player.alive) alarm = "개폐실 · 10초가 넘으면 숨이 막힌다";
  $("alarm-line").textContent = alarm;
  const d = danger();
  $("warn-line").textContent = !state.admin ? "" : d >= 3 ? "이 방에 더 머물면 안 된다." : d > 0 ? "같은 방에 무언가가 있다." : "";
  $("hurt").style.background = d > 0 ? `rgba(120,0,0,${0.08 + d * 0.06})` : "rgba(140,0,0,0)";
  const ghost = isGhost();
  const mood = `${ghost ? 0 : d}|${sim.reactor ? 1 : 0}|${sim.power && !ghost ? 0 : ghost ? 0 : 1}`;
  if (mood !== state.clockMood) {
    state.clockMood = mood;
    setMood({ heartbeat: ghost ? 0 : d, alarm: !!sim.reactor, powerOff: !sim.power && !ghost });
  }
  paintAdminTools();
  $("net-pill").classList.toggle("hidden", !state.multi);
  if (state.multi) $("net-pill").textContent = currentCode();
  if (state.dirty) renderHotbar();
  else if (lamp) updateDuraBar();
  $("prompt").textContent = promptText();
  updateTaskbar();
}

function promptText() {
  if (isGhost()) return "유령 · Z 위험 · X 여기 · C 따라와";
  if (nearLever()) return sim.reactorHalted ? "레버는 내려가 있다" : "E  레버를 내리다";
  const gateLine = gatePrompt();
  const loc = locate(player.x, player.y);
  if (state.bossFight && !state.eye?.caught && (loc.id === "trial" || loc.id === "endless")) {
    return chasePrompt();
  }
  if (loc.id === "cable") return state.cableRide?.active ? "WASD로 옆으로 피하면서 올라간다" : "케이블카";
  if (loc.kind !== "room") return gateLine || groundPrompt();
  const c = roomCenter(loc.id);
  const near = Math.hypot(player.x - c.x, player.y - c.y) < 200;
  if (!near) return gateLine || groundPrompt();
  if (loc.id === "electrical" && !sim.power) return "E  전선 연결";
  if (loc.id === "reactor" && sim.reactor) return "E  카드 긁기";
  if (loc.id === "settle" && sim.sediment) return "E  침전물 신호 닫기";
  if (loc.id === "store") return "E  에너지 캡슐";
  if (loc.id === "electrical" && cellCount() >= 3) return "E  에너지 캡슐을 꽂다";
  if (loc.id === "gate") return gateLine || "E  카드 인증";
  if (loc.id === "release") {
    if (state.eye?.caught) return "눈을 잡았다";
    if (state.bossFight) return "도전로로 들어가라";
    return "E  괴물을 놓다";
  }
  if (loc.id === "trial") {
    if (state.eye?.caught) return "눈을 잡았다";
    if (state.bossFight) return chasePrompt();
    return "먼저 괴물개방에서 눈을 놓아라";
  }
  const actions = actionsFor(loc.id, missionProgress());
  if (actions.length) return `E  ${actions.map((action) => action.label).join(" · ")}`;
  if (loc.id === "cctv") return "E  CCTV";
  if (loc.id === "map") return "E  도면";
  if (loc.id === "supply1" || loc.id === "supply2") return "E  보급";
  if (loc.id === "electrical") return sim.powerHoldUntil && sim.time <= sim.powerHoldUntil ? `전력 유지 · 시각 ${sim.powerHoldUntil}까지` : "전력 정상";
  if (loc.id === "reactor") return "원자로 안정";
  return gateLine || "";
}

function groundPrompt() {
  const g = ground.find((it) => Math.hypot(it.x - player.x, it.y - player.y) < 80);
  return g ? "E  줍기" : "";
}

function cellCount() {
  return inv.filter((it) => it.type === "cell").length;
}

function takeCells() {
  if (inv.length > 1) {
    toast("빈 칸이 3칸보다 적다.");
    return;
  }
  inv.push(makeItem("cell"), makeItem("cell"), makeItem("cell"));
  state.dirty = true;
  playPickup();
  toast("에너지 캡슐 3개를 받았다.");
}

function installCells() {
  if (cellCount() < 3) {
    toast("캡슐이 3개 필요하다.");
    return;
  }
  let left = 3;
  inv = inv.filter((it) => {
    if (it.type === "cell" && left > 0) {
      left -= 1;
      return false;
    }
    return true;
  });
  if (selected >= inv.length) selected = Math.max(0, inv.length - 1);
  state.dirty = true;
  const until = Math.max(sim.time, sim.powerHoldUntil || 0) + 100;
  sim.powerHoldUntil = until;
  toast(`전력이 시각 ${until}까지 꺼지지 않는다.`);
  if (state.multi && !amHost()) signal({ cellAt: Date.now(), cellUntil: until });
  else if (state.multi) publish();
}

function gateOpenNow() {
  return !!(sim && sim.gateOpenUntil && Date.now() < sim.gateOpenUntil);
}

function nearGatePanel() {
  if (!annexIsOpen() || !sim) return false;
  const room = roomById("gate");
  if (!room) return false;
  const loc = locate(player.x, player.y);
  if (loc.kind === "room" && loc.id === "gate") return true;
  if (loc.kind !== "corridor") return false;
  const hall = corridorById(loc.id);
  if (!hall || (hall.a !== "gate" && hall.b !== "gate")) return false;
  const dx = Math.max(room.x - player.x, 0, player.x - (room.x + room.w));
  const dy = Math.max(room.y - player.y, 0, player.y - (room.y + room.h));
  return Math.hypot(dx, dy) < 180;
}

function gatePrompt() {
  if (!nearGatePanel()) return "";
  if (gateOpenNow()) return `문 열림 ${Math.max(1, Math.ceil((sim.gateOpenUntil - Date.now()) / 1000))}초`;
  if (sim.gateCardAt && sim.time < sim.gateCardAt + 5) return `카드 대기 · 시각 ${sim.gateCardAt + 5}`;
  return "E  카드 인증";
}

function swipeGate() {
  if (sim.gateCardAt && sim.time < sim.gateCardAt + 5) {
    toast(`카드는 시각 ${sim.gateCardAt + 5} 이후에 된다.`);
    return;
  }
  openCard("gate");
}

function finishGate(ok) {
  if (!sim) return;
  sim.gateCardAt = sim.time;
  if (ok) {
    sim.gateOpenUntil = Date.now() + 5000;
    toast("문이 5초 열린다. 10초가 넘으면 숨이 막힌다.");
  } else toast("카드가 거절됐다. 시각이 5 지나야 다시 된다.");
  if (state.multi && !amHost()) {
    signal({ gateAt: Date.now(), gateOk: ok ? 1 : 0, gateCardAt: sim.gateCardAt, gateOpenUntil: sim.gateOpenUntil || 0 });
  } else if (state.multi) publish();
}

function clearSediment() {
  if (!sim?.sediment) return;
  sim.sediment = null;
  toast("침전물 신호를 닫았다.");
  if (state.multi && !amHost()) signal({ sedimentFixAt: Date.now() });
  else if (state.multi) publish();
}

function crossesGate(x, y) {
  if (!annexIsOpen()) return false;
  const here = locate(player.x, player.y);
  const next = locate(x, y);
  const inside = (loc) => loc.kind === "room" && loc.id === "gate";
  return inside(here) !== inside(next);
}

function startBoss() {
  if (!skyIsOpen()) return;
  if (state.eye?.caught) {
    toast("이미 눈을 잡았다.");
    return;
  }
  if (state.bossFight) {
    toast("이미 놓아 주었다.");
    return;
  }
  state.bossFight = true;
  state.eyeScene = null;
  state.eyeHitAt = 0;
  state.chaseBlocks = [];
  state.chaseLids = [];
  state.chaseLasers = [];
  state.eyeParts = [];
  state.cannon = null;
  state.eyeBall = null;
  state.wallEyes = [];
  state.eyeSplit = null;
  state.hazHitAt = 0;
  state.eye = { x: 0, y: 0, caught: false, spawned: false };
  toast("도전로로 들어가라. 눈이 뒤에서 쫓아온다.");
  paintAdminTools();
}

function inChase() {
  return !!(state.bossFight && state.eye?.spawned && !state.eye?.caught);
}

function eyeSceneHold() {
  const s = state.eyeScene;
  return !!(s && s.t < s.dur);
}

function cannonSpot() {
  const hall = endlessRect();
  return { x: hall.x + hall.w - 120, y: hall.y + hall.h / 2 };
}

function nearCannon() {
  const c = state.cannon;
  if (!c) return false;
  return Math.hypot(player.x - c.x, player.y - c.y) < 92;
}

function partsHeld() {
  return (state.eyeParts || []).filter((p) => p.got).length;
}

function chasePrompt() {
  if (state.eye?.caught) return "눈을 잡았다";
  if (!state.eye?.spawned) return "눈이 온다";
  const n = partsHeld();
  if (state.cannon?.assembled) {
    if (nearCannon()) return state.eyeBall ? "포탄이 날아간다" : "조준 중 · 눈이 멈춘다 · 클릭/E 발사";
    return "대포로 달려가라";
  }
  if (n >= 3 && nearCannon()) return "E  대포를 조립하다";
  if (n >= 3) return "끝의 대포로 가라";
  return `부품 ${n}/3 · 벽을 피해 달려라`;
}

function lidState(l, now) {
  const t = (now / 1000 + l.phase) % l.period;
  const shut = t < l.shutDur;
  const gap = shut ? l.gapShut : l.gapOpen;
  const mid = l.y + l.h / 2;
  return { shut, gy: mid - gap / 2, gh: gap };
}

function blinkOpen(phase, now) {
  const t = (now / 1000 + phase) % 1.7;
  if (t < 0.2) return t / 0.2;
  if (t < 0.95) return 1;
  if (t < 1.18) return 1 - (t - 0.95) / 0.23;
  return 0;
}

function beamOn(h, now) {
  if (h.on == null) return blinkOpen(h.phase, now) > 0.5;
  return (now / 1000 + h.phase) % h.period < h.on;
}

function chaseBlocked(x, y) {
  if (!state.bossFight || state.eye?.caught) return false;
  for (const o of state.chaseBlocks || []) {
    if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
  }
  return false;
}

function buildChaseCourse() {
  const hall = endlessRect();
  const y0 = hall.y;
  const h = hall.h;
  const mid = y0 + h / 2;
  const run = hall.w - 320;
  const top = (ox) => ({ x: hall.x + ox, y: y0 + 8, w: 92, h: 92, kind: "top" });
  const bot = (ox) => ({ x: hall.x + ox, y: y0 + h - 100, w: 92, h: 92, kind: "bot" });
  const pinch = (ox) => ({ x: hall.x + ox, y: y0 + 70, w: 70, h: 100, kind: "pinch" });
  const tall = (ox) => ({ x: hall.x + ox, y: y0 + 8, w: 52, h: h - 86, kind: "tall" });
  const low = (ox) => ({ x: hall.x + ox, y: y0 + 86, w: 96, h: h - 94, kind: "low" });
  const blocks = [];
  const lasers = [];
  const eyes = [];
  const make = [top, bot, pinch, tall, low];
  let i = 0;
  for (let ox = 140; ox < run; ox += 150, i++) {
    const block = make[i % 5](ox);
    blocks.push(block);
    const phase = i * 0.27;
    const cx = block.x + block.w / 2;
    let ex = cx;
    let ey = block.y + block.h / 2;
    let laser = null;
    if (block.kind === "top") {
      ey = block.y + block.h - 6;
      laser = { x: block.x - 8, y: block.y + block.h + 2, w: block.w + 16, h: 26, phase };
    } else if (block.kind === "bot") {
      ey = block.y + 6;
      laser = { x: block.x - 8, y: block.y - 28, w: block.w + 16, h: 26, phase };
    } else if (block.kind === "tall") {
      ey = block.y + block.h - 8;
      laser = { x: block.x - 16, y: block.y + block.h + 2, w: block.w + 70, h: 24, phase };
    } else if (block.kind === "low") {
      ey = block.y + 8;
      laser = { x: block.x - 16, y: block.y - 26, w: block.w + 40, h: 24, phase };
    } else {
      ex = block.x + block.w - 8;
      laser = { x: block.x + block.w + 2, y: ey - 12, w: 88, h: 24, phase };
    }
    if (i % 2 === 0) {
      eyes.push({ x: ex, y: ey, phase, host: true });
      lasers.push(laser);
    }
  }
  state.chaseBlocks = blocks;
  state.chaseLids = [];
  state.chaseLasers = lasers;
  state.wallEyes = eyes;
  state.eyeParts = [
    { id: "barrel", name: "포신", x: hall.x + run * 0.18, y: mid + 52, got: false },
    { id: "mount", name: "포대", x: hall.x + run * 0.48, y: mid - 52, got: false },
    { id: "shell", name: "포탄", x: hall.x + run * 0.78, y: mid + 52, got: false },
  ];
  for (const p of state.eyeParts) {
    const tryY = [mid, y0 + 42, y0 + h - 42, mid + 40, mid - 40];
    if (!chaseBlocked(p.x, p.y) && isWalkable(p.x, p.y)) continue;
    for (const y of tryY) {
      if (!chaseBlocked(p.x, y) && isWalkable(p.x, y)) {
        p.y = y;
        break;
      }
    }
  }
  const pad = cannonSpot();
  state.cannon = { x: pad.x, y: pad.y, assembled: false, angle: Math.PI, ammo: 3, cool: 0 };
  state.eyeBall = null;
}

function spawnEyeBehind() {
  const e = state.eye;
  if (!e || e.spawned || e.caught) return;
  buildChaseCourse();
  let x = player.x - 240;
  let y = player.y;
  if (!isWalkable(x, y) || chaseBlocked(x, y)) {
    const hall = endlessRect();
    x = player.x - 240;
    y = hall.y + hall.h / 2;
  }
  e.x = x;
  e.y = y;
  e.spawned = true;
  toast("눈이 뒤에서 쫓아온다. 대포 부품을 모아라.");
}

function takeChasePart() {
  let got = false;
  for (const p of state.eyeParts || []) {
    if (p.got) continue;
    if (Math.hypot(player.x - p.x, player.y - p.y) > 70) continue;
    p.got = true;
    got = true;
    playPickup();
    toast(`${p.name}을 집었다. ${partsHeld()}/3`);
  }
  return got;
}

function catchEye() {
  const e = state.eye;
  if (!e || e.caught) return;
  state.eyeSplit = { x: e.x, y: e.y, t: 0, dur: 1.55 };
  e.caught = true;
  e.spawned = false;
  state.bossFight = false;
  state.eyeBall = null;
  toast("눈을 반으로 갈랐다.");
  paintAdminTools();
}

function tickEyeSplit(dt) {
  const s = state.eyeSplit;
  if (!s) return;
  s.t += dt;
  if (s.t > s.dur) state.eyeSplit = null;
}

function drawEyeSplit() {
  const s = state.eyeSplit;
  if (!s) return;
  const k = Math.min(1, s.t / s.dur);
  const ease = 1 - (1 - k) * (1 - k);
  const sep = ease * 78;
  const fade = 1 - k * 0.2;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.save();
  ctx.beginPath();
  ctx.rect(s.x - 90, s.y - 90 - sep, 180, 90);
  ctx.clip();
  ctx.translate(s.x, s.y - sep);
  ctx.rotate(-ease * 0.42);
  ctx.translate(-s.x, -s.y);
  drawLidEye(s.x, s.y, 44, 1);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(s.x - 90, s.y, 180, 90 + sep);
  ctx.clip();
  ctx.translate(s.x, s.y + sep);
  ctx.rotate(ease * 0.42);
  ctx.translate(-s.x, -s.y);
  drawLidEye(s.x, s.y, 44, 1);
  ctx.restore();
  ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(s.x - 70 - ease * 20, s.y - 6);
  ctx.lineTo(s.x + 70 + ease * 20, s.y + 6);
  ctx.stroke();
  ctx.restore();
}

function fireCannon() {
  const c = state.cannon;
  if (!c?.assembled || state.eyeBall) return false;
  if (!nearCannon()) return false;
  if (c.ammo <= 0) {
    toast("포탄이 없다.");
    return true;
  }
  if (c.cool > 0) return true;
  c.ammo -= 1;
  c.cool = 1.2;
  const a = c.angle;
  state.eyeBall = { x: c.x + Math.cos(a) * 48, y: c.y + Math.sin(a) * 48, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, life: 1.4 };
  toast("발사.");
  return true;
}

function tryCannonUse() {
  if (!state.bossFight || state.eye?.caught || !state.eye?.spawned) return false;
  takeChasePart();
  const c = state.cannon;
  if (!c || !nearCannon()) return false;
  if (!c.assembled) {
    if (partsHeld() < 3) {
      toast(`부품이 더 필요하다. ${partsHeld()}/3`);
      return true;
    }
    c.assembled = true;
    c.ammo = 3;
    toast("대포를 조립했다. 조준해서 쏴라.");
    return true;
  }
  return fireCannon();
}

function tickCannon(dt) {
  const c = state.cannon;
  if (!c) return;
  if (c.cool > 0) c.cool -= dt;
  if (c.assembled && nearCannon()) {
    const wx = mouse.x + cam.x;
    const wy = mouse.y + cam.y;
    c.angle = Math.atan2(wy - c.y, wx - c.x);
  }
  const ball = state.eyeBall;
  const e = state.eye;
  if (!ball) return;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.life -= dt;
  if (e?.spawned && Math.hypot(ball.x - e.x, ball.y - e.y) < 48) {
    state.eyeBall = null;
    catchEye();
    return;
  }
  if (ball.life <= 0) {
    state.eyeBall = null;
    toast(c.ammo > 0 ? "빗나갔다. 다시 쏴라." : "빗나갔다.");
  }
}

function tickEyeScene(dt) {
  if (!state.bossFight || state.eye?.caught) return;
  const loc = locate(player.x, player.y);
  if (!state.eyeScene && (loc.id === "trial" || loc.id === "endless")) {
    state.eyeScene = { t: 0, dur: 2.2 };
  }
  if (!state.eyeScene) return;
  const before = state.eyeScene.t;
  state.eyeScene.t += dt;
  if (before < state.eyeScene.dur && state.eyeScene.t >= state.eyeScene.dur) spawnEyeBehind();
}

function tickEye(dt) {
  if (eyeSceneHold()) return;
  if (!state.bossFight || !state.eye || state.eye.caught || !state.eye.spawned) return;
  takeChasePart();
  tickCannon(dt);
  const aiming = !!(state.cannon?.assembled && nearCannon());
  const e = state.eye;
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (aiming) {
    if (dist < 160) {
      e.x -= (dx / dist) * (160 - dist);
      e.y -= (dy / dist) * (160 - dist);
    }
  } else if (dist > 40) {
    const step = 312 * dt;
    e.x += (dx / dist) * step;
    e.y += (dy / dist) * step;
  }
  tickEyeHit(performance.now());
}

function shoveForward() {
  let left = 320;
  while (left > 0) {
    const step = Math.min(24, left);
    const nx = player.x + step;
    if (!isWalkable(nx, player.y) || chaseBlocked(nx, player.y)) break;
    player.x = nx;
    left -= step;
  }
}

function wallEyePos(eye, now) {
  if (eye.host) {
    const open = blinkOpen(eye.phase, now);
    return { x: eye.x, y: eye.y, r: 13 + open * 5, pop: open };
  }
  const pop = peekAmt(eye.phase, now, 1.7);
  return { x: eye.x, y: eye.y + eye.side * (18 + pop * 62), r: 16 + pop * 10, pop };
}

function peekAmt(phase, now, period) {
  const t = (now / 1000 + phase) % period;
  if (t < 0.28) return t / 0.28;
  if (t < 0.62) return 1;
  if (t < 0.9) return 1 - (t - 0.62) / 0.28;
  return 0;
}

function hazHit(amount, msg) {
  const now = performance.now();
  if (now - (state.hazHitAt || 0) < 520) return;
  state.hazHitAt = now;
  hurt(amount, "eye");
  toast(msg);
}

function tickEyeHit(now) {
  if (!player.alive || isGhost()) return;
  const loc = locate(player.x, player.y);
  if (loc.id !== "endless" && loc.id !== "trial") return;
  const e = state.eye;
  if (e?.spawned && Math.hypot(player.x - e.x, player.y - e.y) < 46) {
    if (now - (state.eyeHitAt || 0) >= 750) {
      state.eyeHitAt = now;
      shoveForward();
      hurt(99, "eye");
      toast("눈이 덮쳤다.");
    }
    return;
  }
  if (state.admin && state.adminGod) return;
  for (const w of state.wallEyes || []) {
    const p = wallEyePos(w, now);
    if (p.pop < 0.35) continue;
    if (Math.hypot(player.x - p.x, player.y - p.y) < p.r + 12) {
      hazHit(20, "벽의 눈이 스쳤다.");
      return;
    }
  }
  for (const l of state.chaseLids || []) {
    if (player.x < l.x || player.x > l.x + l.w) continue;
    const g = lidState(l, now);
    if (g.shut && (player.y < g.gy + 10 || player.y > g.gy + g.gh - 10)) {
      hazHit(20, "눈이 감겼다.");
      return;
    }
  }
  for (const b of state.chaseLasers || []) {
    if (!beamOn(b, now)) continue;
    if (player.x > b.x && player.x < b.x + b.w && player.y > b.y && player.y < b.y + b.h) {
      hazHit(20, "레이저.");
      return;
    }
  }
}

function drawEyeCombat() {
  drawEyeSplit();
  if (!state.bossFight || state.eye?.caught) return;
  const now = performance.now();
  const hall = endlessRect();
  ctx.save();
  ctx.globalAlpha = 0.35 + chaseFlicker(now) * 1.4;
  ctx.strokeStyle = "#c8e6ff";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const sx = hall.x + ((now / 8 + i * 2400) % hall.w);
    ctx.beginPath();
    ctx.moveTo(sx, hall.y + 4);
    ctx.lineTo(sx + 18, hall.y + 22);
    ctx.lineTo(sx - 8, hall.y + 40);
    ctx.stroke();
  }
  ctx.restore();
  for (const o of state.chaseBlocks || []) {
    ctx.fillStyle = "#1c1a16";
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = "#2c2822";
    ctx.fillRect(o.x + 6, o.y + 6, o.w - 12, o.h - 12);
    ctx.strokeStyle = "#5a5044";
    ctx.lineWidth = 3;
    ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
  }
  for (const b of state.chaseLasers || []) {
    if (!beamOn(b, now)) continue;
    ctx.fillStyle = "rgba(225, 36, 48, 0.78)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "rgba(255, 220, 220, 0.55)";
    ctx.fillRect(b.x, b.y + b.h * 0.35, b.w, Math.max(2, b.h * 0.28));
  }
  for (const w of state.wallEyes || []) {
    const p = wallEyePos(w, now);
    drawLidEye(p.x, p.y, p.r, 0.08 + p.pop * 0.9);
  }
  for (const p of state.eyeParts || []) {
    if (p.got) continue;
    ctx.fillStyle = "#c4a15a";
    ctx.fillRect(p.x - 16, p.y - 16, 32, 32);
    ctx.fillStyle = "#f4efe4";
    ctx.font = '14px "IBM Plex Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(p.name, p.x, p.y - 22);
  }
  const c = state.cannon;
  if (c) {
    ctx.fillStyle = c.assembled ? "#3a3530" : "#1c1a18";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a7a62";
    ctx.fillRect(c.x - 28, c.y + 10, 56, 18);
    if (c.assembled) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = "#6a6258";
      ctx.fillRect(8, -10, 58, 20);
      ctx.fillStyle = "#2a2622";
      ctx.fillRect(58, -7, 16, 14);
      ctx.restore();
      if (nearCannon()) {
        ctx.strokeStyle = "rgba(225, 29, 46, 0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(c.angle) * 220, c.y + Math.sin(c.angle) * 220);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "#9a8a70";
      ctx.font = '13px "IBM Plex Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("대포", c.x, c.y - 44);
    }
  }
  const ball = state.eyeBall;
  if (ball) {
    ctx.fillStyle = "#d8c48a";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEyeScene() {
  const s = state.eyeScene;
  if (!s) return;
  const fade = s.t < s.dur ? Math.min(1, s.t / 0.28) : Math.max(0, 1 - (s.t - s.dur) / 0.45);
  if (fade <= 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = `rgba(0,0,0,${0.72 * fade})`;
  ctx.fillRect(0, 0, viewW, viewH);
  const openLid = Math.min(1, Math.max(0, (s.t - 0.25) / 0.7));
  ctx.translate(viewW / 2, viewH * 0.42);
  ctx.scale(1, 0.14 + openLid * 0.86);
  ctx.globalAlpha = fade;
  ctx.fillStyle = "#e8eaee";
  ctx.beginPath();
  ctx.ellipse(0, 0, 150, 88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e11d2e";
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a0306";
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.globalAlpha = fade * Math.min(1, Math.max(0, s.t - 1.05));
  ctx.fillStyle = "#e11d2e";
  ctx.font = '700 40px "Black Han Sans", "IBM Plex Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("I SEE YOU", viewW / 2, viewH * 0.78);
  ctx.restore();
}

function drawEye() {
  const e = state.eye;
  if (!e || e.caught || !e.spawned) return;
  const x = e.x - cam.x;
  const y = e.y - cam.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#d8dbe0";
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e11d2e";
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a0408";
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(8, -8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function tickChoke(dt) {
  if (state.paused || !player.alive || isGhost() || state.phase !== "play") return;
  if (state.admin && state.adminGod) {
    state.gateStay = 0;
    return;
  }
  if (playerRoom() !== "gate") {
    state.gateStay = 0;
    return;
  }
  state.gateStay += dt;
  if (state.gateStay < 10) return;
  state.gateStay = 0;
  toast("숨이 막힌다.");
  hurt(99, "choke");
}

function drawGateSeal() {
  if (!annexIsOpen() || gateOpenNow()) return;
  const room = roomById("gate");
  if (!room) return;
  ctx.save();
  ctx.strokeStyle = "#a33b3b";
  ctx.lineWidth = 14;
  ctx.strokeRect(room.x + 18, room.y + 18, room.w - 36, room.h - 36);
  ctx.restore();
}

function missionProgress() {
  return { done: sim?.doneTasks || [], got: sim?.dataGot || [] };
}

function exteriorLights() {
  const left = Math.min(...ROOMS.map((room) => room.x));
  const right = Math.max(...ROOMS.map((room) => room.x + room.w));
  const top = Math.min(...ROOMS.map((room) => room.y));
  const bot = Math.max(...ROOMS.map((room) => room.y + room.h));
  const pts = [];
  for (const room of ROOMS) {
    if (room.x === left) {
      pts.push({ x: room.x - 26, y: room.y + room.h * 0.35 });
      pts.push({ x: room.x - 26, y: room.y + room.h * 0.7 });
    }
    if (room.x + room.w === right) {
      pts.push({ x: room.x + room.w + 26, y: room.y + room.h * 0.35 });
      pts.push({ x: room.x + room.w + 26, y: room.y + room.h * 0.7 });
    }
    if (room.y === top) {
      pts.push({ x: room.x + room.w * 0.32, y: room.y - 26 });
      pts.push({ x: room.x + room.w * 0.68, y: room.y - 26 });
    }
    if (room.y + room.h === bot) {
      pts.push({ x: room.x + room.w * 0.32, y: room.y + room.h + 26 });
      pts.push({ x: room.x + room.w * 0.68, y: room.y + room.h + 26 });
    }
  }
  return pts;
}

function drawShieldLights(now) {
  if (!sim?.shieldsAt) return;
  const age = now - sim.shieldsAt;
  const pts = exteriorLights();
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  pts.forEach((pt, i) => {
    const delay = i * 70;
    let alpha = 1;
    if (age < 18000) {
      if (age < delay) alpha = 0;
      else if (age < delay + 380) alpha = (age - delay) / 380;
    }
    if (alpha <= 0) return;
    ctx.fillStyle = `rgba(214, 255, 236, ${0.95 * alpha})`;
    ctx.shadowColor = "#9dffd8";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawGhost(x, y, facing, color, now) {
  ctx.save();
  ctx.translate(x, y + Math.sin(now / 280) * 8);
  ctx.globalAlpha = 0.48;
  ctx.scale(1.7, 1.7);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -2, 13, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-9, 10);
  ctx.quadraticCurveTo(0, 30, 9, 10);
  ctx.fill();
  ctx.fillStyle = "rgba(215, 243, 255, 0.75)";
  ctx.beginPath();
  ctx.ellipse(Math.cos(facing) * 6, Math.sin(facing) * 6 - 2, 6, 4.2, facing, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawActor(x, y, facing, color, alive) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.7, 1.7);
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
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 2, 13, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d7f3ff";
  ctx.beginPath();
  ctx.ellipse(Math.cos(facing) * 6, Math.sin(facing) * 6 - 1, 6, 4.2, facing, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMonster(x, y, now, i, revealed) {
  const flick = revealed ? 0.95 : 0.28 + Math.sin(now / 70 + i) * 0.08;
  ctx.save();
  ctx.translate(x, y + Math.sin(now / 120 + i) * 2);
  ctx.scale(1.8, 1.8);
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
  if (revealed) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ff4a4a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -4, 28, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function inCone(px, py, facing, mx, my) {
  const dx = mx - px;
  const dy = my - py;
  const dist = Math.hypot(dx, dy);
  if (dist > 680) return false;
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
    if (!g || Math.hypot(target.x - g.x, target.y - g.y) > 900) {
      g = { x: target.x, y: target.y };
      ghosts.set(m.id, g);
    }
    const k = Math.min(1, dt * 3.2);
    g.x += (target.x - g.x) * k;
    g.y += (target.y - g.y) * k;
  }
  for (const id of ghosts.keys()) if (!seen.has(id)) ghosts.delete(id);
}

function chaseFlicker(now) {
  const n = now / 1000;
  const a = (Math.sin(n * 11.3) + 1) * 0.5;
  const b = (Math.sin(n * 29.7 + 1.7) + 1) * 0.5;
  const burst = a * b;
  if (burst > 0.78) return 0.1 + (burst - 0.78) * 0.45;
  if (burst > 0.52) return 0.035;
  return 0.012;
}

let darkLayer = null;

function drawDark(w, h, lamp, now) {
  const px = player.x - cam.x;
  const py = player.y - cam.y;
  const ghost = isGhost();
  const lit = sim.power || ghost;
  const haunted = danger() > 0 && sim.power && !ghost;
  let dark = lit ? (haunted ? 0.55 : 0.22) : 0.94;
  if (!ghost && (inChase() || ["endless", "trial", "cable"].includes(locate(player.x, player.y).id))) {
    dark = Math.min(0.78, dark + chaseFlicker(now));
  }
  const rad = lit ? 980 : 120;
  if (!darkLayer) darkLayer = document.createElement("canvas");
  if (darkLayer.width !== Math.ceil(w) || darkLayer.height !== Math.ceil(h)) {
    darkLayer.width = Math.ceil(w);
    darkLayer.height = Math.ceil(h);
  }
  const o = darkLayer.getContext("2d");
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, darkLayer.width, darkLayer.height);
  o.fillStyle = `rgba(0,0,0,${dark})`;
  o.fillRect(0, 0, w, h);
  o.globalCompositeOperation = "destination-out";
  const g = o.createRadialGradient(px, py, rad * 0.35, px, py, rad);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  o.fillStyle = g;
  o.beginPath();
  o.arc(px, py, rad, 0, Math.PI * 2);
  o.fill();
  const cones = [];
  if (lamp) cones.push({ x: px, y: py, facing: player.facing });
  for (const person of others()) {
    if (person.alive === false || !person.lamp) continue;
    cones.push({ x: person.x - cam.x, y: person.y - cam.y, facing: person.facing || 0 });
  }
  for (const cone of cones) {
    o.fillStyle = "rgba(0,0,0,0.95)";
    o.beginPath();
    o.moveTo(cone.x, cone.y);
    o.arc(cone.x, cone.y, 680, cone.facing - 0.48, cone.facing + 0.48);
    o.closePath();
    o.fill();
  }
  o.globalCompositeOperation = "source-over";
  ctx.drawImage(darkLayer, 0, 0);
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
  const annex = annexLayer();
  if (annex) ctx.drawImage(annex.canvas, annex.x, annex.y);
  const sky = skyLayer();
  if (sky) ctx.drawImage(sky.canvas, sky.x, sky.y);
  paintSkyLive(ctx);
  drawCableRide();
  drawEyeCombat();
  drawLever();
  drawGateSeal();
  for (const g of ground) {
    ctx.fillStyle = MARK[g.type] || "#ccc";
    ctx.fillRect(g.x - 14, g.y - 14, 28, 28);
    ctx.font = '18px "IBM Plex Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#07080c";
    ctx.strokeText(ITEM[g.type] || "", g.x, g.y - 24);
    ctx.fillStyle = "#f4efe4";
    ctx.fillText(ITEM[g.type] || "", g.x, g.y - 24);
  }
  for (const o of others()) {
    if (o.alive === false) {
      const cx = o.corpseX === "" || o.corpseX == null ? o.x : o.corpseX;
      const cy = o.corpseY === "" || o.corpseY == null ? o.y : o.corpseY;
      drawActor(cx, cy, 0, o.color || "#88a", false);
    } else drawActor(o.x, o.y, o.facing || 0, o.color || "#88a", true);
  }
  ctx.restore();
  drawDark(viewW, viewH, lamp, now);
  if (isGhost()) drawGhost(player.x - cam.x, player.y - cam.y, player.facing, state.color, now);
  else drawActor(player.x - cam.x, player.y - cam.y, player.facing, state.color, player.alive);
  for (const o of others()) {
    if (o.alive === false) drawGhost(o.x - cam.x, o.y - cam.y, o.facing || 0, o.color || "#88a", now);
  }
  drawShieldLights(now);
  drawPings();
  drawEye();
  drawEyeScene();
  for (const m of sim.monsters) {
    const g = ghosts.get(m.id) || anchorOf(m.place);
    if (!monsterLit(g.x, g.y)) continue;
    drawMonster(g.x - cam.x, g.y - cam.y, now, m.id, state.admin);
  }
  const mini = $("minimap");
  if (mini) {
    const marks = state.admin
      ? sim.monsters.map((m) => ghosts.get(m.id) || anchorOf(m.place))
      : [];
    drawMinimap(mini.getContext("2d"), mini.width, mini.height, player, marks, whichWorld(player.x, player.y), incompleteRooms());
  }
}

function monsterLit(x, y) {
  if (state.admin) return true;
  if (state.lampOn && inCone(player.x, player.y, player.facing, x, y)) return true;
  for (const o of others()) {
    if (o.alive === false || !o.lamp) continue;
    if (inCone(o.x, o.y, o.facing || 0, x, y)) return true;
  }
  return false;
}

function drawLever() {
  const spot = leverSpot();
  if (!spot) return;
  const down = !!sim?.reactorHalted;
  const angle = down ? 0.95 : -0.75;
  const hx = Math.sin(angle) * 34;
  const hy = -Math.cos(angle) * 34;
  ctx.save();
  ctx.translate(spot.x, spot.y);
  ctx.fillStyle = "#23282f";
  ctx.fillRect(-18, 6, 36, 64);
  ctx.fillStyle = "#8b949f";
  ctx.fillRect(-18, 6, 36, 6);
  ctx.strokeStyle = "#d7c4a3";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 58);
  ctx.lineTo(hx, 58 + hy);
  ctx.stroke();
  ctx.fillStyle = down ? "#7f8c78" : "#e2c14a";
  ctx.beginPath();
  ctx.arc(hx, 58 + hy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPings() {
  const now = Date.now();
  const list = [];
  if (state.ping && now - state.ping.at < 4000) list.push(state.ping);
  for (const o of others()) {
    if (!o.ping || !o.pingAt || now - Number(o.pingAt) >= 4000) continue;
    list.push({
      kind: o.ping,
      at: Number(o.pingAt),
      x: Number(o.pingX),
      y: Number(o.pingY),
      name: o.name || "동료",
    });
  }
  for (const p of list) {
    const spec = PING[p.kind];
    if (!spec || Number.isNaN(p.x) || Number.isNaN(p.y)) continue;
    const age = now - p.at;
    const x = p.x - cam.x;
    const y = p.y - cam.y;
    ctx.save();
    ctx.globalAlpha = age > 3200 ? Math.max(0, 1 - (age - 3200) / 800) : 1;
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = spec.color;
    ctx.font = '700 16px "IBM Plex Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(spec.label, x, y - 26);
    if (p.name) {
      ctx.fillStyle = "#f4efe4";
      ctx.font = '13px "IBM Plex Sans KR", sans-serif';
      ctx.fillText(p.name, x, y - 44);
    }
    ctx.restore();
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
  ctx.fillText("방장이 시작하면 시설로 간다 · 최대 4명", LOBBY.x + LOBBY.w / 2, LOBBY.y + LOBBY.h - 36);
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
    drawLobbyScene();
    if (now - state.lastPush > 120) {
      state.lastPush = now;
      pushPresence();
    }
    if (state.roomData) renderLobby(state.roomData);
  } else if (state.phase === "play" || state.phase === "dead") {
    if (state.phase === "play") {
      tickEyeScene(dt);
      movePlayer(dt);
      tickTime(dt);
      tickReactor();
      tickChoke(dt);
      tickEye(dt);
      tickEyeSplit(dt);
    }
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
  if (busy()) {
    closeMinigames();
    closeMission();
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

function hostStart() {
  const data = state.roomData;
  if (state.phase !== "lobby" || !state.multi || !amHost() || !data || data.phase !== "lobby" || state.launching) return;
  state.launching = true;
  state.difficulty = data.difficulty || state.difficulty;
  void (async () => {
    await beginMatchLocal(null);
    pushRoom({ phase: "playing", countdownEnd: 0, difficulty: state.difficulty });
  })();
}

function goMenu() {
  stopClock();
  state.phase = "menu";
  state.paused = false;
  state.launching = false;
  state.countdownSent = false;
  paintAdminTools();
  closeMinigames();
  closeMission();
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

function onClick(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", fn);
}

function bind() {
  onClick("task-toggle", () => {
    $("task-list").classList.toggle("hidden");
    updateTaskbar();
  });
  onClick("admin-tasks", () => {
    if (!state.admin) return;
    state.adminTasks = !state.adminTasks;
    if (state.adminTasks) requestCompleteAll();
    else toast("이미 끝난 미션은 되돌리지 않는다.");
    paintAdminTools();
  });
  onClick("admin-god", () => {
    if (!state.admin) return;
    state.adminGod = !state.adminGod;
    toast(state.adminGod ? "무적이다." : "무적이 꺼졌다.");
    paintAdminTools();
  });
  onClick("admin-fast", () => {
    if (!state.admin || inBossFight()) {
      toast("보스전에서는 속도를 쓸 수 없다.");
      return;
    }
    state.adminFast = !state.adminFast;
    toast(state.adminFast ? "속도 200%." : "속도가 원래대로다.");
    paintAdminTools();
  });
  onClick("admin-reactor", () => {
    if (!state.admin) return;
    if (!sim) {
      toast("플레이 중에만 된다.");
      return;
    }
    const next = !sim.reactorHalted;
    if (state.multi && !amHost()) {
      signal({ adminHaltAt: Date.now(), adminHalt: next });
      toast(next ? "원자로 정지를 요청했다." : "원자로 재개를 요청했다.");
      return;
    }
    applyReactorStop(next);
  });
  onClick("admin-power", () => {
    if (!state.admin) return;
    if (!sim) {
      toast("플레이 중에만 된다.");
      return;
    }
    const next = !sim.powerStopped;
    if (state.multi && !amHost()) {
      signal({ adminPowerAt: Date.now(), adminPowerOff: next });
      toast(next ? "전기 정지를 요청했다." : "전기 복구를 요청했다.");
      return;
    }
    applyPowerStop(next);
  });
  for (const btn of document.querySelectorAll(".diff")) {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      state.difficulty = btn.dataset.diff;
    });
  }
  onClick("btn-single", () => {
    unlockAudio();
    state.name = ($("player-name").value || "탐색자").slice(0, 12);
    beginSingle();
  });
  onClick("btn-multi", () => {
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
  onClick("btn-manual", () => show("manual"));
  onClick("manual-close", () => hide("manual"));
  onClick("firebase-close", () => {
    hide("firebase-help");
    if (state.phase === "menu") show("menu");
  });
  onClick("multi-back", () => {
    hide("multi-setup");
    show("menu");
  });
  onClick("btn-create", async () => {
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
  onClick("btn-join", async () => {
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
  onClick("lobby-start", hostStart);
  onClick("lobby-leave", goMenu);
  onClick("resume", () => {
    state.paused = false;
    thawReactor();
    hide("pause");
  });
  onClick("pause-menu", goMenu);
  onClick("retry", () => {
    hide("death");
    if (state.multi) goMenu();
    else beginSingle();
  });
  onClick("death-menu", goMenu);
  onClick("downed-menu", goMenu);
  onClick("map-close", () => hide("map-overlay"));
  onClick("cctv-close", () => hide("cctv-overlay"));
  onClick("mute-btn", () => {
    unlockAudio();
    setMuted(!isMuted());
    $("mute-btn").textContent = isMuted() ? "음소거" : "소리";
  });
  try {
    initMinigames({ onPower: fixPower, onReactor: fixReactor, onGate: finishGate });
    initMissions({ onDone: finishTask, onDownload: noteDownload, onSignal: clearSediment });
  } catch (err) {
    console.error(err);
  }
  const hotbar = $("hotbar");
  if (hotbar) hotbar.addEventListener("click", (e) => {
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
    if (state.cannon?.assembled && nearCannon() && fireCannon()) return;
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
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
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
      if (state.paused) {
        state.pauseBegan = Date.now();
        show("pause");
      } else {
        thawReactor();
        hide("pause");
      }
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
  if (!$("map-overlay").classList.contains("hidden") || busy()) return;
  if (state.phase === "play" && !state.paused) {
    if (e.code === "KeyZ") sendPing("danger");
    if (e.code === "KeyX") sendPing("here");
    if (e.code === "KeyC") sendPing("follow");
  }
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

try {
  bind();
} catch (err) {
  console.error(err);
}
resize();
renderHotbar();
requestAnimationFrame(loop);
