const ROOM_NAME = {
  garden: "정원",
  electrical: "전기실",
  supply2: "보급소 2",
  map: "지도",
  cafeteria: "식당",
  supply1: "보급소 1",
  reactor: "원자로",
  cctv: "CCTV",
  bedroom: "침실",
  rooftop: "옥상",
};

export const DATA_ROOMS = ["garden", "supply2", "map", "cafeteria", "supply1", "cctv", "bedroom", "rooftop"];

export const TASKS = [
  { id: "meteor", name: "옥상", title: "운석 파괴" },
  { id: "garden-trash", name: "정원", title: "쓰레기통 비우기" },
  { id: "shields", name: "CCTV", title: "보호막 가동" },
  { id: "oxygen-bedroom", name: "침실", title: "산소통 비우기" },
  { id: "oxygen-supply1", name: "보급소 1", title: "산소통 비우기" },
  { id: "cafeteria", name: "식당", title: "쓰레기통 또는 루비" },
  ...DATA_ROOMS.map((id) => ({ id: `data:${id}`, name: ROOM_NAME[id], title: "데이터 업로드" })),
];

let onDone = () => {};
let onDownload = () => {};
let open = false;
let token = 0;
let raf = 0;

function $(id) {
  return document.getElementById(id);
}

function has(list, id) {
  return (list || []).includes(id);
}

export function actionsFor(roomId, progress) {
  const done = progress?.done || [];
  const got = progress?.got || [];
  const actions = [];
  if (DATA_ROOMS.includes(roomId) && !has(got, roomId) && !has(done, `data:${roomId}`)) {
    actions.push({ kind: "download", label: "데이터 다운로드" });
  }
  if (roomId === "garden" && !has(done, "garden-trash")) actions.push({ kind: "trash", label: "쓰레기통 비우기" });
  if (roomId === "rooftop" && !has(done, "meteor")) actions.push({ kind: "meteor", label: "운석 파괴" });
  if (roomId === "cctv" && !has(done, "shields")) actions.push({ kind: "shields", label: "보호막 가동" });
  if (roomId === "bedroom" && !has(done, "oxygen-bedroom")) actions.push({ kind: "oxygen", label: "산소통 비우기" });
  if (roomId === "supply1" && !has(done, "oxygen-supply1")) actions.push({ kind: "oxygen", label: "산소통 비우기" });
  if (roomId === "cafeteria" && !has(done, "cafeteria")) {
    actions.push({ kind: "trash-link", label: "쓰레기통 비우기" });
    actions.push({ kind: "ruby", label: "루비 보관" });
  }
  if (roomId === "electrical") {
    const pending = DATA_ROOMS.filter((id) => has(got, id) && !has(done, `data:${id}`));
    if (pending.length) actions.push({ kind: "upload", label: "데이터 업로드", pending });
  }
  return actions;
}

export function initMissions(handlers) {
  onDone = handlers.onDone;
  onDownload = handlers.onDownload;
  $("mission-close").addEventListener("click", closeMission);
}

export function missionOpen() {
  return open;
}

export function closeMission() {
  token += 1;
  open = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  $("mission-overlay").classList.add("hidden");
  $("mission-body").innerHTML = "";
}

export function openRoomTasks(roomId, progress) {
  const actions = actionsFor(roomId, progress);
  if (!actions.length) return false;
  begin(ROOM_NAME[roomId] || roomId);
  if (actions.length === 1) run(actions[0], roomId);
  else menu(actions, roomId);
  return true;
}

function begin(kicker) {
  closeMission();
  open = true;
  $("mission-kicker").textContent = kicker;
  $("mission-title").textContent = "할 일";
  $("mission-msg").textContent = "";
  $("mission-overlay").classList.remove("hidden");
}

function menu(actions, roomId) {
  const body = $("mission-body");
  $("mission-msg").textContent = "할 일을 고르세요.";
  const row = document.createElement("div");
  row.className = "mission-row";
  for (const action of actions) {
    const el = button(action.label);
    el.addEventListener("click", () => {
      body.innerHTML = "";
      run(action, roomId);
    });
    row.appendChild(el);
  }
  body.appendChild(row);
}

