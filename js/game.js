import { ROOMS, roomById, roomCenter, anchorOf, getFloorCanvas, drawSchematic, drawMinimap, isWalkable, locate, WORLD, openAnnex, resetAnnex, annexIsOpen, annexLayer, leverSpot, whichWorld, corridorById } from "./map.js?v=30";
import { createMatch, advance, scatterMonsters, spawnAnnexMonsters, applyMonsterView, rollDelta } from "./sim.js?v=30";
import { unlockAudio, setMuted, isMuted, setMood, playHurt, playPickup, playBlackout, updateAudio } from "./audio.js?v=30";
import { initMinigames, openWires, openCard, closeMinigames, minigameOpen } from "./minigames.js?v=30";
import { TASKS, ANNEX_TASKS, initMissions, openRoomTasks, openSediment, closeMission, missionOpen, actionsFor } from "./missions.js?v=30";
import { isFirebaseConfigured, createRoom, joinRoom, watchRoom, pushSelf, pushRoom, pushWorld, signal, sendRevive, replaceLoot, placeLoot, patchLoot, removeLoot, claimLoot, leaveRoom, amHost, selfId, currentCode } from "./net.js?v=30";

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
  seen: { blackout: 0, reactor: 0, scatter: 0, power: 0, reactorFix: 0, revive: 0, task: 0, lever: 0, sediment: 0, gate: 0, cell: 0, sedimentFix: 0 },
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
  $(id).classList.remove("hidden");
}

function hide(id) {
  $(id).classList.add("hidden");
}

function syncAdmin() {
  state.admin = String(state.name || "").trim().toLowerCase() === "adminstar";
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
    reactorHalted: !!sim.reactorHalted,
    powerHoldUntil: sim.powerHoldUntil || 0,
    sediment: sim.sediment && sim.sediment.start ? { start: sim.sediment.start } : { start: 0 },
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
      sim.sediment = { start: snap.sediment.start };
      if (state.seen.sediment !== snap.sediment.start) {
        state.seen.sediment = snap.sediment.start;
        toast("침전물 위험 신호가 열렸다. 침전조로 가라.");
      }
    }
  } else if (snap.sediment && snap.sediment.start === 0) sim.sediment = null;
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

function noteProgress() {
  if (!sim || sim.worldOpen || coreDoneCount() < TASKS.length) return;
  sim.worldOpen = true;
  revealAnnex();
  if (!state.multi || amHost()) spawnAnnexMonsters(sim);
  toast("모든 미션을 마쳤다. 정원 서쪽에 통로가 열렸다.");
}

function applyFacility(world) {
  if (!world || !sim) return;
  if (world.worldOpen && revealAnnex() && state.phase === "play" && !amHost()) {
    toast("정원 서쪽에 통로가 열렸다.");
  }
  if (world.reactorHalted && !sim.reactorHalted) {
    sim.reactorHalted = true;
    sim.reactor = null;
    if (state.phase === "play") toast("원자로 가동이 멈췄다. 이제는 폭파하지 않는다.");
  }
  if ((world.powerHoldUntil || 0) > (sim.powerHoldUntil || 0)) sim.powerHoldUntil = world.powerHoldUntil;
  if (world.sediment && world.sediment.start) {
    if (!sim.sediment || sim.sediment.start !== world.sediment.start) {
      sim.sediment = { start: world.sediment.start };
      if (state.phase === "play" && state.seen.sediment !== world.sediment.start) {
        state.seen.sediment = world.sediment.start;
        toast("침전물 위험 신호가 열렸다. 침전조로 가라.");
      }
    }
  } else if (world.sediment && world.sediment.start === 0) sim.sediment = null;
  if ((world.gateOpenUntil || 0) > (sim.gateOpenUntil || 0)) sim.gateOpenUntil = world.gateOpenUntil;
  if ((world.gateCardAt || 0) > (sim.gateCardAt || 0)) sim.gateCardAt = world.gateCardAt;
}

function haltReactor() {
  if (!sim || sim.reactorHalted) return;
  sim.reactorHalted = true;
  sim.reactor = null;
  toast("원자로 가동이 멈췄다. 이제는 폭파하지 않는다.");
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
  resetAnnex();
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
  state.seen = { blackout: 0, reactor: 0, scatter: 0, power: 0, reactorFix: 0, revive: 0, task: 0, lever: 0, sediment: 0, gate: 0, cell: 0, sedimentFix: 0 };
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
  if (!sim?.reactor || sim.meltdown || state.paused || state.phase !== "play") return;
  if (state.multi && !amHost()) return;
  if (Date.now() < sim.reactor.deadlineAt) return;
  sim.reactor = null;
  sim.meltdown = true;
  hurt(9999, "meltdown");
  if (state.multi) publish();
}

