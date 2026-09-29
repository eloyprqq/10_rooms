export const TASKS = [
  { id: "garden", name: "정원", title: "화분에 물 주기" },
  { id: "electrical", name: "전기실", title: "차단기 맞추기" },
  { id: "supply2", name: "보급소 2", title: "상자 색 맞추기" },
  { id: "map", name: "지도", title: "좌표 찍기" },
  { id: "cafeteria", name: "식당", title: "접시 치우기" },
  { id: "supply1", name: "보급소 1", title: "재고 맞추기" },
  { id: "reactor", name: "원자로", title: "출력 맞추기" },
  { id: "cctv", name: "CCTV", title: "이상 화면 찾기" },
  { id: "bedroom", name: "침실", title: "이불 개기" },
  { id: "rooftop", name: "옥상", title: "안테나 돌리기" },
];

const COLORS = [
  { name: "빨강", hex: "#d64545" },
  { name: "파랑", hex: "#3d74d6" },
  { name: "노랑", hex: "#e0b341" },
];

let onDone = () => {};
let open = false;
let token = 0;
let raf = 0;

function $(id) {
  return document.getElementById(id);
}

function taskById(id) {
  return TASKS.find((task) => task.id === id);
}

function btn(label) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "mission-btn";
  el.textContent = label;
  return el;
}