function run(action, roomId) {
  const mine = token;
  const body = $("mission-body");
  const msg = $("mission-msg");
  $("mission-title").textContent = action.label;
  const succeed = (taskId) => {
    if (mine !== token || !open) return;
    msg.textContent = "완료.";
    const stamp = token;
    setTimeout(() => {
      if (stamp !== token) return;
      closeMission();
      onDone(taskId);
    }, 1100);
  };
  if (action.kind === "download") return download(roomId, body, msg, mine);
  if (action.kind === "upload") return upload(action.pending, body, msg, mine);
  if (action.kind === "meteor") return meteors(body, msg, succeed, mine);
  if (action.kind === "trash") return garbage(body, msg, succeed, false);
  if (action.kind === "trash-link") return garbage(body, msg, succeed, true);
  if (action.kind === "ruby") return ruby(body, msg, succeed);
  if (action.kind === "shields") return shields(body, msg, succeed);
  if (action.kind === "oxygen") return oxygen(body, msg, succeed, roomId === "bedroom" ? "oxygen-bedroom" : "oxygen-supply1");
}

function button(label) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "mission-btn";
  el.textContent = label;
  return el;
}

function download(roomId, body, msg, mine) {
  msg.textContent = "받는 중입니다.";
  const bar = meter(body);
  const started = performance.now();
  const tick = (now) => {
    if (mine !== token) return;
    const p = Math.min(1, (now - started) / 2200);
    bar.style.width = `${p * 100}%`;
    if (p < 1) {
      raf = requestAnimationFrame(tick);
      return;
    }
    msg.textContent = "받았다. 전기실에서 올려라.";
    const stamp = token;
    setTimeout(() => {
      if (stamp !== token) return;
      closeMission();
      onDownload(roomId);
    }, 400);
  };
  raf = requestAnimationFrame(tick);
}

function upload(pending, body, msg, mine) {
  msg.textContent = `${pending.length}개 올리는 중.`;
  const bar = meter(body);
  const list = document.createElement("p");
  list.className = "mission-note";
  list.textContent = pending.map((id) => ROOM_NAME[id]).join(", ");
  body.appendChild(list);
  const started = performance.now();
  const total = pending.length * 900;
  let sent = 0;
  const tick = (now) => {
    if (mine !== token) return;
    const elapsed = now - started;
    bar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
    const due = Math.min(pending.length, Math.floor(elapsed / 900));
    while (sent < due) {
      onDone(`data:${pending[sent]}`);
      sent += 1;
    }
    if (elapsed < total) {
      raf = requestAnimationFrame(tick);
      return;
    }
    onDone(pending.map((id) => `data:${id}`).join(","));
    msg.textContent = "업로드 완료.";
    const stamp = token;
    setTimeout(() => {
      if (stamp !== token) return;
      closeMission();
    }, 400);
  };
  raf = requestAnimationFrame(tick);
}

function meter(body) {
  const track = document.createElement("div");
  track.className = "data-track";
  const fill = document.createElement("div");
  fill.className = "data-fill";
  track.appendChild(fill);
  body.appendChild(track);
  return fill;
}

