'use strict';
// ============================================================
// MAP: layout, tile rendering, objects, LOS, pathing, cover
// ============================================================
const MW = 40, MH = 26;
const T = { BAD: 0, PAVE: 1, ROAD: 2, WALL: 3, FLOOR: 4, PAD: 5, LOT: 6, DIRT: 7 };
let grid, deco, objAt, mapCanvas, explored;

// object definitions: rect on obstacles sheet, cover (0/1 half/2 full), blocks movement
const OBJ = {
  lamp:   { r: [0, 0, 32, 48], ax: 16, ay: 45, cover: 0, block: true, tall: true },
  barrel: { r: [2, 50, 12, 11], ax: 6, ay: 10, cover: 1, block: true, explosive: true, hp: 1 },
  barrel1:{ r: [20, 51, 7, 9], ax: 3, ay: 8, cover: 1, block: true, explosive: true, hp: 1 },
  rock1:  { r: [1, 64, 14, 14], ax: 7, ay: 13, cover: 2, block: true },
  rock2:  { r: [17, 64, 14, 14], ax: 7, ay: 13, cover: 2, block: true },
  rock3:  { r: [33, 64, 14, 14], ax: 7, ay: 13, cover: 2, block: true },
  rockW:  { r: [49, 64, 30, 14], ax: 7, ay: 13, cover: 2, block: true, w: 2 },
  desk:   { r: [1, 82, 14, 12], ax: 7, ay: 11, cover: 1, block: true, hp: 2, debris: true },
  chair:  { r: [20, 80, 8, 15], ax: 4, ay: 13, cover: 1, block: true, hp: 1, debris: true },
  junk:   { r: [33, 80, 31, 15], ax: 7, ay: 14, cover: 1, block: true, w: 2, hp: 2, debris: true },
  crate:  { r: [65, 80, 14, 14], ax: 7, ay: 13, cover: 1, block: true, hp: 2, debris: true },
  shelf:  { r: [81, 80, 14, 12], ax: 7, ay: 11, cover: 1, block: true, hp: 2, debris: true },
  cabinet:{ r: [0, 112, 20, 13], ax: 10, ay: 12, cover: 1, block: true, hp: 2, debris: true },
  debris1:{ r: [101, 85, 10, 6], ax: 5, ay: 4, cover: 0, block: false },
  debris2:{ r: [117, 84, 10, 11], ax: 5, ay: 8, cover: 0, block: false },
  debris3:{ r: [132, 85, 6, 5], ax: 3, ay: 3, cover: 0, block: false },
  spike:  { r: [45, 36, 6, 8], ax: 3, ay: 7, cover: 0, block: false },
  carRH:  { r: [4, 135, 24, 17], ax: 4, ay: 15, cover: 2, block: true, w: 2, wreck: 'carRHw' },
  carBH:  { r: [132, 135, 24, 17], ax: 4, ay: 15, cover: 2, block: true, w: 2, wreck: 'carBHw' },
  carRV:  { r: [70, 134, 19, 21], ax: 9, ay: 19, cover: 2, block: true, h: 2, wreck: 'carRVw' },
  carBV:  { r: [198, 134, 19, 21], ax: 9, ay: 19, cover: 2, block: true, h: 2, wreck: 'carBVw' },
  carRHw: { r: [4, 165, 24, 18], ax: 4, ay: 16, cover: 2, block: true, w: 2 },
  carBHw: { r: [132, 165, 24, 18], ax: 4, ay: 16, cover: 2, block: true, w: 2 },
  carRVw: { r: [71, 163, 19, 21], ax: 9, ay: 19, cover: 2, block: true, h: 2 },
  carBVw: { r: [199, 163, 19, 21], ax: 9, ay: 19, cover: 2, block: true, h: 2 },
  burntV: { r: [72, 195, 19, 21], ax: 9, ay: 19, cover: 2, block: true, h: 2 },
  burntV2:{ r: [200, 195, 19, 21], ax: 9, ay: 19, cover: 2, block: true, h: 2 },
};
const objects = [];

