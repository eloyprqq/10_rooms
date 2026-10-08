import {
  CORRIDORS,
  adjacentCorridors,
  anchorOf,
  corridorAnchor,
  corridorById,
  neighborCorridors,
  nearestCorridor,
  roomById,
} from "./map.js?v=48";

function shuffle(list, rng) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function distanceTo(fromId, toId) {
  if (fromId === toId) return 0;
  const queue = [fromId];
  const dist = new Map([[fromId, 0]]);
  while (queue.length) {
    const id = queue.shift();
    const d = dist.get(id);
    for (const next of neighborCorridors(id)) {
      if (dist.has(next.id)) continue;
      if (next.id === toId) return d + 1;
      dist.set(next.id, d + 1);
      queue.push(next.id);
    }
  }
  return 99;
}

function targetCorridor(body) {
  if (body.hall && corridorById(body.hall)) return corridorById(body.hall);
  if (body.room) {
    const options = adjacentCorridors(body.room);
    let best = options[0];
    let bestD = Infinity;
    for (const c of options) {
      const p = corridorAnchor(c.id);
      const d = (p.x - body.x) ** 2 + (p.y - body.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) return best;
  }
  return nearestCorridor(body.x, body.y);
}

const COUNTS = { easy: 1, normal: 2, hard: 3, extreme: 4 };
const ANNEX_COUNTS = { easy: 2, normal: 3, hard: 4, extreme: 5 };

export function monsterCount(difficulty) {
  return COUNTS[difficulty] || 1;
}

function placeKey(place) {
  return `${place.type}:${place.id}`;
}

function takenByOthers(monsters, self) {
  const used = new Set();
  for (const monster of monsters) {
    if (monster === self) continue;
    used.add(placeKey(monster.place));
  }
  return used;
}

function flee(monster, rng, monsters = []) {
  const used = takenByOthers(monsters, monster);
  const free = CORRIDORS.filter((c) => !used.has(`corridor:${c.id}`));
  const pool = free.length ? free : CORRIDORS;
  const c = pool[Math.floor(rng() * pool.length)];
  monster.place = { type: "corridor", id: c.id };
  monster.lockUntil = 0;
  monster.exposure = {};
}

function nearestLiving(monster, bodies) {
  const p = anchorOf(monster.place);
  let best = null;
  let bestD = Infinity;
  for (const b of bodies) {
    if (!b.alive) continue;
    const d = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best || bodies[0];
}

function stepToCorridor(monster, body, t, events, monsters = []) {
  if (t < monster.lockUntil) return;
  const target = targetCorridor(body);
  if (!target) return;
  const used = takenByOthers(monsters, monster);

  const rank = (corridor) => {
    const p = corridorAnchor(corridor.id);
    return distanceTo(corridor.id, target.id) * 1e6 + (p.x - body.x) ** 2 + (p.y - body.y) ** 2;
  };

  if (monster.place.type === "room") {
    let best = null;
    let bestRank = Infinity;
    for (const c of adjacentCorridors(monster.place.id)) {
      if (used.has(`corridor:${c.id}`)) continue;
      const score = rank(c);
      if (score < bestRank) {
        bestRank = score;
        best = c;
      }
    }
    if (!best) return;
    monster.place = { type: "corridor", id: best.id };
    monster.exposure = {};
    events.push({ t, type: "hall", monsterId: monster.id, loc: best.id });
    return;
  }

  if (monster.place.id === target.id) return;
  const curRank = rank(corridorById(monster.place.id));
  let best = null;
  let bestRank = curRank;
  for (const c of neighborCorridors(monster.place.id)) {
    if (used.has(`corridor:${c.id}`)) continue;
    const score = rank(c);
    if (score < bestRank) {
      bestRank = score;
      best = c;
    }
  }
  if (best) {
    monster.place = { type: "corridor", id: best.id };
    events.push({ t, type: "hall", monsterId: monster.id, loc: best.id });
  }
}

function pressureOf(state) {
  return Math.min(1, (state.doneTasks || []).length / 14);
}

function tryEnterRoom(monster, body, t, rng, events, monsters = [], pressure = 0) {
  if (t < monster.lockUntil) return;
  if (monster.place.type !== "corridor") return;
  const corr = corridorById(monster.place.id);
  const used = takenByOthers(monsters, monster);
  const options = [corr.a, corr.b].sort((a, b) => {
    const pa = anchorOf({ type: "room", id: a });
    const pb = anchorOf({ type: "room", id: b });
    const da = (pa.x - body.x) ** 2 + (pa.y - body.y) ** 2;
    const db = (pb.x - body.x) ** 2 + (pb.y - body.y) ** 2;
    return da - db;
  });
  const roomId = options.find((id) => id !== "gate" && !used.has(`room:${id}`));
  if (!roomId) return;
  const room = roomById(roomId);
  if (rng() < room.skip * (1 - 0.65 * pressure)) {
    events.push({ t, type: "skip", monsterId: monster.id, room: roomId });
    return;
  }
  monster.place = { type: "room", id: roomId };
  monster.lockUntil = t + Math.max(2, Math.round(5 - 3 * pressure));
  monster.exposure = {};
  events.push({ t, type: "enter", monsterId: monster.id, room: roomId });
}

function publicMonster(monster) {
  return {
    id: monster.id,
    type: monster.place.type,
    loc: monster.place.id,
    lockUntil: monster.lockUntil,
  };
}

export function createMatch(difficulty, rng = Math.random) {
  const count = monsterCount(difficulty);
  const monsters = [];
  const halls = shuffle(CORRIDORS, rng);
  for (let i = 0; i < count; i++) {
    const c = halls[i % halls.length];
    monsters.push({
      id: i + 1,
      place: { type: "corridor", id: c.id },
      lockUntil: 0,
      exposure: {},
    });
  }
  return {
    time: 1,
    power: true,
    reactor: null,
    meltdown: false,
    reactorHalted: false,
    powerStopped: false,
    worldOpen: false,
    skyOpen: false,
    annexSpawned: false,
    powerHoldUntil: 0,
    sediment: null,
    gateOpenUntil: 0,
    gateCardAt: 0,
    doneTasks: [],
    dataGot: [],
    shieldsAt: 0,
    monsters,
    history: [],
    difficulty,
  };
}

export function snapshot(state, t, hits) {
  return {
    t,
    power: state.power,
    reactor: state.reactor ? { ...state.reactor } : null,
    meltdown: state.meltdown,
    powerHoldUntil: state.powerHoldUntil || 0,
    sediment: state.sediment && state.sediment.start ? { start: state.sediment.start, until: state.sediment.until || state.sediment.start + 10 } : { start: 0 },
    monsters: state.monsters.map(publicMonster),
    hits,
  };
}

export function advance(state, delta, bodies, rng = Math.random, now = Date.now()) {
  if (state.meltdown) return [];
  const snaps = [];
  const living = bodies.filter((b) => b.alive);
  const focusPool = living.length ? living : bodies;
  const next = state.time + delta;
  for (let t = state.time + 1; t <= next; t++) {
    const hits = [];
    if (state.powerStopped) state.power = false;
    else if (t % 17 === 0 && !(state.powerHoldUntil && t <= state.powerHoldUntil)) state.power = false;
    if (state.sediment && t >= state.sediment.until) state.sediment = null;
    if (t % 50 === 0 && state.worldOpen && !state.sediment) state.sediment = { start: t, until: t + 10 };
    if (t % 13 === 0 && !state.reactor && !state.meltdown && !state.reactorHalted) {
      state.reactor = { start: t, deadlineAt: now + 40000 };
    }

    if (!state.meltdown && focusPool.length) {
      const pressure = pressureOf(state);
      for (const monster of state.monsters) {
        const body = nearestLiving(monster, focusPool);
        if (!body) continue;
        if (t % 4 === 0) tryEnterRoom(monster, body, t, rng, [], state.monsters, pressure);
        else if (t % 2 === 0 || (pressure >= 0.5 && t % 4 === 1) || (pressure >= 0.85 && t % 4 === 3)) {
          stepToCorridor(monster, body, t, [], state.monsters);
        }
      }
    }

    if (!state.meltdown) {
      for (const monster of state.monsters) {
        const caught = [];
        for (const body of bodies) {
          if (!body.alive) {
            monster.exposure[body.id] = 0;
            continue;
          }
          const inside = monster.place.type === "room" && monster.place.id === body.room && body.room !== "gate";
          if (!inside) {
            monster.exposure[body.id] = 0;
            continue;
          }
          monster.exposure[body.id] = (monster.exposure[body.id] || 0) + 1;
          if (monster.exposure[body.id] >= 3) caught.push(body);
        }
        if (caught.length) {
          for (const body of caught) {
            hits.push({ playerId: body.id, monsterId: monster.id, amount: 99, t });
          }
          flee(monster, rng, state.monsters);
        }
      }
    }

    state.time = t;
    const snap = snapshot(state, t, hits);
    state.history.push(snap);
    if (state.history.length > 40) state.history.shift();
    snaps.push(snap);
    if (state.meltdown) break;
  }
  return snaps;
}

export function spawnAnnexMonsters(state, rng = Math.random) {
  if (!state || state.annexSpawned) return;
  state.annexSpawned = true;
  const count = ANNEX_COUNTS[state.difficulty] || 2;
  const halls = shuffle(
    CORRIDORS.filter((c) => c.world === 1),
    rng
  );
  let made = 0;
  for (const c of halls) {
    if (made >= count) break;
    if (state.monsters.some((m) => m.place.type === "corridor" && m.place.id === c.id)) continue;
    state.monsters.push({
      id: 101 + made,
      place: { type: "corridor", id: c.id },
      lockUntil: 0,
      exposure: {},
    });
    made += 1;
  }
}

export function scatterMonsters(state, rng = Math.random) {
  const open = shuffle(CORRIDORS, rng);
  state.monsters.forEach((monster, i) => {
    const c = open[i % open.length];
    monster.place = { type: "corridor", id: c.id };
    monster.lockUntil = 0;
    monster.exposure = {};
  });
}

export function applyMonsterView(state, list) {
  for (const raw of list || []) {
    let monster = state.monsters.find((m) => m.id === raw.id);
    if (!monster) {
      monster = { id: raw.id, place: { type: raw.type, id: raw.loc }, lockUntil: raw.lockUntil || 0, exposure: {} };
      state.monsters.push(monster);
    }
    monster.place = { type: raw.type, id: raw.loc };
    monster.lockUntil = raw.lockUntil || 0;
  }
}

export function rollDelta(rng = Math.random) {
  return 1 + Math.floor(rng() * 3);
}