export function initMissions(done) {
  onDone = done;
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

export function openMission(roomId) {
  const task = taskById(roomId);
  if (!task) return;
  closeMission();
  open = true;
  const mine = token;
  $("mission-kicker").textContent = task.name;
  $("mission-title").textContent = task.title;
  $("mission-msg").textContent = "";
  $("mission-overlay").classList.remove("hidden");
  const body = $("mission-body");
  const msg = $("mission-msg");
  const succeed = () => {
    if (mine !== token || !open) return;
    msg.textContent = "완료.";
    const stamp = token;
    setTimeout(() => {
      if (stamp !== token) return;
      closeMission();
      onDone(roomId);
    }, 320);
  };
  build(roomId, body, msg, succeed, mine);
}

function build(roomId, body, msg, succeed, mine) {
  if (roomId === "garden") return pots(body, msg, succeed);
  if (roomId === "electrical") return switches(body, msg, succeed);
  if (roomId === "supply2") return crates(body, msg, succeed);
  if (roomId === "map") return coords(body, msg, succeed);
  if (roomId === "cafeteria") return plates(body, msg, succeed);
  if (roomId === "supply1") return stock(body, msg, succeed);
  if (roomId === "reactor") return gauge(body, msg, succeed, mine);
  if (roomId === "cctv") return cameras(body, msg, succeed);
  if (roomId === "bedroom") return beds(body, msg, succeed);
  if (roomId === "rooftop") return antenna(body, msg, succeed);
}

function pots(body, msg, succeed) {
  msg.textContent = "마른 화분 세 개에 물을 주세요.";
  const row = document.createElement("div");
  row.className = "mission-row";
  let left = 3;
  for (let i = 0; i < 3; i++) {
    const el = btn("마른 화분");
    el.addEventListener("click", () => {
      if (el.disabled) return;
      el.disabled = true;
      el.classList.add("good");
      el.textContent = "물 줌";
      left -= 1;
      if (left === 0) succeed();
    });
    row.appendChild(el);
  }
  body.appendChild(row);
}

function switches(body, msg, succeed) {
  const target = [0, 1, 2, 3].map(() => Math.random() < 0.5);
  const cur = target.map((on) => !on);
  msg.textContent = "아래 표시와 같은 상태로 맞추세요.";
  const want = document.createElement("div");
  want.className = "mission-row";
  target.forEach((on) => {
    const el = btn(on ? "켜짐" : "꺼짐");
    el.disabled = true;
    el.classList.toggle("good", on);
    want.appendChild(el);
  });
  const row = document.createElement("div");
  row.className = "mission-row";
  const paint = () => {
    [...row.children].forEach((el, i) => {
      el.textContent = cur[i] ? "켜짐" : "꺼짐";
      el.classList.toggle("good", cur[i]);
    });
    if (cur.every((on, i) => on === target[i])) succeed();
  };
  cur.forEach((on, i) => {
    const el = btn(on ? "켜짐" : "꺼짐");
    el.classList.toggle("good", on);
    el.addEventListener("click", () => {
      cur[i] = !cur[i];
      paint();
    });
    row.appendChild(el);
  });
  body.appendChild(want);
  body.appendChild(row);
}

function crates(body, msg, succeed) {
  msg.textContent = "상자 색을 이름과 같게 누르세요.";
  const row = document.createElement("div");
  row.className = "mission-row";
  const state = [0, 1, 2].map((i) => ({ target: i, cur: (i + 1) % 3 }));
  const paint = () => {
    [...row.children].forEach((el, i) => {
      el.style.background = COLORS[state[i].cur].hex;
      el.textContent = COLORS[state[i].target].name;
    });
    if (state.every((box) => box.cur === box.target)) succeed();
  };
  state.forEach((box, i) => {
    const el = btn(COLORS[box.target].name);
    el.addEventListener("click", () => {
      state[i].cur = (state[i].cur + 1) % 3;
      paint();
    });
    row.appendChild(el);
  });
  body.appendChild(row);
  paint();
}

function coords(body, msg, succeed) {
  const order = [];
  while (order.length < 3) {
    const n = 1 + Math.floor(Math.random() * 10);
    if (!order.includes(n)) order.push(n);
  }
  let step = 0;
  const say = () => {
    msg.textContent = `순서대로 누르세요: ${order.join(" → ")}  (지금 ${order[step]})`;
  };
  say();
  const row = document.createElement("div");
  row.className = "mission-row";
  for (let n = 1; n <= 10; n++) {
    const el = btn(String(n));
    el.addEventListener("click", () => {
      if (n !== order[step]) {
        step = 0;
        msg.textContent = `틀렸습니다. 처음부터: ${order.join(" → ")}`;
        return;
      }
      step += 1;
      if (step >= order.length) succeed();
      else say();
    });
    row.appendChild(el);
  }
  body.appendChild(row);
}

function plates(body, msg, succeed) {
  msg.textContent = "더러운 접시 네 개를 치우세요.";
  const row = document.createElement("div");
  row.className = "mission-row";
  let left = 4;
  for (let i = 0; i < 4; i++) {
    const el = btn("접시");
    el.addEventListener("click", () => {
      if (el.disabled) return;
      el.disabled = true;
      el.classList.add("good");
      el.textContent = "치움";
      left -= 1;
      if (left === 0) succeed();
    });
    row.appendChild(el);
  }
  body.appendChild(row);
}

function stock(body, msg, succeed) {
  const bread = 1 + Math.floor(Math.random() * 3);
  const bandage = 1 + Math.floor(Math.random() * 2);
  const total = bread + bandage + 1;
  msg.textContent = `빵 ${bread}, 붕대 ${bandage}, 손전등 1. 합계는?`;
  const options = [total, total + 1, Math.max(1, total - 1)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const row = document.createElement("div");
  row.className = "mission-row";
  for (const n of options) {
    const el = btn(String(n));
    el.addEventListener("click", () => {
      if (n === total) succeed();
      else msg.textContent = `아닙니다. 빵 ${bread}, 붕대 ${bandage}, 손전등 1.`;
    });
    row.appendChild(el);
  }
  body.appendChild(row);
}

function gauge(body, msg, succeed, mine) {
  msg.textContent = "초록 구간에 들어올 때 고정을 세 번 누르세요.";
  const track = document.createElement("div");
  track.className = "gauge";
  const zone = document.createElement("div");
  zone.className = "gauge-zone";
  const needle = document.createElement("div");
  needle.className = "gauge-needle";
  track.appendChild(zone);
  track.appendChild(needle);
  body.appendChild(track);
  const hit = btn("고정");
  body.appendChild(hit);
  let pos = 8;
  let dir = 1;
  let hits = 0;
  hit.addEventListener("click", () => {
    if (pos >= 40 && pos <= 60) {
      hits += 1;
      msg.textContent = `맞춤 ${hits}/3`;
      if (hits >= 3) succeed();
    } else msg.textContent = "구간 밖입니다.";
  });
  const tick = () => {
    if (mine !== token) return;
    pos += dir * 0.85;
    if (pos >= 100) {
      pos = 100;
      dir = -1;
    }
    if (pos <= 0) {
      pos = 0;
      dir = 1;
    }
    needle.style.left = `${pos}%`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function cameras(body, msg, succeed) {
  let round = 0;
  const lay = () => {
    body.innerHTML = "";
    const bad = Math.floor(Math.random() * 6);
    msg.textContent = `깨진 화면을 고르세요. ${round + 1}/2`;
    const row = document.createElement("div");
    row.className = "mission-row";
    for (let i = 0; i < 6; i++) {
      const el = btn(i === bad ? "////" : "화면");
      if (i === bad) el.classList.add("glitch");
      el.addEventListener("click", () => {
        if (i !== bad) {
          msg.textContent = "그 화면은 정상이다.";
          return;
        }
        round += 1;
        if (round >= 2) succeed();
        else lay();
      });
      row.appendChild(el);
    }
    body.appendChild(row);
  };
  lay();
}

function beds(body, msg, succeed) {
  msg.textContent = "구겨진 이불 세 개를 개세요.";
  const row = document.createElement("div");
  row.className = "mission-row";
  let left = 3;
  for (let i = 0; i < 3; i++) {
    const el = btn("구겨짐");
    el.addEventListener("click", () => {
      if (el.disabled) return;
      el.disabled = true;
      el.classList.add("good");
      el.textContent = "개킴";
      left -= 1;
      if (left === 0) succeed();
    });
    row.appendChild(el);
  }
  body.appendChild(row);
}

function antenna(body, msg, succeed) {
  const target = Math.floor(Math.random() * 8) * 45;
  let current = (target + 90 + Math.floor(Math.random() * 6) * 45) % 360;
  msg.textContent = "노란 바늘을 흰 목표와 같은 방향으로 돌리세요.";
  const wrap = document.createElement("div");
  wrap.className = "antenna-wrap";
  const goal = dial(target, "#f4f1ea");
  const live = dial(current, "#e0b15a");
  wrap.appendChild(goal);
  wrap.appendChild(live);
  const turn = btn("돌리기");
  turn.addEventListener("click", () => {
    current = (current + 45) % 360;
    live.querySelector("i").style.transform = `rotate(${current}deg)`;
    if (current === target) succeed();
  });
  body.appendChild(wrap);
  body.appendChild(turn);
}

function dial(deg, color) {
  const el = document.createElement("div");
  el.className = "dial";
  const mark = document.createElement("i");
  mark.style.background = color;
  mark.style.transform = `rotate(${deg}deg)`;
  el.appendChild(mark);
  return el;
}
