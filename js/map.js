const RW = 680;
const RH = 500;
const COLS = [160, 1320, 2480, 3640];
const ROWS = [140, 1120, 2100];
const HALL = 128;

const SPEC = [
  ["garden", "정원", 1, 0, 1, 0.2, "#17211c", "#8fb59a"],
  ["electrical", "전기실", 2, 0, 2, 0.03, "#171c28", "#8eb4d6"],
  ["supply2", "보급소 2", 3, 1, 1, 0.1, "#241e16", "#d2b48a"],
  ["map", "지도", 4, 1, 0, 0.2, "#211a24", "#c4b0d4"],
  ["cafeteria", "식당", 5, 2, 1, 0, "#241c1a", "#e0b0a0"],
  ["supply1", "보급소 1", 6, 2, 2, 0.15, "#241e16", "#d2b48a"],
  ["reactor", "원자로", 7, 2, 0, 0, "#281616", "#e08a8a"],
  ["cctv", "CCTV", 8, 3, 1, 0.25, "#161c22", "#9fd0d4"],
  ["bedroom", "침실", 9, 3, 2, 0.1, "#221820", "#d4b0c4"],
  ["rooftop", "옥상", 10, 3, 0, 0.5, "#1a201c", "#c5d4c0"],
];

export const ROOMS = SPEC.map(([id, name, num, col, row, skip, floor, accent]) => ({
  id,
  name,
  num,
  x: COLS[col],
  y: ROWS[row],
  w: RW,
  h: RH,
  skip,
  floor,
  accent,
}));

const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

export function roomById(id) {
  return byId[id];
}