function buildMap() {
  grid = []; deco = []; objAt = []; explored = [];
  for (let y = 0; y < MH; y++) { grid.push(new Array(MW).fill(T.BAD)); deco.push(new Array(MW).fill(null)); objAt.push(new Array(MW).fill(null)); explored.push(new Array(MW).fill(false)); }
  const fill = (t, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) grid[y][x] = t; };
  const walls = (x0, y0, x1, y1, gaps = []) => {
    fill(T.FLOOR, x0 + 1, y0 + 1, x1 - 1, y1 - 1);
    for (let x = x0; x <= x1; x++) { grid[y0][x] = T.WALL; grid[y1][x] = T.WALL; }
    for (let y = y0; y <= y1; y++) { grid[y][x0] = T.WALL; grid[y][x1] = T.WALL; }
    for (const [gx, gy, t] of gaps) grid[gy][gx] = t === undefined ? T.FLOOR : t;
  };
  // city pavement west, ragged edge into badlands
  fill(T.PAVE, 0, 0, 27, 25);
  for (let y = 0; y < MH; y++) { const e = 28 + ((y * 7) % 3 === 0 ? 1 : 0) - ((y * 5) % 4 === 0 ? 1 : 0); fill(T.DIRT, e, y, e + 1, y); }
  // roads
  fill(T.ROAD, 0, 14, 31, 15);
  fill(T.ROAD, 18, 0, 19, 25);
  // Halvorsen office (Vance)
  walls(3, 2, 14, 10, [[8, 10], [9, 10], [14, 7]]);
  for (let y = 3; y <= 7; y++) grid[y][10] = T.WALL; grid[5][10] = T.FLOOR;
  // NE warehouse (ruined)
  walls(21, 2, 27, 10, [[24, 10], [25, 10], [21, 5], [21, 6], [27, 7], [26, 2], [27, 2], [27, 3]]);
  grid[2][26] = T.PAVE; grid[2][27] = T.PAVE; grid[3][27] = T.PAVE;
  // south ruin (low walls)
  walls(7, 19, 13, 23, [[10, 19], [11, 19], [7, 21], [13, 21], [13, 22], [9, 23], [10, 23]]);
  // parking lot SE
  fill(T.LOT, 21, 18, 27, 24);
  // LZ helipad
  fill(T.PAD, 33, 3, 36, 6);

  // decor: craters + badlands variants
  const rnd = mulberry(7);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) deco[y][x] = Math.floor(rnd() * 1000);
  craters = [[31, 9, 2], [36, 11, 3], [30, 19, 2], [37, 20, 1], [33, 16, 1], [38, 1, 1], [30, 2, 1], [35, 23, 2]];

  // objects
  const P = (type, x, y) => placeObj(type, x, y);
  // start area / south
  P('carBH', 2, 17); P('rock1', 5, 18); P('barrel', 15, 18); P('carRV', 16, 21); P('rock2', 3, 24);
  P('lamp', 6, 16); P('lamp', 12, 16); P('lamp', 6, 13); P('lamp', 14, 13); P('lamp', 24, 13); P('lamp', 24, 16);
  P('lamp', 17, 6); P('lamp', 20, 9); P('lamp', 17, 20); P('lamp', 20, 21);
  P('junk', 9, 21); P('crate', 12, 20); P('debris2', 8, 20); P('debris1', 11, 22);
  // main road
  P('carRH', 4, 14); P('carBV', 13, 14); P('burntV', 22, 14); P('carRH', 25, 15); P('barrel1', 16, 13); P('barrel', 21, 16);
  P('carBH', 9, 12); P('rock3', 1, 12); P('debris3', 11, 15); P('debris1', 17, 14);
  // office interior
  P('desk', 5, 5); P('cabinet', 7, 3); P('chair', 4, 7); P('desk', 12, 4); P('shelf', 13, 8); P('crate', 11, 8); P('junk', 5, 8); P('desk', 8, 7);
  // north street
  P('carRV', 16, 1); P('barrel', 20, 3); P('rock1', 1, 1); P('carBV', 1, 6);
  // warehouse
  P('crate', 23, 4); P('crate', 25, 6); P('junk', 22, 8); P('shelf', 26, 4); P('barrel', 24, 7); P('debris2', 26, 3);
  // parking lot
  P('carBV', 22, 19); P('carRV', 24, 19); P('carRHw', 22, 23); P('barrel', 26, 21); P('burntV2', 26, 18);
  // badlands
  P('rockW', 30, 5); P('rock2', 32, 8); P('rock1', 38, 4); P('rock3', 31, 13); P('rockW', 35, 8); P('rock2', 29, 17);
  P('rock1', 34, 18); P('rock3', 37, 14); P('carBVw', 38, 9); P('barrel', 32, 2); P('rock2', 36, 1); P('spike', 33, 12);
  P('rockW', 29, 23); P('rock1', 37, 24); P('carRVw', 30, 10);
  renderMapCanvas();
}
let craters = [];
function inb(x, y) { return x >= 0 && y >= 0 && x < MW && y < MH; }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function placeObj(type, x, y) {
  const d = OBJ[type]; const o = { type, x, y, w: d.w || 1, h: d.h || 1, hp: d.hp || 99, alive: true };
  objects.push(o);
  for (let dy = 0; dy < o.h; dy++) for (let dx = 0; dx < o.w; dx++) if (inb(x + dx, y + dy)) objAt[y + dy][x + dx] = o;
  return o;
}
function removeObj(o) {
  o.alive = false;
  for (let dy = 0; dy < o.h; dy++) for (let dx = 0; dx < o.w; dx++) if (inb(o.x + dx, o.y + dy) && objAt[o.y + dy][o.x + dx] === o) objAt[o.y + dy][o.x + dx] = null;
}

