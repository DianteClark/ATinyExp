'use strict';
// ============================================================
// UNITS: definitions, animation, drawing, effects
// ============================================================
const SOLDIER_ROWS = { idle: [0, 2, 3], walk: [1, 2, 9], crawl: [2, 2, 4], fire: [3, 2, 12], hit: [4, 3, 10], death: [5, 5, 9], throw: [6, 3, 10] };
const ROBOT_ROWS = { idle: [0, 2, 3], walk: [1, 4, 10], fire: [2, 2, 10], melee: [3, 5, 12], dead: [4, 1, 1] };

const SQUAD_DEFS = {
  reyes:  { name: 'Sgt. Reyes',  short: 'REYES',  img: 'leader',    hp: 7, mv: 5, aim: 72, dmg: [2, 3], range: 7,  shots: 1, gun: 'rifle',  voice: 'meghan', shape: 4, rank: 2, color: '#ffd23f', role: 'Squad Leader', perk: 'Leadership: allies within 4 tiles get +10 aim.' },
  okafor: { name: 'Cpl. Okafor', short: 'OKAFOR', img: 'gunner',    hp: 8, mv: 4, aim: 60, dmg: [1, 1], range: 6,  shots: 4, gun: 'mg',     voice: 'ian',    shape: 0, rank: 1, color: '#ff9a1a', role: 'Machine Gunner', perk: 'Burst: 4 rounds, 1 damage each.' },
  haas:   { name: 'Pvt. Haas',   short: 'HAAS',   img: 'grenadier', hp: 7, mv: 4, aim: 65, dmg: [2, 3], range: 6,  shots: 1, gun: 'rifle',  voice: 'sean',   shape: 2, rank: 1, color: '#3ee03e', role: 'Grenadier', perk: 'Grenades: 3 damage in a 3x3 area. Wrecks cover.', grenades: 2 },
  lin:    { name: 'Spc. Lin',    short: 'LIN',    img: 'sniper',    hp: 5, mv: 4, aim: 88, dmg: [4, 5], range: 12, shots: 1, gun: 'sniper', voice: 'karen',  shape: 3, rank: 1, color: '#5ad8ff', role: 'Sniper', perk: 'Steady: -25 aim if she moved this turn.' },
  vance:  { name: 'Pvt. Vance',  short: 'VANCE',  img: 'radio',     hp: 6, mv: 5, aim: 68, dmg: [1, 2], range: 5,  shots: 2, gun: 'mg',     voice: 'alex',   shape: 1, rank: 0, color: '#c58bff', role: 'Radio Operator', perk: 'Artillery: 6 damage in 3x3, lands next turn.', arty: 1 },
};
const ENEMY_DEFS = {
  spider:    { name: 'Spider',  img: 'spider', hp: 4, mv: 5, aim: 72, dmg: [2, 3], range: 1, melee: true, desc: 'Fast. Claws at close range.' },
  scarab:    { name: 'Scarab',  img: 'scarab', hp: 6, mv: 3, aim: 60, dmg: [2, 2], range: 6, desc: 'Armoured plasma gunner.' },
  hornet:    { name: 'Hornet',  img: 'hornet', hp: 4, mv: 6, aim: 55, dmg: [2, 2], range: 5, fly: true, big: false, desc: 'Flies over obstacles.' },
  wasp:      { name: 'Wasp',    img: 'wasp',   hp: 1, mv: 7, aim: 75, dmg: [1, 1], range: 1, melee: true, fly: true, desc: 'Tiny, fast, fragile.' },
  centipede: { name: 'Burrower', img: 'centipede', hp: 22, mv: 4, aim: 90, dmg: [4, 4], range: 1, melee: true, desc: 'Crushes cover in its path.', boss: true },
};

const units = [];
let uid = 0;
function makeSoldier(id, x, y) {
  const d = SQUAD_DEFS[id];
  const u = { id: uid++, key: id, side: 'player', ...d, maxhp: d.hp, x, y, ox: 0, oy: 0, flip: false, alive: true,
    moved: false, acted: false, overwatch: false, anim: { name: 'idle', t: Math.random() }, kills: 0, extracted: false };
  units.push(u); return u;
}
function makeEnemy(type, x, y, pod) {
  const d = ENEMY_DEFS[type];
  const u = { id: uid++, key: type, side: 'enemy', ...d, maxhp: d.hp, x, y, ox: 0, oy: 0, flip: true, alive: true, pod,
    active: false, anim: { name: 'idle', t: Math.random() }, alpha: 1 };
  if (type === 'centipede') { u.segs = []; for (let i = 0; i < 6; i++) u.segs.push({ x, y, dir: 4 }); u.big = true; }
  units.push(u); return u;
}
function unitAt(x, y) {
  for (const u of units) {
    if (!u.alive || u.extracted) continue;
    if (u.segs) { for (const s of u.segs) if (s.x === x && s.y === y) return u; }
    else if (u.x === x && u.y === y) return u;
  }
  return null;
}
function setAnim(u, name) { if (u.anim.name !== name) u.anim = { name, t: 0 }; }