function meteors(body, msg, succeed, mine) {
  msg.textContent = "운석 20개를 맞추세요.";
  const canvas = document.createElement("canvas");
  canvas.className = "space-view";
  canvas.width = 560;
  canvas.height = 320;
  body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const rocks = [];
  let hits = 0;
  let laser = null;
  const spawn = () => {
    const edge = Math.floor(Math.random() * 4);
    const rock = { r: 14 + Math.random() * 10, spin: Math.random() * 6 };
    if (edge === 0) {
      rock.x = Math.random() * 560;
      rock.y = -20;
    } else if (edge === 1) {
      rock.x = 580;
      rock.y = Math.random() * 260;
    } else if (edge === 2) {
      rock.x = Math.random() * 560;
      rock.y = 300;
    } else {
      rock.x = -20;
      rock.y = Math.random() * 260;
    }
    const tx = 180 + Math.random() * 200;
    const ty = 80 + Math.random() * 120;
    const d = Math.hypot(tx - rock.x, ty - rock.y) || 1;
    const speed = 0.55 + Math.random() * 0.45;
    rock.vx = ((tx - rock.x) / d) * speed;
    rock.vy = ((ty - rock.y) / d) * speed;
    rocks.push(rock);
  };
  const fire = (x, y) => {
    laser = { x, y, until: performance.now() + 140 };
  };
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    fire(x, y);
    for (let i = rocks.length - 1; i >= 0; i--) {
      const rock = rocks[i];
      if (Math.hypot(rock.x - x, rock.y - y) <= rock.r + 8) {
        rocks.splice(i, 1);
        hits += 1;
        msg.textContent = `파괴 ${hits}/20`;
        if (hits >= 20) succeed("meteor");
        return;
      }
    }
  });
  let last = performance.now();
  const tick = (now) => {
    if (mine !== token) return;
    const dt = Math.min(32, now - last);
    last = now;
    if (rocks.length < 4 && hits < 20) spawn();
    ctx.fillStyle = "#070b16";
    ctx.fillRect(0, 0, 560, 320);
    ctx.fillStyle = "#d8e4ff";
    for (let i = 0; i < 28; i++) ctx.fillRect((i * 97) % 560, (i * 53) % 300, 2, 2);
    for (let i = rocks.length - 1; i >= 0; i--) {
      const rock = rocks[i];
      rock.x += rock.vx * dt;
      rock.y += rock.vy * dt;
      rock.spin += 0.01;
      if (rock.x < -40 || rock.x > 600 || rock.y < -40 || rock.y > 360) rocks.splice(i, 1);
      else {
        ctx.save();
        ctx.translate(rock.x, rock.y);
        ctx.rotate(rock.spin);
        ctx.fillStyle = "#8d7a68";
        ctx.beginPath();
        ctx.moveTo(rock.r, 0);
        ctx.lineTo(rock.r * 0.3, rock.r * 0.8);
        ctx.lineTo(-rock.r * 0.7, rock.r * 0.4);
        ctx.lineTo(-rock.r, -rock.r * 0.3);
        ctx.lineTo(-rock.r * 0.2, -rock.r);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = "#9fd0c8";
    ctx.fillRect(262, 292, 36, 18);
    if (laser && now < laser.until) {
      ctx.strokeStyle = "#d8fff4";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(280, 292);
      ctx.lineTo(laser.x, laser.y);
      ctx.stroke();
      ctx.fillStyle = "#eafff8";
      ctx.beginPath();
      ctx.arc(laser.x, laser.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function garbage(body, msg, succeed, linked) {
  msg.textContent = linked ? "레버를 내리면 쓰레기가 창고로 갑니다." : "레버를 아래로 내리세요.";
  const wrap = document.createElement("div");
  wrap.className = linked ? "garbage linked" : "garbage";
  const track = document.createElement("div");
  track.className = "lever-track";
  const handle = document.createElement("div");
  handle.className = "lever-handle";
  track.appendChild(handle);
  const chute = document.createElement("div");
  chute.className = "chute";
  const mouth = document.createElement("div");
  mouth.className = "chute-mouth";
  mouth.textContent = "배출구";
  chute.appendChild(mouth);
  wrap.appendChild(track);
  if (linked) {
    const pipe = document.createElement("div");
    pipe.className = "pipe";
    const house = document.createElement("div");
    house.className = "warehouse";
    house.textContent = "창고";
    wrap.appendChild(pipe);
    wrap.appendChild(house);
    house.appendChild(mouth);
  } else {
    wrap.appendChild(chute);
  }
  body.appendChild(wrap);
  let dragging = false;
  const place = (clientY) => {
    const rect = track.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height - 36, clientY - rect.top - 18));
    handle.style.top = `${y}px`;
    if (y > rect.height - 52) dump();
  };
  let dumped = false;
  const dump = () => {
    if (dumped) return;
    dumped = true;
    dragging = false;
    const outlet = linked ? wrap.querySelector(".warehouse") : mouth;
    for (let i = 0; i < 6; i++) {
      const bit = document.createElement("i");
      bit.className = linked ? "trash-bit along" : "trash-bit";
      bit.style.animationDelay = `${i * 0.08}s`;
      outlet.appendChild(bit);
    }
    msg.textContent = linked ? "쓰레기가 창고로 빠졌다." : "쓰레기가 배출구로 나왔다.";
    succeed(linked ? "cafeteria" : "garden-trash");
  };
  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (dragging) place(e.clientY);
  });
  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}

function ruby(body, msg, succeed) {
  msg.textContent = "루비를 보관함으로 끌어 넣으세요.";
  const stage = document.createElement("div");
  stage.className = "ruby-stage";
  const gem = document.createElement("div");
  gem.className = "ruby";
  gem.textContent = "루비";
  const safe = document.createElement("div");
  safe.className = "safe";
  safe.textContent = "보관함";
  stage.appendChild(gem);
  stage.appendChild(safe);
  body.appendChild(stage);
  let dragging = false;
  gem.addEventListener("pointerdown", (e) => {
    dragging = true;
    gem.setPointerCapture(e.pointerId);
  });
  gem.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const rect = stage.getBoundingClientRect();
    gem.style.left = `${e.clientX - rect.left - 28}px`;
    gem.style.top = `${e.clientY - rect.top - 22}px`;
  });
  const drop = () => {
    if (!dragging) return;
    dragging = false;
    const a = gem.getBoundingClientRect();
    const b = safe.getBoundingClientRect();
    const cx = a.left + a.width / 2;
    const cy = a.top + a.height / 2;
    if (cx > b.left && cx < b.right && cy > b.top && cy < b.bottom) {
      gem.remove();
      safe.textContent = "보관됨";
      safe.classList.add("full");
      msg.textContent = "루비를 넣었다.";
      succeed("cafeteria");
    }
  };
  gem.addEventListener("pointerup", drop);
  gem.addEventListener("pointercancel", () => {
    dragging = false;
  });
}