// ---------- tile drawing into a static canvas ----------
const WALLCOL = [7, 3, 4, 10, 2, 0, 8, 12, 5, 11, 1, 15, 9, 13, 14, 6];
const BADV = [[0, 9], [1, 9], [3, 9], [1, 11], [2, 11], [3, 11], [4, 11], [0, 9], [1, 9], [2, 9]];
const DIRTV = [[6, 9], [7, 9], [8, 9], [6, 11], [7, 11], [8, 11], [8, 10]];
const PAVEV = [[0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [1, 0], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4]];
const FLOORV = [[13, 0], [14, 0], [15, 0], [13, 1], [15, 1], [13, 2], [14, 2], [15, 2]];
function renderMapCanvas() {
  mapCanvas = document.createElement('canvas'); mapCanvas.width = MW * TS; mapCanvas.height = MH * TS;
  const g = mapCanvas.getContext('2d'); g.imageSmoothingEnabled = false;
  const tA = (sx, sy, x, y) => g.drawImage(I.tilesA, sx * 16, sy * 16, 16, 16, x * 16, y * 16, 16, 16);
  const tC = (sx, sy, x, y) => g.drawImage(I.tiles, sx * 16, sy * 16, 16, 16, x * 16, y * 16, 16, 16);
  const isT = (x, y, t) => inb(x, y) && grid[y][x] === t;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = grid[y][x], r = deco[y][x];
    if (t === T.BAD) { const v = BADV[r % BADV.length]; tA(v[0], v[1], x, y); }
    else if (t === T.DIRT) { const v = DIRTV[r % DIRTV.length]; tA(v[0], v[1], x, y); }
    else if (t === T.PAVE) { const v = (r % 100) < 70 ? PAVEV[r % 4] : PAVEV[4 + r % 9]; tA(v[0], v[1], x, y); }
    else if (t === T.FLOOR) { const v = FLOORV[r % FLOORV.length]; tA(v[0], v[1], x, y); }
    else if (t === T.ROAD || t === T.LOT) {
      g.fillStyle = '#10183f'; g.fillRect(x * 16, y * 16, 16, 16);
      g.fillStyle = '#0c1233';
      for (let i = 0; i < 5; i++) { const q = (r * (i + 3) * 7919) % 256; g.fillRect(x * 16 + (q % 16), y * 16 + (q >> 4), 1 + (i % 2), 1); }
    }
    else if (t === T.PAD) { tA(4 + (x - 33), 5 + (y - 3), x, y); }
    else if (t === T.WALL) { // floor under, then autotiled wall
      tA(13, 0, x, y);
      const m = (isT(x, y - 1, T.WALL) ? 1 : 0) | (isT(x + 1, y, T.WALL) ? 2 : 0) | (isT(x, y + 1, T.WALL) ? 4 : 0) | (isT(x - 1, y, T.WALL) ? 8 : 0);
      tC(WALLCOL[m], 2, x, y);
    }
  }
  // craters (badlands only)
  for (const [cx, cy, s] of craters) {
    if (s === 1) tA(4 + (cx % 2), 9, cx, cy);
    else if (s === 2) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tA(9 + dx, 9 + dy, cx + dx, cy + dy);
    else for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) tA(11 + dx, 9 + dy, cx + dx, cy + dy);
  }
  // road markings + curbs
  g.fillStyle = '#0f8892';
  for (let x = 0; x < MW; x++) if (isT(x, 14, T.ROAD) && isT(x, 15, T.ROAD) && !(x >= 17 && x <= 20)) { g.fillRect(x * 16 + 2, 15 * 16 - 1, 6, 2); g.fillRect(x * 16 + 10, 15 * 16 - 1, 4, 2); }
  for (let y = 0; y < MH; y++) if (isT(18, y, T.ROAD) && isT(19, y, T.ROAD) && !(y >= 13 && y <= 16)) { g.fillRect(19 * 16 - 1, y * 16 + 2, 2, 6); g.fillRect(19 * 16 - 1, y * 16 + 10, 2, 4); }
  // crosswalk stripes
  g.fillStyle = 'rgba(160,200,210,0.35)';
  for (let i = 0; i < 4; i++) { g.fillRect(16 * 16 + 4 + i * 0, 14 * 16 + 2 + i * 8, 1, 1); }
  for (const yy of [14, 15]) for (const xx of [17, 20]) if (isT(xx, yy, T.ROAD)) for (let i = 0; i < 4; i++) g.fillRect(xx * 16 + 2 + i * 4, yy * 16 + 2, 2, 12);
  for (const xx of [18, 19]) for (const yy of [13, 16]) if (isT(xx, yy, T.ROAD)) for (let i = 0; i < 4; i++) g.fillRect(xx * 16 + 2, yy * 16 + 2 + i * 4, 12, 2);
  // parking bays
  g.fillStyle = '#0f8892';
  for (let x = 21; x <= 27; x += 2) { g.fillRect(x * 16, 18 * 16 + 2, 1, 28); g.fillRect(x * 16, 23 * 16 + 2, 1, 28); }
  // curbs: pavement edge against road/lot
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = grid[y][x]; if (t !== T.ROAD && t !== T.LOT) continue;
    const px = x * 16, py = y * 16;
    const side = (nx, ny) => { const nt = inb(nx, ny) ? grid[ny][nx] : -1; return nt === T.PAVE || nt === T.FLOOR || nt === T.WALL; };
    if (side(x, y - 1)) { g.fillStyle = '#15c6a6'; g.fillRect(px, py, 16, 1); g.fillStyle = '#06226d'; g.fillRect(px, py + 1, 16, 2); }
    if (side(x, y + 1)) { g.fillStyle = '#1f6363'; g.fillRect(px, py + 14, 16, 2); g.fillStyle = '#15c6a6'; g.fillRect(px, py + 13, 16, 1); }
    if (side(x - 1, y)) { g.fillStyle = '#15c6a6'; g.fillRect(px, py, 1, 16); g.fillStyle = '#06226d'; g.fillRect(px + 1, py, 1, 16); }
    if (side(x + 1, y)) { g.fillStyle = '#1f6363'; g.fillRect(px + 15, py, 1, 16); g.fillStyle = '#15c6a6'; g.fillRect(px + 14, py, 1, 16); }
  }
}

