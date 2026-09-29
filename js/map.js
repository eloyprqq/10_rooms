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

function linkH(id, left, right) {
  const a = byId[left];
  const b = byId[right];
  const x = a.x + a.w;
  const y = a.y + a.h / 2 - HALL / 2;
  return { id, a: left, b: right, x, y, w: b.x - x, h: HALL, kind: "rect" };
}

function linkV(id, top, bottom) {
  const a = byId[top];
  const b = byId[bottom];
  const y = a.y + a.h;
  const x = a.x + a.w / 2 - HALL / 2;
  return { id, a: top, b: bottom, x, y, w: HALL, h: b.y - y, kind: "rect" };
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

const corrById = Object.fromEntries(CORRIDORS.map((c) => [c.id, c]));

export function corridorById(id) {
  return corrById[id];
}

export function corridorAnchor(id) {
  const c = corrById[id];
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

export function diagInfo(x, y) {
  return distToSeg(x, y, DIAG.x1, DIAG.y1, DIAG.x2, DIAG.y2);
}

function inRect(x, y, r, pad = 0) {
  return x >= r.x - pad && y >= r.y - pad && x <= r.x + r.w + pad && y <= r.y + r.h + pad;
}

export function locate(x, y) {
  const d = diagInfo(x, y);
  if (d.dist <= DIAG.half - 6 && d.t > 0.07 && d.t < 0.93) {
    return { kind: "corridor", id: DIAG.id };
  }
  for (const room of ROOMS) {
    if (inRect(x, y, room)) return { kind: "room", id: room.id };
  }
  for (const c of CORRIDORS) {
    if (c.kind === "rect" && inRect(x, y, c)) return { kind: "corridor", id: c.id };
  }
  if (d.dist <= DIAG.half && d.t >= 0 && d.t <= 1) return { kind: "corridor", id: DIAG.id };
  return { kind: "void", id: null };
}

function hallWalkRect(c) {
  const reach = 72;
  if (c.w >= c.h) return { x: c.x - reach, y: c.y, w: c.w + reach * 2, h: c.h };
  return { x: c.x, y: c.y - reach, w: c.w, h: c.h + reach * 2 };
}

export function isWalkable(x, y) {
  const pad = 12;
  for (const room of ROOMS) {
    if (inRect(x, y, room, -pad)) return true;
  }
  for (const c of CORRIDORS) {
    if (c.kind === "rect" && inRect(x, y, hallWalkRect(c), -8)) return true;
  }
  const d = diagInfo(x, y);
  if (d.dist <= DIAG.half - 8 && d.t >= -0.02 && d.t <= 1.02) return true;
  return false;
}

export const WORLD = {
  minX: 40,
  minY: 20,
  maxX: COLS[3] + RW + 80,
  maxY: ROWS[2] + RH + 80,
};

let floorCache = null;

function drawProps(ctx, room) {
  const c = roomCenter(room.id);
  ctx.save();
  if (room.id !== "rooftop") {
    ctx.translate(c.x, c.y);
    ctx.scale(2.7, 2.7);
    ctx.translate(-c.x, -c.y);
  }
  if (room.id === "garden") {
    for (const [dx, dy] of [[-50, -20], [40, 10], [-10, 40]]) {
      ctx.fillStyle = "#1e3a2a";
      ctx.beginPath();
      ctx.arc(c.x + dx, c.y + dy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3d6b4a";
      ctx.beginPath();
      ctx.arc(c.x + dx, c.y + dy - 6, 11, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (room.id === "electrical") {
    ctx.fillStyle = "#121820";
    ctx.fillRect(c.x - 34, c.y - 22, 68, 44);
    ctx.strokeStyle = room.accent;
    ctx.strokeRect(c.x - 34, c.y - 22, 68, 44);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? "#6ec1ff" : "#2a3c52";
      ctx.fillRect(c.x - 24 + i * 18, c.y - 10, 10, 18);
    }
  } else if (room.id === "supply1" || room.id === "supply2") {
    ctx.fillStyle = "#3a2e22";
    ctx.fillRect(c.x - 28, c.y - 16, 26, 22);
    ctx.fillRect(c.x + 4, c.y - 8, 24, 20);
    ctx.strokeStyle = "#8a7050";
    ctx.strokeRect(c.x - 28, c.y - 16, 26, 22);
    ctx.strokeRect(c.x + 4, c.y - 8, 24, 20);
  } else if (room.id === "map") {
    ctx.fillStyle = "#2a2430";
    ctx.fillRect(c.x - 36, c.y - 18, 72, 36);
    ctx.strokeStyle = room.accent;
    ctx.strokeRect(c.x - 36, c.y - 18, 72, 36);
    ctx.strokeStyle = "rgba(230,220,200,0.35)";
    ctx.strokeRect(c.x - 26, c.y - 10, 22, 16);
    ctx.strokeRect(c.x + 2, c.y - 10, 22, 16);
  } else if (room.id === "cafeteria") {
    ctx.fillStyle = "#3a2a28";
    for (const [dx, dy] of [[-40, -16], [24, 8]]) {
      ctx.beginPath();
      ctx.ellipse(c.x + dx, c.y + dy, 18, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (room.id === "reactor") {
    ctx.strokeStyle = "#8a3030";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#5a2024";
    ctx.beginPath();
    ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
  } else if (room.id === "cctv") {
    ctx.fillStyle = "#10161c";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(c.x - 40 + i * 28, c.y - 16, 22, 16);
      ctx.strokeStyle = "#6ec8c8";
      ctx.strokeRect(c.x - 40 + i * 28, c.y - 16, 22, 16);
    }
    ctx.fillStyle = "#2a3844";
    ctx.fillRect(c.x - 46, c.y + 6, 92, 10);
  } else if (room.id === "bedroom") {
    ctx.fillStyle = "#3a2c38";
    ctx.fillRect(c.x - 56, c.y - 18, 40, 28);
    ctx.fillRect(c.x + 12, c.y - 10, 40, 28);
    ctx.fillStyle = "#d8d0dc";
    ctx.fillRect(c.x - 50, c.y - 14, 12, 8);
    ctx.fillRect(c.x + 18, c.y - 6, 12, 8);
  } else if (room.id === "rooftop") {
    ctx.strokeStyle = "rgba(200,210,200,0.35)";
    ctx.strokeRect(room.x + 10, room.y + 10, room.w - 20, room.h - 20);
    ctx.beginPath();
    ctx.moveTo(room.x + 18, room.y + 18);
    ctx.lineTo(room.x + room.w - 18, room.y + 18);
    ctx.stroke();
  }
  ctx.restore();
}

export function getFloorCanvas() {
  if (floorCache) return floorCache;
  const canvas = document.createElement("canvas");
  canvas.width = WORLD.maxX + 40;
  canvas.height = WORLD.maxY + 40;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineCap = "round";
  ctx.strokeStyle = "#121722";
  ctx.lineWidth = DIAG.half * 2 + 18;
  ctx.beginPath();
  ctx.moveTo(DIAG.x1, DIAG.y1);
  ctx.lineTo(DIAG.x2, DIAG.y2);
  ctx.stroke();
  ctx.strokeStyle = "#1c2430";
  ctx.lineWidth = DIAG.half * 2;
  ctx.beginPath();
  ctx.moveTo(DIAG.x1, DIAG.y1);
  ctx.lineTo(DIAG.x2, DIAG.y2);
  ctx.stroke();

  for (const c of CORRIDORS) {
    if (c.kind !== "rect") continue;
    ctx.fillStyle = "#1a2030";
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = "#3c4a60";
    ctx.lineWidth = 4;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
  }

  for (const room of ROOMS) {
    ctx.fillStyle = room.floor;
    ctx.fillRect(room.x, room.y, room.w, room.h);
    ctx.strokeStyle = "#8b97a8";
    ctx.lineWidth = 10;
    ctx.strokeRect(room.x + 2, room.y + 2, room.w - 4, room.h - 4);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(room.x + 7, room.y + 7, room.w - 14, room.h - 14);
    drawProps(ctx, room);
    const p = roomCenter(room.id);
    ctx.fillStyle = "rgba(232, 226, 214, 0.78)";
    ctx.font = '600 48px "IBM Plex Sans KR", "Malgun Gothic", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(room.name, p.x, p.y - 170);
    ctx.fillStyle = "rgba(232, 226, 214, 0.4)";
    ctx.font = '600 28px "IBM Plex Sans KR", sans-serif';
    ctx.fillText(String(room.num).padStart(2, "0"), p.x, room.y + room.h - 36);
  }

  ctx.strokeStyle = "rgba(180, 60, 60, 0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 10]);
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

export function fitPoint(x, y, w, h) {
  const pad = 28;
  const scale = Math.min((w - pad * 2) / (WORLD.maxX - 40), (h - pad * 2) / (WORLD.maxY - 20));
  return { x: pad - 40 * scale + x * scale, y: pad - 10 * scale + y * scale, scale };
}