function tickTime(dt) {
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
    else if (added.length) {
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

function updateTaskbar() {
  const done = sim?.doneTasks || [];
  const core = coreDoneCount();
  const pct = (core / TASKS.length) * 100;
  const fill = $("task-fill");
  const label = $("task-label");
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `미션 ${core}/${TASKS.length}`;
  const got = sim?.dataGot || [];
  const sig = `${done.join(",")}|${got.join(",")}|${annexIsOpen() ? 1 : 0}`;
  if (sig === state.taskSig) return;
  state.taskSig = sig;
  const ul = $("task-list");
  if (!ul) return;
  ul.innerHTML = "";
  const list = annexIsOpen() ? TASKS.concat(ANNEX_TASKS) : TASKS;
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
    if (near && loc.id === "electrical" && cellCount() >= 3) {
      installCells();
      return;
    }
  }
  if (nearGatePanel()) {
    swipeGate();
    return;
  }
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
    sendRevive(target.id);
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
        sim.power = true;
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
      if (data.taskAt && data.taskAt !== state.seen.task && data.taskRoom) {
        state.seen.task = data.taskAt;
        if (data.taskKind === "download") noteDownload(data.taskRoom);
        else finishTask(data.taskRoom);
      }
    }
    const me = data.players?.[bodyId()];
    if (me?.reviveAt && me.reviveAt !== state.seen.revive && !player.alive) {
      state.seen.revive = me.reviveAt;
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
  if (state.paused || busy()) return;
  if (!player.alive && !isGhost()) return;
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
  const speed = (state.phase === "lobby" ? 240 : 230) * boost;
  const dx = (x / len) * speed * dt;
  const dy = (y / len) * speed * dt;
  player.facing = Math.atan2(y, x);
  if (isGhost()) {
    player.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, player.x + dx));
    player.y = Math.max(WORLD.minY, Math.min(WORLD.maxY, player.y + dy));
    return;
  }
  const walk = state.phase === "lobby" ? lobbyWalk : isWalkable;
  const nx = player.x + dx;
  const ny = player.y + dy;
  const blocked = (x, y) => state.phase === "play" && crossesGate(x, y) && !gateOpenNow();
  if (walk(nx, player.y) && !blocked(nx, player.y)) player.x = nx;
  if (walk(player.x, ny) && !blocked(player.x, ny)) player.y = ny;
}

function lobbyWalk(x, y) {
  return x > LOBBY.x + 28 && y > LOBBY.y + 28 && x < LOBBY.x + LOBBY.w - 28 && y < LOBBY.y + LOBBY.h - 28;
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
  else if (sim.sediment) alarm = "침전물 위험 — 침전조에서 신호를 닫아라";
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

function tickChoke(dt) {
  if (state.paused || !player.alive || isGhost() || state.phase !== "play") return;
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

let darkLayer = null;

function drawDark(w, h, lamp, now) {
  const px = player.x - cam.x;
  const py = player.y - cam.y;
  const ghost = isGhost();
  const lit = sim.power || ghost;
  const haunted = danger() > 0 && sim.power && !ghost;
  const dark = lit ? (haunted ? 0.55 : 0.22) : 0.94;
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
    drawMinimap(mini.getContext("2d"), mini.width, mini.height, player, marks, whichWorld(player.x, player.y));
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
    if (state.phase === "play") {
      movePlayer(dt);
      tickTime(dt);
      tickReactor();
      tickChoke(dt);
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
  stopClock();
  state.phase = "menu";
  state.paused = false;
  state.launching = false;
  state.countdownSent = false;
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

function bind() {
  initMinigames({ onPower: fixPower, onReactor: fixReactor, onGate: finishGate });
  initMissions({ onDone: finishTask, onDownload: noteDownload, onSignal: clearSediment });
  $("task-toggle").addEventListener("click", () => {
    $("task-list").classList.toggle("hidden");
    updateTaskbar();
  });
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
    thawReactor();
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

bind();
resize();
renderHotbar();
requestAnimationFrame(loop);