// ---------- queries ----------
function walkable(x, y) { return inb(x, y) && grid[y][x] !== T.WALL && !objAt[y][x]; }
function flyable(x, y) { return inb(x, y); }
function blocksLOS(x, y) { return !inb(x, y) || grid[y][x] === T.WALL; }
// supercover line LOS between tile centers
function los(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), x = x0, y = y0;
  const sx = x1 > x0 ? 1 : -1, sy = y1 > y0 ? 1 : -1;
  let n = 1 + dx + dy, err = dx - dy; dx *= 2; dy *= 2;
  for (; n > 0; --n) {
    if (!(x === x0 && y === y0) && !(x === x1 && y === y1) && blocksLOS(x, y)) return false;
    if (err > 0) { x += sx; err -= dy; } else if (err < 0) { y += sy; err += dx; } else { // corner: block only if both sides block
      if (blocksLOS(x + sx, y) && blocksLOS(x, y + sy)) return false; x += sx; y += sy; err += dx - dy; n--; }
  }
  return true;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function mdist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

// cover a target at (tx,ty) gets from an attacker at (ax,ay): 0 none, 1 half, 2 full
function coverFrom(tx, ty, ax, ay) {
  let best = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = tx + dx, ny = ty + dy; if (!inb(nx, ny)) continue;
    let c = 0;
    if (grid[ny][nx] === T.WALL) c = 2;
    else if (objAt[ny][nx]) c = OBJ[objAt[ny][nx].type].cover;
    if (!c) continue;
    // attacker must be on the far side of this cover direction
    const vx = ax - tx, vy = ay - ty;
    const along = vx * dx + vy * dy;
    if (along <= 0) continue;
    // flank check: attacker roughly in front (within 60deg cone-ish)
    const perp = Math.abs(dx ? vy : vx);
    if (along >= perp * 0.5 || along >= 1) best = Math.max(best, c);
  }
  return best;
}
// best cover value at tile from any direction (for UI shields)
function coverDirs(x, y) {
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
    let c = 0; if (grid[ny][nx] === T.WALL) c = 2; else if (objAt[ny][nx]) c = OBJ[objAt[ny][nx].type].cover;
    if (c) out.push({ dx, dy, c });
  }
  return out;
}

