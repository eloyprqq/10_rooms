const COLORS = [
  { id: "red", hex: "#d64545" },
  { id: "blue", hex: "#3d74d6" },
  { id: "yellow", hex: "#e0b341" },
  { id: "pink", hex: "#d15ca8" },
];

let onPower = () => {};
let onReactor = () => {};
let onGate = () => {};
let wiresOpen = false;
let cardOpen = false;
let cardMode = "reactor";
let links = [];
let selected = null;
let cardStart = 0;
let dragging = false;

function $(id) {
  return document.getElementById(id);
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function initMinigames(handlers) {
  onPower = handlers.onPower;
  onReactor = handlers.onReactor;
  onGate = handlers.onGate || (() => {});
  $("wire-close").addEventListener("click", closeMinigames);
  $("card-close").addEventListener("click", closeMinigames);
  const card = $("swipe-card");
  card.addEventListener("pointerdown", (e) => {
    if (!cardOpen) return;
    dragging = true;
    cardStart = performance.now();
    card.setPointerCapture(e.pointerId);
    card.style.transition = "none";
  });
  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const track = $("swipe-track").getBoundingClientRect();
    let x = e.clientX - track.left - 36;
    x = Math.max(0, Math.min(track.width - 78, x));
    card.style.left = `${x}px`;
    if (x > track.width - 110) finishCard(performance.now() - cardStart);
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (cardOpen) {
      card.style.transition = "left 0.2s ease";
      card.style.left = "8px";
      $("card-msg").textContent = "너무 일찍 놓았습니다.";
      if (cardMode === "gate") {
        const mode = cardMode;
        setTimeout(() => {
          if (cardMode !== mode || !cardOpen) return;
          closeMinigames();
          onGate(false);
        }, 450);
      }
    }
  };
  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);
}

function layoutWires() {
  const board = $("wire-board");
  const right = shuffle(COLORS);
  links = [];
  selected = null;
  board.innerHTML = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "wire-svg";
  board.appendChild(svg);
  COLORS.forEach((color, i) => {
    const row = document.createElement("div");
    row.className = "wire-row";
    const left = document.createElement("button");
    left.type = "button";
    left.className = "wire-node";
    left.style.background = color.hex;
    left.dataset.side = "left";
    left.dataset.color = color.id;
    left.dataset.index = String(i);
    const rightBtn = document.createElement("button");
    rightBtn.type = "button";
    rightBtn.className = "wire-node";
    rightBtn.style.background = right[i].hex;
    rightBtn.dataset.side = "right";
    rightBtn.dataset.color = right[i].id;
    rightBtn.dataset.index = String(i);
    row.appendChild(left);
    row.appendChild(rightBtn);
    board.appendChild(row);
  });
  board.addEventListener("click", onWireClick);
  $("wire-msg").textContent = "왼쪽을 고른 뒤 같은 색의 오른쪽을 누르세요.";
  drawLinks();
}

function onWireClick(e) {
  const node = e.target.closest(".wire-node");
  if (!node || !wiresOpen) return;
  if (node.dataset.side === "left") {
    selected = node.dataset.color;
    document.querySelectorAll(".wire-node").forEach((n) => n.classList.toggle("picked", n === node));
    return;
  }
  if (!selected) return;
  links = links.filter((l) => l.left !== selected && l.right !== node.dataset.color);
  if (selected === node.dataset.color) {
    links.push({ left: selected, right: node.dataset.color });
    $("wire-msg").textContent = "연결되었습니다.";
  } else {
    $("wire-msg").textContent = "색이 다릅니다.";
  }
  selected = null;
  document.querySelectorAll(".wire-node").forEach((n) => n.classList.remove("picked"));
  drawLinks();
  if (links.length === COLORS.length) {
    $("wire-msg").textContent = "전력이 복구되었습니다.";
    setTimeout(() => {
      closeMinigames();
      onPower();
    }, 450);
  }
}

function drawLinks() {
  const svg = $("wire-svg");
  const board = $("wire-board");
  if (!svg || !board) return;
  const rect = board.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  svg.innerHTML = "";
  for (const link of links) {
    const left = board.querySelector(`.wire-node[data-side="left"][data-color="${link.left}"]`);
    const right = board.querySelector(`.wire-node[data-side="right"][data-color="${link.right}"]`);
    if (!left || !right) continue;
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.right - rect.left));
    line.setAttribute("y1", String(a.top + a.height / 2 - rect.top));
    line.setAttribute("x2", String(b.left - rect.left));
    line.setAttribute("y2", String(b.top + b.height / 2 - rect.top));
    line.setAttribute("stroke", left.style.background);
    line.setAttribute("stroke-width", "6");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
  }
}

function finishCard(elapsed) {
  if (!dragging && elapsed == null) return;
  dragging = false;
  const ok = elapsed >= 620 && elapsed <= 1400;
  if (ok) {
    $("card-msg").textContent = cardMode === "gate" ? "문이 열립니다." : "출입 허가.";
    const mode = cardMode;
    setTimeout(() => {
      closeMinigames();
      if (mode === "gate") onGate(true);
      else onReactor();
    }, 400);
    return;
  }
  $("card-msg").textContent = elapsed < 620 ? "너무 빠릅니다." : "너무 느립니다.";
  const card = $("swipe-card");
  card.style.transition = "left 0.2s ease";
  card.style.left = "8px";
  if (cardMode === "gate") {
    const mode = cardMode;
    setTimeout(() => {
      if (!cardOpen || cardMode !== mode) return;
      closeMinigames();
      onGate(false);
    }, 500);
  }
}

export function openWires() {
  closeMinigames();
  wiresOpen = true;
  $("wire-overlay").classList.remove("hidden");
  layoutWires();
  requestAnimationFrame(drawLinks);
}

export function openCard(mode = "reactor") {
  closeMinigames();
  cardMode = mode === "gate" ? "gate" : "reactor";
  cardOpen = true;
  $("card-overlay").classList.remove("hidden");
  $("card-msg").textContent = cardMode === "gate" ? "성공하면 문이 5초 열립니다." : "카드를 오른쪽 끝까지 일정한 속도로 긁으세요.";
  const card = $("swipe-card");
  card.style.transition = "none";
  card.style.left = "8px";
}

export function closeMinigames() {
  wiresOpen = false;
  cardOpen = false;
  dragging = false;
  const board = $("wire-board");
  if (board) board.replaceWith(board.cloneNode(false));
  $("wire-overlay").classList.add("hidden");
  $("card-overlay").classList.add("hidden");
}

export function minigameOpen() {
  return wiresOpen || cardOpen;
}
