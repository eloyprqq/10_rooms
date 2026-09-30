import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js?v=25";

export { isFirebaseConfigured };

let db = null;
let api = null;
let roomCode = "";
let myId = "";
let host = false;
let roomUnsub = null;

function playerId() {
  let id = localStorage.getItem("tenrooms-pid");
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem("tenrooms-pid", id);
  }
  return id;
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function ensure() {
  if (db) return;
  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const dbMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
  const app = appMod.initializeApp(firebaseConfig);
  db = dbMod.getDatabase(app);
  api = dbMod;
}

function basePlayer(name, color) {
  return {
    name,
    color,
    x: 590,
    y: 370,
    facing: 0,
    hp: 100,
    alive: true,
    room: "",
    updated: Date.now(),
  };
}

export function amHost() {
  return host;
}

export function selfId() {
  return myId;
}

export function currentCode() {
  return roomCode;
}

export async function createRoom({ name, color, difficulty }) {
  await ensure();
  myId = playerId();
  host = true;
  roomCode = makeCode();
  await api.set(api.ref(db, `rooms/${roomCode}`), {
    hostId: myId,
    phase: "lobby",
    difficulty,
    countdownEnd: 0,
    scatterAt: 0,
    powerFixAt: 0,
    reactorFixAt: 0,
    world: null,
    players: { [myId]: basePlayer(name, color) },
  });
  api.onDisconnect(api.ref(db, `rooms/${roomCode}/players/${myId}`)).remove();
  return roomCode;
}

export async function joinRoom({ code, name, color }) {
  await ensure();
  myId = playerId();
  roomCode = String(code || "").trim().toUpperCase();
  const snap = await api.get(api.ref(db, `rooms/${roomCode}`));
  if (!snap.exists()) throw new Error("없는 방 코드입니다.");
  const data = snap.val();
  host = data.hostId === myId;
  await api.update(api.ref(db, `rooms/${roomCode}/players/${myId}`), basePlayer(name, color));
  api.onDisconnect(api.ref(db, `rooms/${roomCode}/players/${myId}`)).remove();
  return data;
}

export function watchRoom(cb) {
  if (roomUnsub) roomUnsub();
  roomUnsub = api.onValue(api.ref(db, `rooms/${roomCode}`), (snap) => cb(snap.val()));
}

export function pushSelf(data) {
  if (!db || !roomCode || !myId) return;
  api.update(api.ref(db, `rooms/${roomCode}/players/${myId}`), { ...data, updated: Date.now() }).catch(() => {});
}

export function pushRoom(data) {
  if (!host || !db || !roomCode) return Promise.resolve();
  return api.update(api.ref(db, `rooms/${roomCode}`), data).catch(() => {});
}

export function pushWorld(world) {
  if (!host || !db || !roomCode) return Promise.resolve();
  return api.set(api.ref(db, `rooms/${roomCode}/world`), world).catch(() => {});
}

export function signal(data) {
  if (!db || !roomCode) return;
  api.update(api.ref(db, `rooms/${roomCode}`), data).catch(() => {});
}

export function sendRevive(targetId) {
  if (!db || !roomCode) return;
  api.update(api.ref(db, `rooms/${roomCode}/players/${targetId}`), { reviveAt: Date.now() }).catch(() => {});
}

function lootPayload(item) {
  const data = { type: item.type, x: Math.round(item.x), y: Math.round(item.y) };
  if (item.dura != null) data.dura = item.dura;
  if (item.left != null) data.left = item.left;
  return data;
}

export function replaceLoot(items) {
  if (!db || !roomCode) return Promise.resolve();
  const loot = {};
  for (const item of items) loot[String(item.uid)] = lootPayload(item);
  return api.set(api.ref(db, `rooms/${roomCode}/loot`), loot).catch(() => {});
}

export function placeLoot(item) {
  if (!db || !roomCode) return Promise.resolve();
  return api.set(api.ref(db, `rooms/${roomCode}/loot/${item.uid}`), lootPayload(item));
}

export function patchLoot(uid, data) {
  if (!db || !roomCode) return Promise.resolve();
  return api.update(api.ref(db, `rooms/${roomCode}/loot/${uid}`), data).catch(() => {});
}

export function removeLoot(uid) {
  if (!db || !roomCode) return Promise.resolve();
  return api.remove(api.ref(db, `rooms/${roomCode}/loot/${uid}`)).catch(() => {});
}

export async function claimLoot(uid) {
  if (!db || !roomCode) return false;
  const ref = api.ref(db, `rooms/${roomCode}/loot/${uid}`);
  const snap = await api.get(ref);
  if (!snap.exists()) return false;
  const result = await api.runTransaction(ref, (cur) => {
    if (cur == null) return;
    return null;
  });
  return result.committed;
}

export async function leaveRoom() {
  if (roomUnsub) roomUnsub();
  roomUnsub = null;
  if (db && roomCode && myId) {
    await api.remove(api.ref(db, `rooms/${roomCode}/players/${myId}`)).catch(() => {});
  }
  host = false;
  roomCode = "";
}