function unitFrame(u) {
  const a = u.anim;
  if (u.side === 'player') {
    const [row, n, fps] = SOLDIER_ROWS[a.name];
    let f = Math.floor(a.t * fps);
    f = (a.name === 'idle' || a.name === 'walk' || a.name === 'crawl') ? f % n : Math.min(f, n - 1);
    return [f * 16, row * 16, 16, 16];
  }
  if (u.key === 'hornet') { const row = a.name === 'fire' ? 1 : 0; return [(Math.floor(a.t * 12) % 8) * 24, row * 24, 24, 24]; }
  if (u.key === 'wasp') return [(Math.floor(a.t * 14) % 8) * 16, 0, 16, 16];
  const [row, n, fps] = ROBOT_ROWS[a.name] || ROBOT_ROWS.idle;
  let f = Math.floor(a.t * fps);
  f = (a.name === 'idle' || a.name === 'walk') ? f % n : Math.min(f, n - 1);
  return [f * 16, row * 16, 16, 16];
}
function unitPx(u) { return [u.x * TS + u.ox, u.y * TS + u.oy]; }

// centipede: head rows 0-7, tail rows 8-15 (dir order E,NE,N,NW,W,SW,S,SE), body row 16
const DIR4 = { '1,0': 0, '0,-1': 2, '-1,0': 4, '0,1': 6 };
function drawCentipede(u, sx, sy) {
  const t = Math.floor(u.anim.t * 8) % 4;
  const seen = new Set();
  for (let i = u.segs.length - 1; i >= 0; i--) {
    const s = u.segs[i]; const k = s.x + ',' + s.y;
    if (i > 0 && seen.has(k)) continue; seen.add(k);
    const px = s.x * TS + (s.ox || 0) - sx, py = s.y * TS + (s.oy || 0) - sy - 2;
    if (i === 0) spr(I.centipede, t * 16, s.dir * 16, 16, 16, px, py, false, u.alpha);
    else if (i === u.segs.length - 1) spr(I.centipede, t * 16, (8 + s.dir) * 16, 16, 16, px, py, false, u.alpha);
    else spr(I.centipede, (s.dir) * 16, 16 * 16, 16, 16, px, py + 1, false, u.alpha);
  }
}

function drawUnit(u, sx, sy) {
  if (u.segs) return drawCentipede(u, sx, sy);
  const [px, py] = unitPx(u);
  const fr = unitFrame(u);
  const img = I[u.img];
  let dx = px - sx + (16 - fr[2]) / 2, dy = py - sy + (16 - fr[3]) - 1;
  if (u.fly) dy -= 4 + Math.sin(u.anim.t * 5 + u.id) * 1.5;
  if (u.hitFlash > 0) {
    spr(img, fr[0], fr[1], fr[2], fr[3], dx, dy, u.flip, u.alpha);
    ctx.globalCompositeOperation = 'lighter'; spr(img, fr[0], fr[1], fr[2], fr[3], dx, dy, u.flip, 0.6 * u.hitFlash); ctx.globalCompositeOperation = 'source-over';
  } else spr(img, fr[0], fr[1], fr[2], fr[3], dx, dy, u.flip, u.alpha);
}