// BFS reachable tiles: returns Map key->{x,y,d,prev}
function reach(unit, range, opts = {}) {
  const fly = unit.fly, res = new Map(), q = [[unit.x, unit.y]];
  const key = (x, y) => y * MW + x;
  res.set(key(unit.x, unit.y), { x: unit.x, y: unit.y, d: 0, prev: null });
  while (q.length) {
    const [x, y] = q.shift(); const cur = res.get(key(x, y));
    if (cur.d >= range) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
      const k = key(nx, ny); if (res.has(k)) continue;
      if (fly ? !flyable(nx, ny) : !walkable(nx, ny)) continue;
      const u = unitAt(nx, ny);
      if (u && u.side !== unit.side && !opts.ignoreUnits) continue;  // can't pass enemies
      if (u && u.big && u !== unit) continue;
      res.set(k, { x: nx, y: ny, d: cur.d + 1, prev: cur });
      q.push([nx, ny]);
    }
  }
  // remove occupied end tiles
  for (const [k, v] of res) { const u = unitAt(v.x, v.y); if (u && u !== unit) v.occupied = true; if (!fly ? false : (grid[v.y][v.x] === T.WALL || objAt[v.y][v.x])) v.occupied = true; }
  return res;
}
function pathTo(node) { const p = []; while (node) { p.unshift({ x: node.x, y: node.y }); node = node.prev; } return p; }
// unbounded distance field from a set of targets (for AI)
function distField(targets, fly) {
  const D = new Array(MW * MH).fill(1e9), q = [];
  for (const t of targets) { D[t.y * MW + t.x] = 0; q.push([t.x, t.y]); }
  while (q.length) {
    const [x, y] = q.shift(); const d = D[y * MW + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
      if (!(fly ? flyable(nx, ny) : walkable(nx, ny))) continue;
      const k = ny * MW + nx; if (D[k] <= d + 1) continue; D[k] = d + 1; q.push([nx, ny]);
    }
  }
  return D;
}
