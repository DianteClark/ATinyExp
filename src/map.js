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
  cache:  { r: [65, 80, 14, 14], ax: 7, ay: 13, cover: 0, block: false },
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

// ---------- map builder: missions describe their layout with these calls ----------
// tag[y][x] remembers how a tile should be drawn (which road lane, which parking bay, which pad corner)
let tag = [], craters = [];
const MapB = {
  fill(t, x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) { grid[y][x] = t; tag[y][x] = null; } },
  // a walled building with a floor; gaps are [x, y] door/breach tiles
  building(x0, y0, x1, y1, gaps = []) {
    this.fill(T.FLOOR, x0 + 1, y0 + 1, x1 - 1, y1 - 1);
    for (let x = x0; x <= x1; x++) { grid[y0][x] = T.WALL; grid[y1][x] = T.WALL; }
    for (let y = y0; y <= y1; y++) { grid[y][x0] = T.WALL; grid[y][x1] = T.WALL; }
    for (const [gx, gy, t] of gaps) grid[gy][gx] = t === undefined ? T.FLOOR : t;
  },
  wall(x0, y0, x1, y1) { this.fill(T.WALL, x0, y0, x1, y1); },
  // two-lane roads: hroad rows y and y+1, vroad columns x and x+1
  hroad(y, x0, x1) { for (let x = x0; x <= x1; x++) for (const [dy, lane] of [[0, 'top'], [1, 'bottom']]) this._road(x, y + dy, lane, 'h'); },
  vroad(x, y0, y1) { for (let y = y0; y <= y1; y++) for (const [dx, lane] of [[0, 'left'], [1, 'right']]) this._road(x + dx, y, lane, 'v'); },
  _road(x, y, lane, axis) {
    if (!inb(x, y)) return;
    const prev = grid[y][x] === T.ROAD && tag[y][x];
    grid[y][x] = T.ROAD;
    tag[y][x] = prev && prev.axis !== axis ? { lane: 'cross', axis: 'x' } : { lane, axis };
  },
  // parking lot: w x h tiles of asphalt with pack parking bays from (x0, y0)
  lot(x0, y0, w, h) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inb(x, y)) { grid[y][x] = T.LOT; tag[y][x] = { lx: x - x0, ly: y - y0, w, h }; } },
  // 4x4 circular pad / plaza (pack tiles)
  pad(x0, y0) { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { grid[y0 + y][x0 + x] = T.PAD; tag[y0 + y][x0 + x] = { px: x, py: y }; } },
  crater(x, y, size) { craters.push([x, y, size]); },
  obj(type, x, y) { return placeObj(type, x, y); },
};
function buildMap(mission) {
  grid = []; deco = []; objAt = []; explored = []; tag = []; craters = []; objects.length = 0;
  for (let y = 0; y < MH; y++) {
    grid.push(new Array(MW).fill(T.BAD)); deco.push(new Array(MW).fill(0)); objAt.push(new Array(MW).fill(null));
    explored.push(new Array(MW).fill(false)); tag.push(new Array(MW).fill(null));
  }
  const rnd = mulberry(mission.seed || 7);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) deco[y][x] = Math.floor(rnd() * 1000);
  mission.build(MapB);
  renderMapCanvas();
}
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
    else if (t === T.ROAD) {
      // pack road tiles: lanes with curb + dashed centre line, plain asphalt where roads cross
      const k = tag[y][x] || { lane: 'cross' };
      const lane = { top: [10, 4], bottom: [11, 4], left: [12, 4], right: [13, 4], cross: [2, 7] }[k.lane];
      tC(lane[0], lane[1], x, y);
    }
    else if (t === T.LOT) {
      // parking bays from the pack: 2x4 bays on top, 2x2 bays below, asphalt elsewhere
      const k = tag[y][x] || { lx: 99, ly: 99 }, lx = k.lx, ly = k.ly, bw = (k.w || 7) - ((k.w || 7) % 2);
      if (lx < bw && ly < 4) tA(8 + (lx % 2), 5 + ly, x, y);
      else if (lx < bw && ly >= 4 && ly < 6) tA(10 + (lx % 2), 5 + (ly - 4), x, y);
      else tC(2, 7, x, y);
    }
    else if (t === T.PAD) { const k = tag[y][x] || { px: 0, py: 0 }; tA(4 + k.px, 5 + k.py, x, y); }
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
}

// ---------- queries ----------
function walkable(x, y) { return inb(x, y) && grid[y][x] !== T.WALL && (!objAt[y][x] || !OBJ[objAt[y][x].type].block); }
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
  for (const [k, v] of res) { const u = unitAt(v.x, v.y); if (u && u !== unit) v.occupied = true; if (fly && (grid[v.y][v.x] === T.WALL || (objAt[v.y][v.x] && OBJ[objAt[v.y][v.x].type].block))) v.occupied = true; }
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