// ---------- effects ----------
const FX = [];      // sprite animations
const PROJ = [];    // projectiles
const FLOAT = [];   // floating text
const PARTS = [];   // particles
const FXDEF = {
  bigexp: ['bigexp', 32, 11, 18], smallexp: ['smallexp', 24, 9, 18], bigfrag: ['bigfrag', 32, 6, 14], smallfrag: ['smallfrag', 24, 6, 14],
  impact: ['impact', 8, 5, 20], sparks: ['sparks', 8, 6, 22], spatter: ['spatter', 8, 6, 18], laser: ['laser', 16, 3, 18],
  muzzle: ['muzzle', 8, 4, 30], smoke: ['smoke', 8, 8, 10],
};
const LIGHTS = [];  // short-lived dynamic lights (muzzle flashes, explosions)
function light(x, y, r, life, color) { LIGHTS.push({ x, y, r, life, t: 0, color }); }
function fx(kind, x, y, opts = {}) {
  const [img, fw, n, fps] = FXDEF[kind];
  if (kind === 'muzzle') light(x, y, 30, 0.12, '255,210,120');
  else if (kind === 'laser') light(x, y, 26, 0.15, '255,70,70');
  else if (kind === 'smallexp') light(x, y, 56, 0.45, '255,150,60');
  else if (kind === 'bigexp') light(x, y, 90, 0.6, '255,170,70');
  FX.push({ img, fw, n, fps, x, y, t: 0, flip: opts.flip, delay: opts.delay || 0, row: opts.row || 0, off: opts.off || 0, alpha: opts.alpha });
}
function floatText(s, x, y, color = C.white, big) { FLOAT.push({ s, x, y, t: 0, color, big }); }
function particles(x, y, n, color, spd = 40, life = 0.6) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = spd * (0.3 + Math.random()); PARTS.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, t: 0, life: life * (0.6 + Math.random() * 0.8), color }); }
}
function updateFX(dt) {
  for (let i = FX.length - 1; i >= 0; i--) { const e = FX[i]; if (e.delay > 0) { e.delay -= dt; continue; } e.t += dt; if (e.t * e.fps >= e.n) FX.splice(i, 1); }
  for (let i = FLOAT.length - 1; i >= 0; i--) { const f = FLOAT[i]; f.t += dt; if (f.t > 1.3) FLOAT.splice(i, 1); }
  for (let i = LIGHTS.length - 1; i >= 0; i--) { const l = LIGHTS[i]; l.t += dt; if (l.t > l.life) LIGHTS.splice(i, 1); }
  for (let i = PARTS.length - 1; i >= 0; i--) { const p = PARTS[i]; p.t += dt; p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) PARTS.splice(i, 1); }
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const p = PROJ[i]; p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.x0 + (p.x1 - p.x0) * k; p.y = p.y0 + (p.y1 - p.y0) * k - (p.arc ? Math.sin(k * Math.PI) * p.arc : 0);
    if (k >= 1) { PROJ.splice(i, 1); p.done && p.done(); }
  }
}
function drawFX(sx, sy) {
  for (const p of PARTS) { ctx.fillStyle = p.color; ctx.globalAlpha = 1 - p.t / p.life; ctx.fillRect(Math.round(p.x - sx), Math.round(p.y - sy), 1, 1); }
  ctx.globalAlpha = 1;
  for (const e of FX) {
    if (e.delay > 0) continue;
    const f = Math.min(e.n - 1, Math.floor(e.t * e.fps)) + e.off;
    const h = I[e.img].height;
    spr(I[e.img], f * e.fw, 0, e.fw, h, e.x - sx - e.fw / 2, e.y - sy - h / 2, e.flip, e.alpha);
  }
  for (const p of PROJ) {
    if (p.kind === 'grenade') spr(I.grenade, (Math.floor(p.t * 20) % 8) * 8, 0, 8, 8, p.x - sx - 4, p.y - sy - 4);
    else if (p.kind === 'shell') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(Math.round(p.x - sx) - 1, Math.round(p.y - sy) - 3, 2, 6); }
    else {
      const fr = p.kind === 'plasma' ? 2 : 0;
      // streak
      const ang = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
      ctx.strokeStyle = p.kind === 'plasma' ? 'rgba(255,80,80,0.6)' : 'rgba(255,230,140,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(p.x - sx) + 0.5, Math.round(p.y - sy) + 0.5); ctx.lineTo(Math.round(p.x - sx - Math.cos(ang) * 6) + 0.5, Math.round(p.y - sy - Math.sin(ang) * 6) + 0.5); ctx.stroke();
      spr(I.bullets, fr * 8, 0, 8, 8, p.x - sx - 4, p.y - sy - 4);
    }
  }
  for (const f of FLOAT) {
    const y = f.y - sy - 12 - Math.min(f.t, 0.4) * 30 + (f.t > 0.9 ? (f.t - 0.9) * 10 : 0);
    if (f.t > 1.0 && Math.floor(f.t * 20) % 2) continue;
    if (/^[-+0-9%]+$/.test(f.s)) { const row = f.color === C.red ? 2 : f.color === C.green ? 1 : f.color === C.orange ? 4 : 0; num(f.s, f.x - sx - f.s.length * 3.5, y, row); }
    else textC(f.s, f.x - sx, y, f.color);
  }
}
function projectile(kind, x0, y0, x1, y1, speed = 380, arc = 0) {
  return new Promise(res => {
    const d = Math.hypot(x1 - x0, y1 - y0);
    PROJ.push({ kind, x0, y0, x1, y1, x: x0, y: y0, t: 0, dur: Math.max(0.05, d / speed), arc, done: res });
  });
}