export function roomCenter(id) {
  const r = byId[id];
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function linkH(id, left, right, hall = HALL) {
  const a = byId[left];
  const b = byId[right];
  const x = a.x + a.w;
  const y = a.y + a.h / 2 - hall / 2;
  return { id, a: left, b: right, x, y, w: b.x - x, h: hall, kind: "rect" };
}

function linkV(id, top, bottom, hall = HALL) {
  const a = byId[top];
  const b = byId[bottom];
  const y = a.y + a.h;
  const x = a.x + a.w / 2 - hall / 2;
  return { id, a: top, b: bottom, x, y, w: hall, h: b.y - y, kind: "rect" };
}

const elec = byId.electrical;
const roof = byId.rooftop;

export const DIAG = {
  id: "diag",
  a: "electrical",
  b: "rooftop",
  x1: elec.x + elec.w - 36,
  y1: elec.y + 28,
  x2: roof.x + 36,
  y2: roof.y + roof.h - 28,
  half: 58,
  kind: "diag",
};

export const CORRIDORS = [
  linkH("h-garden-s2", "garden", "supply2"),
  linkH("h-s2-cafe", "supply2", "cafeteria"),
  linkH("h-cafe-cctv", "cafeteria", "cctv"),
  linkV("v-garden-elec", "garden", "electrical"),
  linkV("v-map-s2", "map", "supply2"),
  linkH("h-map-reactor", "map", "reactor"),
  linkV("v-reactor-cafe", "reactor", "cafeteria"),
  linkV("v-cafe-s1", "cafeteria", "supply1"),
  linkH("h-elec-s1", "electrical", "supply1"),
  linkH("h-s1-bed", "supply1", "bedroom"),
  linkV("v-cctv-bed", "cctv", "bedroom"),
  linkV("v-roof-cctv", "rooftop", "cctv"),
  DIAG,
];

const ANNEX_COLS = [-4480, -3320, -2160, -1000];
const ANNEX_ROWS = [-840, 140, 1120, 2100];

const ANNEX_HALL = 220;

function annexRoom(id, name, col, row, dress, floor) {
  return {
    id,
    name,
    num: 0,
    world: 1,
    x: ANNEX_COLS[col],
    y: ANNEX_ROWS[row],
    w: RW,
    h: RH,
    skip: 0.15,
    floor,
    accent: "#b7c0c8",
    dress,
  };
}

export const ANNEX = [
  annexRoom("watch", "관측대", 3, 0, "console", "#6a7c8a"),
  annexRoom("upper", "상부관", 3, 1, "pipe", "#7a6a58"),
  annexRoom("gate", "개폐실", 3, 2, "console", "#6d7a68"),
  annexRoom("drain", "배수실", 3, 3, "pipe", "#5d7380"),
  annexRoom("vent", "환기실", 2, 0, "pipe", "#7a685c"),
  annexRoom("pump", "펌프실", 2, 1, "tank", "#5e7890"),
  annexRoom("store", "보관고", 2, 2, "crate", "#8a7356"),
  annexRoom("kiln", "소각실", 2, 3, "tank", "#8a5c56"),
  annexRoom("cool", "냉각실", 1, 0, "tank", "#5a86a0"),
  annexRoom("filter", "여과실", 1, 1, "pipe", "#6a8468"),
  annexRoom("archive", "기록고", 1, 2, "crate", "#7a6a84"),
  annexRoom("settle", "침전조", 1, 3, "tank", "#5a7a72"),
  annexRoom("spare", "무기고", 0, 1, "crate", "#8a7a62"),
  annexRoom("hold", "격납고", 0, 2, "crate", "#6a7490"),
];

for (const room of ANNEX) byId[room.id] = room;

function tagAnnex(c) {
  c.world = 1;
  return c;
}

const gardenLink = linkH("h-garden-annex", "gate", "garden", ANNEX_HALL);
gardenLink.w += 56;

const annexCorridors = [
  tagAnnex(gardenLink),
  tagAnnex(linkV("v-watch-upper", "watch", "upper", ANNEX_HALL)),
  tagAnnex(linkV("v-annex-lever", "upper", "gate", ANNEX_HALL)),
  tagAnnex(linkV("v-gate-drain", "gate", "drain", ANNEX_HALL)),
  tagAnnex(linkV("v-vent-pump", "vent", "pump", ANNEX_HALL)),
  tagAnnex(linkV("v-pump-store", "pump", "store", ANNEX_HALL)),
  tagAnnex(linkV("v-store-kiln", "store", "kiln", ANNEX_HALL)),
  tagAnnex(linkV("v-cool-filter", "cool", "filter", ANNEX_HALL)),
  tagAnnex(linkV("v-filter-archive", "filter", "archive", ANNEX_HALL)),
  tagAnnex(linkV("v-archive-settle", "archive", "settle", ANNEX_HALL)),
  tagAnnex(linkV("v-spare-hold", "spare", "hold", ANNEX_HALL)),
  tagAnnex(linkH("h-cool-vent", "cool", "vent", ANNEX_HALL)),
  tagAnnex(linkH("h-vent-watch", "vent", "watch", ANNEX_HALL)),
  tagAnnex(linkH("h-spare-filter", "spare", "filter", ANNEX_HALL)),
  tagAnnex(linkH("h-filter-pump", "filter", "pump", ANNEX_HALL)),
  tagAnnex(linkH("h-pump-upper", "pump", "upper", ANNEX_HALL)),
  tagAnnex(linkH("h-hold-archive", "hold", "archive", ANNEX_HALL)),
  tagAnnex(linkH("h-archive-store", "archive", "store", ANNEX_HALL)),
  tagAnnex(linkH("h-store-gate", "store", "gate", ANNEX_HALL)),
  tagAnnex(linkH("h-settle-kiln", "settle", "kiln", ANNEX_HALL)),
  tagAnnex(linkH("h-kiln-drain", "kiln", "drain", ANNEX_HALL)),
];

let annexOpen = false;
let annexCache = null;

function skyRoom(id, name, x, y, dress, floor) {
  return {
    id,
    name,
    num: 0,
    world: 2,
    x,
    y,
    w: RW,
    h: RH,
    skip: 0.2,
    floor,
    accent: "#c8b8a0",
    dress,
  };
}

export const SKY = [
  skyRoom("skywatch", "관측대", 7800, -2200, "console", "#6a7c8a"),
  skyRoom("skysupply", "보급소", 8960, -2200, "crate", "#8a7356"),
  skyRoom("skyarm", "무기고", 8960, -3180, "crate", "#8a7a62"),
  skyRoom("escape", "탈출실", 8960, -4160, "console", "#6d7a68"),
  skyRoom("release", "괴물개방", 7800, -5140, "tank", "#8a5c56"),
  skyRoom("trial", "도전로", 8960, -5140, "pipe", "#7a6a58"),
];

for (const room of SKY) byId[room.id] = room;

function tagSky(c) {
  c.world = 2;
  return c;
}

const CABLE = tagSky({
  id: "cable",
  a: "rooftop",
  b: "skywatch",
  kind: "diag",
  x1: roof.x + roof.w - 48,
  y1: roof.y + 48,
  x2: byId.skywatch.x + 48,
  y2: byId.skywatch.y + byId.skywatch.h - 48,
  half: 92,
});

const SKY_HALL = 180;
const endlessHall = tagSky({
  id: "endless",
  a: "trial",
  b: "trial",
  kind: "rect",
  x: byId.trial.x + byId.trial.w,
  y: byId.trial.y + byId.trial.h / 2 - 120,
  w: 3200,
  h: 240,
});

const skyCorridors = [
  CABLE,
  tagSky(linkH("h-sky-watch-supply", "skywatch", "skysupply", SKY_HALL)),
  tagSky(linkV("v-sky-supply-arm", "skyarm", "skysupply", SKY_HALL)),
  tagSky(linkV("v-sky-arm-escape", "escape", "skyarm", SKY_HALL)),
  tagSky(linkV("v-sky-escape-trial", "trial", "escape", SKY_HALL)),
  tagSky(linkH("h-sky-release-trial", "release", "trial", SKY_HALL)),
  endlessHall,
];

let skyOpen = false;
let skyCache = null;

const corrById = Object.fromEntries(CORRIDORS.map((c) => [c.id, c]));

const WORLD0 = {
  minX: 40,
  minY: 20,
  maxX: COLS[3] + RW + 80,
  maxY: ROWS[2] + RH + 80,
};

function activeRooms() {
  let list = ROOMS;
  if (annexOpen) list = list.concat(ANNEX);
  if (skyOpen) list = list.concat(SKY);
  return list;
}

export function corridorById(id) {
  return corrById[id];
}

export function corridorAnchor(id) {
  const c = corrById[id];
  if (!c) return { x: 0, y: 0 };
  if (c.kind === "diag") return { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 };
  return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
}

export function anchorOf(place) {
  if (!place) return { x: 0, y: 0 };
  if (place.type === "room") return roomCenter(place.id);
  return corridorAnchor(place.id);
}

export function adjacentCorridors(roomId) {
  return CORRIDORS.filter((c) => c.a === roomId || c.b === roomId);
}

export function neighborCorridors(corrId) {
  const c = corrById[corrId];
  if (!c) return [];
  const out = [];
  const seen = new Set();
  for (const roomId of [c.a, c.b]) {
    for (const o of adjacentCorridors(roomId)) {
      if (o.id !== corrId && !seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
    }
  }
  return out;
}

export function nearestCorridor(x, y) {
  let best = CORRIDORS[0];
  let bestD = Infinity;
  for (const c of CORRIDORS) {
    const p = corridorAnchor(c.id);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return { dist: Math.hypot(px - x, py - y), t, x, y };
}

export function diagInfo(x, y, c = DIAG) {
  return distToSeg(x, y, c.x1, c.y1, c.x2, c.y2);
}

function onDiag(x, y, c, inner) {
  const d = diagInfo(x, y, c);
  const need = inner ? c.half - 6 : c.half;
  return d.dist <= need && d.t >= (inner ? 0.04 : 0) && d.t <= (inner ? 0.96 : 1) ? d : null;
}

function inRect(x, y, r, pad = 0) {
  return x >= r.x - pad && y >= r.y - pad && x <= r.x + r.w + pad && y <= r.y + r.h + pad;
}

export function locate(x, y) {
  for (const c of CORRIDORS) {
    if (c.kind === "diag" && onDiag(x, y, c, true)) return { kind: "corridor", id: c.id };
  }
  for (const room of activeRooms()) {
    if (inRect(x, y, room)) return { kind: "room", id: room.id };
  }
  for (const c of CORRIDORS) {
    if (c.kind === "rect" && inRect(x, y, c)) return { kind: "corridor", id: c.id };
  }
  for (const c of CORRIDORS) {
    if (c.kind === "diag" && onDiag(x, y, c, false)) return { kind: "corridor", id: c.id };
  }
  return { kind: "void", id: null };
}

function hallWalkRect(c) {
  const reach = 72;
  if (c.w >= c.h) return { x: c.x - reach, y: c.y, w: c.w + reach * 2, h: c.h };
  return { x: c.x, y: c.y - reach, w: c.w, h: c.h + reach * 2 };
}

export function isWalkable(x, y) {
  const pad = 12;
  for (const room of activeRooms()) {
    if (inRect(x, y, room, -pad)) return true;
  }
  for (const c of CORRIDORS) {
    if (c.kind === "rect" && inRect(x, y, hallWalkRect(c), -8)) return true;
  }
  for (const c of CORRIDORS) {
    if (c.kind !== "diag") continue;
    const d = diagInfo(x, y, c);
    if (d.dist <= c.half - 8 && d.t >= -0.02 && d.t <= 1.02) return true;
  }
  return false;
}

export const WORLD = {
  minX: 40,
  minY: 20,
  maxX: COLS[3] + RW + 80,
  maxY: ROWS[2] + RH + 80,
};

let floorCache = null;

const WALL = 36;
const FLOORS = {
  garden: "#5f6b58",
  electrical: "#59616c",
  supply2: "#6a6156",
  map: "#5c6470",
  cafeteria: "#6c615c",
  supply1: "#6a6156",
  reactor: "#6c585c",
  cctv: "#56616a",
  bedroom: "#675e66",
  rooftop: "#66716a",
};

function roomDoors(room) {
  const doors = { n: [], s: [], e: [], w: [] };
  for (const c of CORRIDORS) {
    if (c.kind !== "rect") continue;
    if (c.a !== room.id && c.b !== room.id) continue;
    if (c.w >= c.h) {
      const side = c.x >= room.x + room.w - 2 ? "e" : "w";
      doors[side].push({ a: c.y - room.y - 8, b: c.y + c.h - room.y + 8 });
    } else {
      const side = c.y >= room.y + room.h - 2 ? "s" : "n";
      doors[side].push({ a: c.x - room.x - 8, b: c.x + c.w - room.x + 8 });
    }
  }
  return doors;
}

function wallSegments(length, gaps) {
  const sorted = gaps
    .map((g) => ({ a: Math.max(0, g.a), b: Math.min(length, g.b) }))
    .filter((g) => g.b > g.a)
    .sort((p, q) => p.a - q.a);
  const out = [];
  let cursor = 0;
  for (const g of sorted) {
    if (g.a > cursor + 1) out.push([cursor, g.a]);
    cursor = Math.max(cursor, g.b);
  }
  if (cursor < length - 1) out.push([cursor, length]);
  return out;
}

function drawWallSide(ctx, room, side, gaps) {
  const { x, y, w, h } = room;
  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;
  let along = "x";
  if (side === "n") {
    rw = w;
    rh = WALL;
    along = "x";
  } else if (side === "s") {
    ry = y + h - WALL;
    rw = w;
    rh = WALL;
    along = "x";
  } else if (side === "w") {
    rw = WALL;
    rh = h;
    along = "y";
  } else {
    rx = x + w - WALL;
    rw = WALL;
    rh = h;
    along = "y";
  }
  const length = along === "x" ? rw : rh;
  for (const [a, b] of wallSegments(length, gaps)) {
    const sx = along === "x" ? rx + a : rx;
    const sy = along === "y" ? ry + a : ry;
    const sw = along === "x" ? b - a : rw;
    const sh = along === "y" ? b - a : rh;
    ctx.fillStyle = "#2c333c";
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = "#8b949f";
    if (side === "n") ctx.fillRect(sx, sy + sh - 6, sw, 6);
    else if (side === "s") ctx.fillRect(sx, sy, sw, 6);
    else if (side === "w") ctx.fillRect(sx + sw - 6, sy, 6, sh);
    else ctx.fillRect(sx, sy, 6, sh);
  }
}

function fillPanels(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.16)";
  ctx.lineWidth = 2;
  for (let px = x; px < x + w; px += 86) {
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
  }
  for (let py = y; py < y + h; py += 86) {
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  ctx.restore();
}

function paintHall(ctx, c) {
  const t = 26;
  ctx.fillStyle = "#242a32";
  ctx.fillRect(c.x - t, c.y - t, c.w + t * 2, c.h + t * 2);
  ctx.fillStyle = "#5a636e";
  ctx.fillRect(c.x, c.y, c.w, c.h);
  fillPanels(ctx, c.x, c.y, c.w, c.h);
  ctx.fillStyle = "#8b949f";
  if (c.w >= c.h) {
    ctx.fillRect(c.x, c.y, c.w, 5);
    ctx.fillRect(c.x, c.y + c.h - 5, c.w, 5);
  } else {
    ctx.fillRect(c.x, c.y, 5, c.h);
    ctx.fillRect(c.x + c.w - 5, c.y, 5, c.h);
  }
}

function consoleBox(ctx, x, y, w, h, screen) {
  ctx.fillStyle = "#3e4752";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#1c2228";
  ctx.fillRect(x + 8, y + 8, w - 16, Math.max(12, h * 0.42));
  ctx.fillStyle = screen;
  ctx.fillRect(x + 14, y + 14, 22, 12);
  ctx.fillStyle = "#c9a24a";
  ctx.fillRect(x + w - 28, y + h - 16, 12, 8);
}

function chair(ctx, x, y) {
  ctx.fillStyle = "#343c46";
  ctx.fillRect(x, y, 36, 44);
  ctx.fillStyle = "#22282f";
  ctx.fillRect(x + 5, y + 6, 26, 16);
}

function crate(ctx, x, y) {
  ctx.fillStyle = "#6a5a3e";
  ctx.fillRect(x, y, 46, 40);
  ctx.strokeStyle = "#2a2418";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, 46, 40);
  ctx.beginPath();
  ctx.moveTo(x, y + 20);
  ctx.lineTo(x + 46, y + 20);
  ctx.stroke();
}

function wireRun(ctx, points, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

function drawProps(ctx, room) {
  const x = room.x + WALL + 18;
  const y = room.y + WALL + 18;
  const r = room.x + room.w - WALL - 18;
  const b = room.y + room.h - WALL - 18;
  if (room.id === "garden") {
    for (const [px, py] of [[x, y], [x + 70, y + 20], [x, y + 90]]) {
      ctx.fillStyle = "#3d4a38";
      ctx.fillRect(px, py, 54, 54);
      ctx.fillStyle = "#6d8a62";
      ctx.beginPath();
      ctx.arc(px + 27, py + 22, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (room.id === "electrical") {
    consoleBox(ctx, x, b - 70, 150, 70, "#3ec0ff");
    consoleBox(ctx, x + 170, b - 58, 110, 58, "#7d8cff");
    const midY = room.y + room.h * 0.55;
    wireRun(ctx, [[x + 40, y + 30], [x + 180, y + 30], [x + 180, midY], [r - 40, midY]], "#e24b4b");
    wireRun(ctx, [[x + 70, y + 70], [x + 240, y + 90], [x + 240, midY + 30], [r - 80, midY + 36]], "#3aa0e8");
    wireRun(ctx, [[x + 20, y + 120], [x + 140, y + 150], [r - 120, y + 150]], "#e2c14a");
  } else if (room.id === "supply1" || room.id === "supply2") {
    crate(ctx, x, y);
    crate(ctx, x + 54, y + 8);
    crate(ctx, r - 46, b - 40);
    crate(ctx, r - 100, b - 36);
  } else if (room.id === "map") {
    consoleBox(ctx, x, y, 180, 78, "#9fd0c8");
    chair(ctx, x + 40, y + 96);
    chair(ctx, x + 100, y + 96);
    ctx.fillStyle = "#3a4250";
    ctx.fillRect(r - 120, b - 80, 110, 70);
    ctx.strokeStyle = "rgba(220,230,236,0.35)";
    ctx.strokeRect(r - 100, b - 64, 70, 40);
  } else if (room.id === "cafeteria") {
    ctx.fillStyle = "#4a403c";
    ctx.beginPath();
    ctx.ellipse(room.x + room.w * 0.38, room.y + room.h * 0.48, 70, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(room.x + room.w * 0.62, room.y + room.h * 0.58, 64, 32, 0.2, 0, Math.PI * 2);
    ctx.fill();
    chair(ctx, x, b - 44);
    chair(ctx, x + 48, b - 44);
  } else if (room.id === "reactor") {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    ctx.strokeStyle = "#8a3038";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#5a2428";
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    consoleBox(ctx, x, y, 130, 64, "#ff5a5a");
  } else if (room.id === "cctv") {
    for (let i = 0; i < 4; i++) consoleBox(ctx, x + i * 78, y, 70, 52, i % 2 ? "#67d0c8" : "#8eb4e8");
    ctx.fillStyle = "#2c343c";
    ctx.fillRect(x, y + 58, 300, 16);
    chair(ctx, x + 40, y + 90);
    chair(ctx, x + 150, y + 90);
  } else if (room.id === "bedroom") {
    ctx.fillStyle = "#4a3e48";
    ctx.fillRect(x, y, 120, 64);
    ctx.fillRect(x + 150, y, 120, 64);
    ctx.fillStyle = "#d5d0dc";
    ctx.fillRect(x + 10, y + 8, 36, 18);
    ctx.fillRect(x + 160, y + 8, 36, 18);
    chair(ctx, r - 50, b - 50);
  } else if (room.id === "rooftop") {
    ctx.strokeStyle = "rgba(210,220,214,0.45)";
    ctx.lineWidth = 4;
    ctx.strokeRect(room.x + WALL + 8, room.y + WALL + 8, room.w - (WALL + 8) * 2, room.h - (WALL + 8) * 2);
    ctx.lineWidth = 2;
  } else if (room.world === 1) {
    dressAnnex(ctx, room, x, y, r, b);
  }
}

function dressAnnex(ctx, room, x, y, r, b) {
  if (room.dress === "crate") {
    crate(ctx, x, y);
    crate(ctx, x + 56, y + 10);
    crate(ctx, r - 50, b - 44);
  } else if (room.dress === "tank") {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    ctx.fillStyle = "#3a434d";
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9aa6b2";
    ctx.lineWidth = 6;
    ctx.stroke();
    consoleBox(ctx, x, b - 58, 120, 52, "#7eb8c8");
  } else if (room.dress === "pipe") {
    wireRun(ctx, [[x, y + 20], [r - 40, y + 20], [r - 40, b - 30]], "#8aa0b0");
    wireRun(ctx, [[x + 30, y + 70], [x + 180, y + 110], [x + 180, b - 20]], "#c45a4a");
    consoleBox(ctx, r - 140, y, 110, 54, "#8eb0d0");
  } else {
    consoleBox(ctx, x, y, 160, 70, "#9fd0c4");
    chair(ctx, x + 36, y + 88);
    chair(ctx, x + 90, y + 88);
  }
}

export function annexIsOpen() {
  return annexOpen;
}

export function openAnnex() {
  if (annexOpen) return;
  annexOpen = true;
  for (const c of annexCorridors) {
    CORRIDORS.push(c);
    corrById[c.id] = c;
  }
  let minX = WORLD.minX;
  let minY = WORLD.minY;
  for (const room of ANNEX) {
    minX = Math.min(minX, room.x - 80);
    minY = Math.min(minY, room.y - 80);
  }
  WORLD.minX = minX;
  WORLD.minY = minY;
  floorCache = null;
  annexCache = null;
}

export function resetAnnex() {
  if (!annexOpen) return;
  for (const c of annexCorridors) {
    const i = CORRIDORS.indexOf(c);
    if (i >= 0) CORRIDORS.splice(i, 1);
    delete corrById[c.id];
  }
  annexOpen = false;
  WORLD.minX = WORLD0.minX;
  WORLD.minY = WORLD0.minY;
  WORLD.maxX = WORLD0.maxX;
  WORLD.maxY = WORLD0.maxY;
  floorCache = null;
  annexCache = null;
}

export function leverSpot() {
  if (!annexOpen) return null;
  const c = corrById["h-garden-annex"];
  if (!c) return null;
  return { x: c.x + c.w * 0.42, y: c.y + 34 };
}

export function skyIsOpen() {
  return skyOpen;
}

export function endlessRect() {
  return endlessHall;
}

export function cableLine() {
  return CABLE;
}

export function openSky() {
  if (skyOpen) return;
  skyOpen = true;
  for (const c of skyCorridors) {
    CORRIDORS.push(c);
    corrById[c.id] = c;
  }
  for (const room of SKY) {
    WORLD.minY = Math.min(WORLD.minY, room.y - 80);
    WORLD.maxX = Math.max(WORLD.maxX, room.x + room.w + 80);
  }
  WORLD.maxX = Math.max(WORLD.maxX, endlessHall.x + endlessHall.w + 80);
  WORLD.minY = Math.min(WORLD.minY, endlessHall.y - 80, CABLE.y2 - 80, CABLE.y1 - 80);
  floorCache = null;
  skyCache = null;
}

export function resetSky() {
  if (!skyOpen) return;
  for (const c of skyCorridors) {
    const i = CORRIDORS.indexOf(c);
    if (i >= 0) CORRIDORS.splice(i, 1);
    delete corrById[c.id];
  }
  skyOpen = false;
  skyCache = null;
  floorCache = null;
  if (!annexOpen) {
    WORLD.minX = WORLD0.minX;
    WORLD.minY = WORLD0.minY;
    WORLD.maxX = WORLD0.maxX;
    WORLD.maxY = WORLD0.maxY;
  } else {
    WORLD.minX = WORLD0.minX;
    WORLD.minY = WORLD0.minY;
    WORLD.maxX = WORLD0.maxX;
    WORLD.maxY = WORLD0.maxY;
    for (const room of ANNEX) {
      WORLD.minX = Math.min(WORLD.minX, room.x - 80);
      WORLD.minY = Math.min(WORLD.minY, room.y - 80);
    }
  }
}

export function whichWorld(x, y) {
  const loc = locate(x, y);
  if (loc.kind === "room") {
    const room = roomById(loc.id);
    if (room?.world === 1) return 1;
    if (room?.world === 2) return 2;
  }
  if (loc.kind === "corridor") {
    const c = corridorById(loc.id);
    if (c?.world === 1) return 1;
    if (c?.world === 2) return 2;
  }
  if (annexOpen && x < byId.garden.x - 4) return 1;
  return 0;
}

export function skyLayer() {
  if (!skyOpen) return null;
  if (skyCache) return skyCache;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const room of SKY) {
    grow(room.x - 8, room.y - 8);
    grow(room.x + room.w + 8, room.y + room.h + 8);
  }
  for (const c of skyCorridors) {
    if (c.id === "endless" || c.kind === "diag") continue;
    grow(c.x - 30, c.y - 30);
    grow(c.x + c.w + 30, c.y + c.h + 30);
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(maxX - minX);
  canvas.height = Math.ceil(maxY - minY);
  const ctx = canvas.getContext("2d");
  ctx.translate(-minX, -minY);
  for (const c of skyCorridors) {
    if (c.kind === "rect" && c.id !== "endless") paintHall(ctx, c);
  }
  for (const room of SKY) paintRoom(ctx, room);
  skyCache = { canvas, x: minX, y: minY };
  return skyCache;
}

export function paintSkyLive(ctx) {
  if (!skyOpen) return;
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#5a636e";
  ctx.lineWidth = CABLE.half * 2;
  ctx.beginPath();
  ctx.moveTo(CABLE.x1, CABLE.y1);
  ctx.lineTo(CABLE.x2, CABLE.y2);
  ctx.stroke();
  ctx.strokeStyle = "#9aa6b2";
  ctx.lineWidth = CABLE.half * 2 - 18;
  ctx.beginPath();
  ctx.moveTo(CABLE.x1, CABLE.y1);
  ctx.lineTo(CABLE.x2, CABLE.y2);
  ctx.stroke();
  paintHall(ctx, endlessHall);
}

function paintRoom(ctx, room) {
  ctx.fillStyle = room.floor || FLOORS[room.id] || "#626a74";
  ctx.fillRect(room.x, room.y, room.w, room.h);
  fillPanels(ctx, room.x, room.y, room.w, room.h);
  const doors = roomDoors(room);
  drawWallSide(ctx, room, "n", doors.n);
  drawWallSide(ctx, room, "s", doors.s);
  drawWallSide(ctx, room, "w", doors.w);
  drawWallSide(ctx, room, "e", doors.e);
  drawProps(ctx, room);
  const p = roomCenter(room.id);
  ctx.fillStyle = "rgba(226, 232, 238, 0.78)";
  ctx.font = '600 40px "IBM Plex Sans KR", "Malgun Gothic", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(room.name, p.x, room.y + room.h - 78);
}

export function annexLayer() {
  if (!annexOpen) return null;
  if (annexCache) return annexCache;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const room of ANNEX) {
    grow(room.x - 8, room.y - 8);
    grow(room.x + room.w + 8, room.y + room.h + 8);
  }
  for (const c of annexCorridors) {
    grow(c.x - 30, c.y - 30);
    grow(c.x + c.w + 30, c.y + c.h + 30);
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(maxX - minX);
  canvas.height = Math.ceil(maxY - minY);
  const ctx = canvas.getContext("2d");
  ctx.translate(-minX, -minY);
  for (const c of annexCorridors) paintHall(ctx, c);
  for (const room of ANNEX) paintRoom(ctx, room);
  annexCache = { canvas, x: minX, y: minY };
  return annexCache;
}

function worldFrame(mode) {
  const rooms = mode === 2 ? SKY : mode === 1 ? ANNEX : ROOMS;
  const halls =
    mode === 2 ? skyCorridors : mode === 1 ? annexCorridors : CORRIDORS.filter((c) => !c.world);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const room of rooms) {
    grow(room.x, room.y);
    grow(room.x + room.w, room.y + room.h);
  }
  for (const c of halls) {
    if (c.id === "endless" || c.kind === "diag") continue;
    if (c.kind === "diag") {
      grow(Math.min(c.x1, c.x2), Math.min(c.y1, c.y2));
      grow(Math.max(c.x1, c.x2), Math.max(c.y1, c.y2));
    } else {
      grow(c.x, c.y);
      grow(c.x + c.w, c.y + c.h);
    }
  }
  return { minX: minX - 48, minY: minY - 48, maxX: maxX + 48, maxY: maxY + 48, rooms, halls };
}

export function getFloorCanvas() {
  if (floorCache) return floorCache;
  const canvas = document.createElement("canvas");
  canvas.width = WORLD0.maxX + 40;
  canvas.height = WORLD0.maxY + 40;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#10141a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineCap = "round";
  ctx.strokeStyle = "#1a1e24";
  ctx.lineWidth = DIAG.half * 2 + 22;
  ctx.beginPath();
  ctx.moveTo(DIAG.x1, DIAG.y1);
  ctx.lineTo(DIAG.x2, DIAG.y2);
  ctx.stroke();
  ctx.strokeStyle = "#3a414a";
  ctx.lineWidth = DIAG.half * 2;
  ctx.beginPath();
  ctx.moveTo(DIAG.x1, DIAG.y1);
  ctx.lineTo(DIAG.x2, DIAG.y2);
  ctx.stroke();

  for (const c of CORRIDORS) {
    if (c.world || c.kind !== "rect") continue;
    paintHall(ctx, c);
  }

  for (const room of ROOMS) {
    ctx.fillStyle = FLOORS[room.id] || "#626a74";
    ctx.fillRect(room.x, room.y, room.w, room.h);
    fillPanels(ctx, room.x, room.y, room.w, room.h);
    const doors = roomDoors(room);
    drawWallSide(ctx, room, "n", doors.n);
    drawWallSide(ctx, room, "s", doors.s);
    drawWallSide(ctx, room, "w", doors.w);
    drawWallSide(ctx, room, "e", doors.e);
    drawProps(ctx, room);
    const p = roomCenter(room.id);
    ctx.fillStyle = "rgba(226, 232, 238, 0.78)";
    ctx.font = '600 40px "IBM Plex Sans KR", "Malgun Gothic", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(room.name, p.x, room.y + room.h - 78);
  }

  ctx.strokeStyle = "rgba(20, 24, 28, 0.55)";
  ctx.lineWidth = 8;
  ctx.setLineDash([16, 18]);
  ctx.beginPath();
  ctx.moveTo(DIAG.x1, DIAG.y1);
  ctx.lineTo(DIAG.x2, DIAG.y2);
  ctx.stroke();
  ctx.setLineDash([]);

  floorCache = canvas;
  return canvas;
}

export function drawSchematic(ctx, w, h, player, others = []) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, w, h);
  const pad = 28;
  const scale = Math.min((w - pad * 2) / (WORLD.maxX - 40), (h - pad * 2) / (WORLD.maxY - 20));
  const ox = pad - 40 * scale;
  const oy = pad - 10 * scale;
  const tx = (x) => ox + x * scale;
  const ty = (y) => oy + y * scale;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#4d5562";
  ctx.lineWidth = DIAG.half * 2;
  ctx.beginPath();
  ctx.moveTo(DIAG.x1, DIAG.y1);
  ctx.lineTo(DIAG.x2, DIAG.y2);
  ctx.stroke();
  ctx.fillStyle = "#b7bcc6";
  for (const c of CORRIDORS) {
    if (c.kind === "rect") ctx.fillRect(c.x, c.y, c.w, c.h);
  }
  ctx.lineWidth = 8 / scale;
  for (const room of ROOMS) {
    ctx.fillStyle = "#f7f4ee";
    ctx.fillRect(room.x, room.y, room.w, room.h);
    ctx.strokeStyle = "#2d3a4d";
    ctx.strokeRect(room.x, room.y, room.w, room.h);
    ctx.fillStyle = "#243044";
    ctx.font = `${18 / scale}px "IBM Plex Sans KR", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(room.name, room.x + room.w / 2, room.y + room.h / 2);
  }
  ctx.restore();

  const dot = (x, y, color, label) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tx(x), ty(y), 6, 0, Math.PI * 2);
    ctx.fill();
    if (label) {
      ctx.fillStyle = "#1c140f";
      ctx.font = '600 11px "IBM Plex Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(label, tx(x), ty(y) - 10);
    }
  };
  for (const o of others) {
    if (!o.alive) continue;
    dot(o.x, o.y, o.color || "#3d74d6", o.name);
  }
  if (player) dot(player.x, player.y, "#9a2430", "나");
}

export function drawMinimap(ctx, w, h, player, monsters = [], world = 0, pending = []) {
  const frame = worldFrame(world === 2 ? 2 : world === 1 ? 1 : 0);
  const pendingSet = new Set(pending || []);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#171b22";
  ctx.fillRect(0, 0, w, h);
  const pad = 18;
  const spanX = Math.max(1, frame.maxX - frame.minX);
  const spanY = Math.max(1, frame.maxY - frame.minY);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * scale) / 2 - frame.minX * scale;
  const oy = (h - spanY * scale) / 2 - frame.minY * scale;
  let hereId = "";
  let hereName = "";
  if (player) {
    const loc = locate(player.x, player.y);
    if (loc.kind === "room" && roomById(loc.id)) {
      hereId = loc.id;
      hereName = roomById(loc.id).name;
    } else if (loc.kind === "corridor") hereName = loc.id === "cable" ? "케이블카" : loc.id === "endless" ? "끝없는 복도" : "복도";
  }
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  if (world === 0) {
    ctx.lineCap = "butt";
    ctx.strokeStyle = "#3a414a";
    ctx.lineWidth = DIAG.half * 2;
    ctx.beginPath();
    ctx.moveTo(DIAG.x1, DIAG.y1);
    ctx.lineTo(DIAG.x2, DIAG.y2);
    ctx.stroke();
  } else if (world === 2) {
    ctx.lineCap = "butt";
    ctx.strokeStyle = "#c5ced6";
    ctx.lineWidth = CABLE.half * 2;
    ctx.beginPath();
    ctx.moveTo(CABLE.x1, CABLE.y1);
    ctx.lineTo(CABLE.x2, CABLE.y2);
    ctx.stroke();
  }
  for (const c of frame.halls) {
    if (c.kind !== "rect") continue;
    const special = c.world === 1 || c.world === 2;
    ctx.fillStyle = c.id === "endless" ? "#6a7380" : special ? "#c5ced6" : "#4e565f";
    const padHall = special ? 8 : 0;
    ctx.fillRect(c.x - padHall, c.y - padHall, c.w + padHall * 2, c.h + padHall * 2);
  }
  for (const room of frame.rooms) {
    const waiting = pendingSet.has(room.id);
    ctx.fillStyle = waiting ? "#c43838" : room.world ? "#d5dde4" : "#8b939c";
    ctx.fillRect(room.x, room.y, room.w, room.h);
    ctx.strokeStyle = room.id === hereId ? "#f4efe4" : "#2a3038";
    ctx.lineWidth = room.id === hereId ? 36 : 18;
    ctx.strokeRect(room.x, room.y, room.w, room.h);
    const chars = Math.max(2, room.name.length);
    const fontWorld = Math.min(room.w / (chars * 0.92), room.h * 0.34);
    ctx.font = `700 ${fontWorld}px "IBM Plex Sans KR", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(8, fontWorld * 0.14);
    ctx.strokeStyle = waiting ? "#4a1216" : "rgba(255,255,255,0.72)";
    ctx.strokeText(room.name, room.x + room.w / 2, room.y + room.h / 2);
    ctx.fillStyle = waiting ? "#fff6f4" : "#171b22";
    ctx.fillText(room.name, room.x + room.w / 2, room.y + room.h / 2);
  }
  ctx.restore();
  ctx.fillStyle = "#d7dde6";
  ctx.font = '700 22px "IBM Plex Sans KR", sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(world === 2 ? "WORLD 2" : world === 1 ? "WORLD 1" : "WORLD 0", 10, 8);
  if (hereName) {
    ctx.font = '700 20px "IBM Plex Sans KR", sans-serif';
    ctx.fillText(hereName, 10, 34);
  }
  const mark = (x, y, color, radius) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ox + x * scale, oy + y * scale, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#10141a";
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  const inside = (x, y) => x >= frame.minX && y >= frame.minY && x <= frame.maxX && y <= frame.maxY;
  for (const m of monsters) if (inside(m.x, m.y)) mark(m.x, m.y, "#e23b3b", 5);
  if (player) mark(player.x, player.y, "#f2f6fb", 6);
}

export function fitPoint(x, y, w, h) {
  const pad = 28;
  const scale = Math.min((w - pad * 2) / (WORLD.maxX - 40), (h - pad * 2) / (WORLD.maxY - 20));
  return { x: pad - 40 * scale + x * scale, y: pad - 10 * scale + y * scale, scale };
}