function shields(body, msg, succeed) {
  msg.textContent = "빨간 육각형을 눌러 하얗게 바꾸세요.";
  const grid = document.createElement("div");
  grid.className = "hex-grid";
  let left = 8;
  for (let i = 0; i < 8; i++) {
    const hex = document.createElement("button");
    hex.type = "button";
    hex.className = "hex";
    hex.addEventListener("click", () => {
      if (hex.classList.contains("lit")) return;
      hex.classList.add("lit");
      left -= 1;
      if (left === 0) lightHull();
    });
    grid.appendChild(hex);
  }
  const hull = document.createElement("div");
  hull.className = "hull";
  hull.innerHTML = "<i></i><i></i><i></i><i></i><i></i><i></i>";
  body.appendChild(grid);
  body.appendChild(hull);
  const lightHull = () => {
    msg.textContent = "함선 바깥 전등이 켜진다.";
    hull.classList.add("on");
    succeed("shields");
  };
}

function oxygen(body, msg, succeed, taskId) {
  msg.textContent = "산소통 세 개의 밸브를 여세요.";
  const row = document.createElement("div");
  row.className = "mission-row";
  let left = 3;
  for (let i = 0; i < 3; i++) {
    const tank = document.createElement("button");
    tank.type = "button";
    tank.className = "canister";
    tank.textContent = "산소";
    tank.addEventListener("click", () => {
      if (tank.disabled) return;
      tank.disabled = true;
      tank.classList.add("vent");
      tank.textContent = "비움";
      left -= 1;
      msg.textContent = left ? "기체가 빠진다." : "산소통이 비었다.";
      if (left === 0) succeed(taskId);
    });
    row.appendChild(tank);
  }
  body.appendChild(row);
}
