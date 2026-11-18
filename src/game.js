'use strict';
// ============================================================
// GAME: state, turns, combat, AI, mission script
// ============================================================
const G = {
  state: 'loading', turn: 1, phase: 'find', busy: false, sel: null, mode: 'move', hover: null,
  reachMap: null, holdTurns: -1, holdEnemyTurns: 0, dropship: null, artyQueue: [], vis: null,
  stats: { kills: 0, shots: 0, hits: 0 }, flags: {}, banner: null, objective: '', tip: null, bubbles: [],
  centipede: null, time: 0, msgs: [],
};
let gt = 0;               // game clock
const timers = [];
function sleep(s) { return new Promise(res => timers.push({ t: gt + s, res })); }
function pause(s) { return skipping ? Promise.resolve() : sleep(s); }
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
const soldiers = () => units.filter(u => u.side === 'player' && u.alive && !u.extracted && !u.downed);
const downedList = () => units.filter(u => u.side === 'player' && u.alive && u.downed);
const enemies = () => units.filter(u => u.side === 'enemy' && u.alive);
const byKey = k => units.find(u => u.key === k);

// ---------------- setup ----------------
function newGame() {
  units.length = 0; objects.length = 0; LIGHTS.length = 0; FX.length = 0; PROJ.length = 0; FLOAT.length = 0; PARTS.length = 0;
  Object.assign(G, { turn: 1, phase: 'find', busy: false, sel: null, mode: 'move', reachMap: null, holdTurns: -1, holdEnemyTurns: 0,
    dropship: null, wash: null, artyQueue: [], stats: { kills: 0, shots: 0, hits: 0 }, flags: {}, banner: null, tip: null, bubbles: [], centipede: null, msgs: [], scrap: 0, earned: null, lastDialog: null, dialogGap: 0 });
  buildMap();
  makeSoldier('reyes', 3, 20); makeSoldier('okafor', 2, 21); makeSoldier('haas', 4, 21); makeSoldier('lin', 3, 22);
  const v = makeSoldier('vance', 6, 4); v.side = 'npc'; setAnim(v, 'crawl');
  // dormant pods
  makeEnemy('spider', 14, 19, 'A'); makeEnemy('spider', 15, 23, 'A');
  makeEnemy('scarab', 21, 12, 'B'); makeEnemy('spider', 17, 11, 'B');
  makeEnemy('spider', 12, 6, 'C');
  makeEnemy('scarab', 23, 6, 'D'); makeEnemy('scarab', 25, 8, 'D'); makeEnemy('spider', 22, 4, 'D');
  makeEnemy('scarab', 33, 10, 'E');
  for (const [x, y] of [[4, 4], [26, 8], [25, 22], [38, 18]]) placeObj('cache', x, y);
  computeVis(true);
  camTo(5 * TS, 19 * TS, true);
  G.objective = 'Find Pvt. Vance in the Halvorsen office (north).';
}

// ---------------- visibility ----------------
const SIGHT = 8;
function computeVis(silent) {
  const vis = []; for (let y = 0; y < MH; y++) vis.push(new Array(MW).fill(false));
  for (const s of soldiers()) {
    if (s.side !== 'player') continue;
    for (let y = Math.max(0, s.y - SIGHT); y <= Math.min(MH - 1, s.y + SIGHT); y++)
      for (let x = Math.max(0, s.x - SIGHT); x <= Math.min(MW - 1, s.x + SIGHT); x++) {
        if (vis[y][x]) continue;
        if ((x - s.x) ** 2 + (y - s.y) ** 2 > SIGHT * SIGHT + 2) continue;
        if (los(s.x, s.y, x, y)) { vis[y][x] = true; explored[y][x] = true; }
      }
  }
  G.vis = vis;
  const spotted = [];
  for (const e of enemies()) {
    const seen = e.segs ? e.segs.some(s => vis[s.y][s.x]) : vis[e.y][e.x];
    if (seen && !e.active) {
      for (const o of enemies()) if (o.pod === e.pod && !o.active) { o.active = true; o.alertT = 1.5; }
      spotted.push(e);
    }
    e.visible = seen;
  }
  const v = byKey('vance'); if (v) v.visible = vis[v.y][v.x];
  return spotted;
}
function isVisible(u) { return u.side === 'player' || u.visible; }

// ---------------- movement ----------------
async function moveUnit(u, path, opts = {}) {
  const speed = u.side === 'player' ? 0.12 : (u.visible ? 0.1 : 0.03);
  setAnim(u, 'walk');
  for (let i = 1; i < path.length; i++) {
    if (!u.alive) return;
    const a = path[i - 1], b = path[i];
    if (b.x !== a.x) u.flip = b.x < a.x;
    const steps = 6;
    if (u.side === 'player' && i % 2 === 1) Audio2.play('step' + rint(1, 4), 0.35, 0.9 + Math.random() * 0.2);
    if (u.side === 'enemy' && u.visible && (u.key === 'spider' || u.key === 'scarab') && i % 2 === 1) Audio2.play('tap', 0.18, 1.6 + Math.random() * 0.3);
    for (let k = 1; k <= steps; k++) { u.ox = (b.x - a.x) * TS * k / steps; u.oy = (b.y - a.y) * TS * k / steps; await sleep(speed / steps); }
    u.x = b.x; u.y = b.y; u.ox = 0; u.oy = 0;
    if (u.side === 'player') {
      const sp = computeVis();
      if (sp.length) await onSpotted(sp, u);
    } else {
      const wasVis = u.visible; computeVis(); if (u.visible && !wasVis && G.state === 'enemy') camTo(u.x * TS + 8, u.y * TS + 8);
      if (u.visible && G.state === 'enemy') cam.follow = { x: u.x * TS + 8, y: u.y * TS + 8 };
      if (await overwatchCheck(u)) { if (!u.alive) return; }
    }
  }
  setAnim(u, u.overwatch ? 'crawl' : 'idle');
}

async function moveCentipede(u, path) {
  for (let i = 1; i < path.length; i++) {
    if (!u.alive) return;
    const b = path[i], h = u.segs[0];
    const dx = b.x - h.x, dy = b.y - h.y;
    // crush cover on the way
    const o = objAt[b.y][b.x];
    if (o) { await crushObject(o); }
    const prev = u.segs.map(s => ({ x: s.x, y: s.y, dir: s.dir }));
    const steps = 6;
    for (let k = 1; k <= steps; k++) {
      for (let j = 0; j < u.segs.length; j++) {
        const from = prev[j], to = j === 0 ? b : prev[j - 1];
        u.segs[j].ox = (to.x - from.x) * TS * k / steps; u.segs[j].oy = (to.y - from.y) * TS * k / steps;
      }
      await sleep(0.11 / steps);
    }
    for (let j = u.segs.length - 1; j >= 0; j--) {
      const to = j === 0 ? { x: b.x, y: b.y } : prev[j - 1];
      const from = prev[j];
      const ddx = to.x - from.x, ddy = to.y - from.y;
      u.segs[j].x = to.x; u.segs[j].y = to.y; u.segs[j].ox = 0; u.segs[j].oy = 0;
      if (ddx || ddy) u.segs[j].dir = DIR4[ddx + ',' + ddy];
    }
    u.segs[0].dir = DIR4[dx + ',' + dy];
    u.x = u.segs[0].x; u.y = u.segs[0].y;
    if (i % 2) { Audio2.play('dirt', 0.4, 0.7); cam.shake = Math.max(cam.shake, 1.5); }
    particles(b.x * TS + 8, b.y * TS + 12, 4, '#1f6363', 30);
    computeVis(); cam.follow = { x: u.x * TS + 8, y: u.y * TS + 8 };
    if (await overwatchCheck(u)) { if (!u.alive) return; }
  }
}
async function crushObject(o) {
  const d = OBJ[o.type];
  Audio2.play('heavy', 0.7); Audio2.play('clatter', 0.4);
  fx('smallfrag', o.x * TS + 8 * o.w, o.y * TS + 8 * o.h);
  removeObj(o);
  if (d.explosive) await explode(o.x, o.y, 1, 3, 'barrel');
}

// ---------------- combat ----------------
function hitChance(att, tgt, ax = att.x, ay = att.y, overwatch = false) {
  let c = att.aim;
  const notes = [];
  if (att.key === 'lin' && att.moved && !overwatch) { c -= 25; notes.push('MOVED -25'); }
  if (att.side === 'player' && att.key !== 'reyes') {
    const r = byKey('reyes'); if (r && r.alive && !r.extracted && r.side === 'player' && dist(r, { x: ax, y: ay }) <= 4) { c += 10; notes.push('LEADER +10'); }
  }
  let tx = tgt.x, ty = tgt.y;
  if (tgt.segs) { let best = 1e9; for (const s of tgt.segs) { const d = (s.x - ax) ** 2 + (s.y - ay) ** 2; if (d < best) { best = d; tx = s.x; ty = s.y; } } }
  const cov = (tgt.fly || tgt.segs || tgt.isObj) ? 0 : coverFrom(tx, ty, ax, ay);
  if (cov === 1) { c -= 20; notes.push('HALF COVER -20'); }
  if (cov === 2) { c -= 40; notes.push('FULL COVER -40'); }
  const d = Math.hypot(tx - ax, ty - ay);
  if (att.gun === 'sniper') { if (d < 3) { c -= 10; notes.push('TOO CLOSE -10'); } }
  else if (d > 5) { const p = Math.round((d - 5) * 3); c -= p; notes.push('RANGE -' + p); }
  if (d <= 1.5 && !att.melee) { c += 10; notes.push('POINT BLANK +10'); }
  if (overwatch) { c -= 15; notes.push('OVERWATCH -15'); }
  if (tgt.isObj) c = Math.max(c, 85);
  return { chance: Math.max(5, Math.min(95, Math.round(c))), cover: cov, notes, tx, ty };
}
function canTarget(att, tgt, ax = att.x, ay = att.y) {
  if (!tgt.alive) return false;
  const cells = tgt.segs ? tgt.segs : [tgt];
  for (const s of cells) {
    const d = Math.hypot(s.x - ax, s.y - ay);
    if (att.melee ? (Math.abs(s.x - ax) + Math.abs(s.y - ay) === 1) : (d <= att.range + 0.01 && los(ax, ay, s.x, s.y))) return true;
  }
  return false;
}
function centerOf(u) { const [px, py] = unitPx(u); return [px + 8, py + 8 - (u.fly ? 4 : 0)]; }

async function attack(att, tgt, opts = {}) {
  const hc = hitChance(att, tgt, att.x, att.y, opts.overwatch);
  const [ax, ay] = centerOf(att);
  const tcx = hc.tx * TS + 8, tcy = hc.ty * TS + 8 - (tgt.fly ? 4 : 0);
  att.flip = tcx < ax;
  if (att.side === 'player') G.stats.shots++;
  if (att.melee) {
    setAnim(att, att.key === 'wasp' ? 'idle' : 'melee');
    Audio2.play('swipe', 0.6, 1.1);
    const sx0 = att.x, sy0 = att.y;
    // lunge
    for (let k = 0; k < 4; k++) { att.ox = (tgt.x - sx0) * 4 * (k + 1) / 4; att.oy = (tgt.y - sy0) * 4 * (k + 1) / 4; await sleep(0.03); }
    await sleep(0.12);
    const hit = Math.random() * 100 < hc.chance;
    if (hit) { Audio2.play('crunch', 0.7); await applyDamage(tgt, rint(att.dmg[0], att.dmg[1]), att); }
    else { floatText('MISS', tcx, tcy, C.grey); Audio2.play('whoosh', 0.4, 1.4); }
    for (let k = 3; k >= 0; k--) { att.ox = (tgt.x - sx0) * 4 * k / 4; att.oy = (tgt.y - sy0) * 4 * k / 4; await sleep(0.03); }
    await sleep(0.2); setAnim(att, 'idle');
    return hit;
  }
  const shots = att.shots || 1;
  let anyHit = false;
  for (let s = 0; s < shots; s++) {
    if (!tgt.alive) break;
    setAnim(att, 'fire'); att.anim.t = 0;
    const mx = ax + (att.flip ? -8 : 8), my = ay + (att.side === 'player' ? 1 : 0);
    if (att.side === 'player') { fx('muzzle', mx, my, { flip: att.flip }); Audio2.gun(att.gun, 0.9); Audio2.play('shot', 0.5, att.gun === 'sniper' ? 0.7 : 1.1); }
    else { fx('laser', mx, my - 2, { flip: att.flip }); Audio2.plasma(); }
    const hit = Math.random() * 100 < hc.chance;
    let ex = tcx, ey = tcy;
    if (!hit) { const a = Math.random() * Math.PI * 2; ex += Math.cos(a) * rint(8, 14); ey += Math.sin(a) * rint(8, 14); }
    const kind = att.side === 'player' ? 'bullet' : 'plasma';
    await projectile(kind, mx, my, ex, ey, att.gun === 'sniper' ? 900 : 420);
    if (hit) {
      anyHit = true;
      if (att.side === 'player') G.stats.hits++;
      if (tgt.isObj) { await hitObject(tgt.obj); }
      else {
        const dmg = rint(att.dmg[0], att.dmg[1]);
        await applyDamage(tgt, dmg, att, shots > 1);
      }
    } else {
      fx('impact', ex, ey, { off: Math.random() < 0.5 ? 0 : 5 });
      Audio2.play('tap', 0.25, 1.5);
      if (s === shots - 1 || shots === 1) floatText('MISS', tcx, tcy - (shots > 1 ? s * 3 : 0), C.grey);
    }
    await sleep(shots > 1 ? 0.07 : 0.25);
  }
  setAnim(att, att.overwatch ? 'crawl' : 'idle');
  if (tgt.alive && tgt.side === 'player') setAnim(tgt, tgt.overwatch ? 'crawl' : 'idle');
  await sleep(0.25);
  return anyHit;
}

async function hitObject(o) {
  const d = OBJ[o.type];
  fx('impact', o.x * TS + 8, o.y * TS + 8);
  if (d.explosive) { removeObj(o); await explode(o.x, o.y, 1, 3, 'barrel'); }
}

async function applyDamage(u, dmg, src, quiet) {
  if (!u.alive || u.downed) return;
  u.hp -= dmg;
  const [cx, cy] = centerOf(u);
  floatText('-' + dmg, cx, cy, C.red);
  u.hitFlash = 1;
  if (u.side === 'enemy' || u.segs) {
    fx('sparks', cx + rint(-3, 3), cy + rint(-3, 3)); Audio2.play('clang', 0.35, 1 + Math.random() * 0.4);
    if (!u.active) { for (const o of enemies()) if (o.pod === u.pod) o.active = true; }
  } else {
    fx('spatter', cx, cy); Audio2.play('splat', 0.35);
    if (u.hp > 0) { setAnim(u, 'hit'); Audio2.voice(u.voice, u.hp <= 2 ? 'low' : 'dmg', true); }
    cam.shake = Math.max(cam.shake, 2); buzz(20);
  }
  if (u.hp <= 0) await killUnit(u, src);
  else if (u.side !== 'enemy' && !quiet) { await sleep(0.3); if (u.alive) setAnim(u, u.overwatch ? 'crawl' : 'idle'); }
}

async function killUnit(u, src) {
  if (u.side === 'player') return downUnit(u);
  u.alive = false; u.hp = 0; u.overwatch = false;
  if (u.side === 'enemy') {
    G.stats.kills++; if (src && src.side === 'player') { src.kills++; G.slowmo = 0.35; buzz(25); }
    const val = SCRAP_FOR[u.key] || 0;
    if (val) { G.scrap += val; const [qx, qy] = centerOf(u); setTimeout(() => floatText('+' + val, qx, qy - 6, C.yellow), 350); }
    if (u.segs) { return centipedeDeath(u); }
    const [cx, cy] = centerOf(u);
    fx('smallexp', cx, cy - 2); Audio2.play('expS', 0.5);
    particles(cx, cy, 10, '#ff9a1a', 50);
    u.corpse = true; u.alive = false;
    if (!G.flags.firstKill && src && src.side === 'player') { G.flags.firstKill = true; bubble(src, ['Scrap metal!', 'Got one!', 'Down!'][rint(0, 2)]); }
    else if (src && src.side === 'player' && Math.random() < 0.35) bubble(src, ['Target down.', 'Next!', 'Clear!', 'Bug splat.'][rint(0, 3)]);
  }
  await sleep(0.4);
}

const SCRAP_FOR = { spider: 5, scarab: 8, hornet: 6, wasp: 2, centipede: 50 };
async function downUnit(u) {
  u.downed = true; u.hp = 0; u.bleed = 3; u.overwatch = false; u.acted = true;
  setAnim(u, 'death');
  Audio2.voice(u.voice, 'death', true); buzz([30, 40, 60]);
  const others = soldiers();
  if (others.length) bubble(others[rint(0, others.length - 1)], u.key === 'reyes' ? 'Sarge is down! Get to her!' : u.short.charAt(0) + u.short.slice(1).toLowerCase() + ' is down!');
  message(u.name + ' is down! Revive within 3 turns.', C.red);
  if (G.sel === u) { G.sel = null; G.reachMap = null; }
  if (!G.flags.reviveTip) { G.flags.reviveTip = true; showTip('A downed soldier bleeds out in 3 turns. Move a squadmate next to them, then tap the downed soldier to revive them with 3 HP. Reviving uses that squadmate\'s action.'); }
  await sleep(0.4);
}
async function playerRevive(s, u) {
  G.busy = true; G.reachMap = null; s.acted = true; s.overwatch = false;
  s.flip = u.x < s.x; setAnim(s, 'crawl');
  Audio2.play('equip', 0.5); bubble(s, ['Stay with me!', 'Up you get!', 'Not today.'][rint(0, 2)], 1.6);
  for (let i = 0; i < 6; i++) { particles(u.x * TS + 8, u.y * TS + 10, 3, '#3ee03e', 30, 0.6); await sleep(0.1); }
  u.downed = false; u.hp = 3; u.bleed = 0; u.acted = true; u.moved = true;
  setAnim(u, 'idle'); setAnim(s, 'idle');
  floatText('+3', u.x * TS + 8, u.y * TS + 4, C.green); Audio2.play('chime', 0.5);
  setTimeout(() => Audio2.voice(u.voice, 'ready', true), 300);
  message(u.name + ' is back on their feet.', C.green);
  computeVis();
  G.busy = false;
  afterAction();
}
// who can speak: Overwatch always; soldiers only when up (Vance only once found)
function canSpeak(k) {
  if (k === 'overwatch') return true;
  const u = byKey(k); return !!(u && u.alive && !u.downed && (u.side === 'player' || (k === 'vance' && G.phase !== 'find')));
}
function line(who, text) {
  const list = Array.isArray(who) ? who : [who];
  const k = list.find(canSpeak);
  return k ? say(k, text) : Promise.resolve();
}
const SQUAD_ORDER = ['reyes', 'okafor', 'haas', 'lin', 'vance'];
const anyBut = (...first) => [...first, ...SQUAD_ORDER.filter(k => !first.includes(k))];

async function centipedeDeath(u) {
  G.flags.burrowerKilled = true;
  Music.play('battle');
  for (let i = 0; i < u.segs.length; i++) {
    const s = u.segs[i]; fx(i === 0 ? 'bigexp' : 'smallexp', s.x * TS + 8, s.y * TS + 6); Audio2.play(i === 0 ? 'expL' : 'expM', 0.6);
    cam.shake = 4; particles(s.x * TS + 8, s.y * TS + 8, 8, '#ffb0b0', 60);
    await sleep(0.18);
  }
  u.corpse = true;
  await line(anyBut('lin'), 'It\'s down. The big one is DOWN.');
  await line(anyBut('okafor').filter(k => k !== 'lin'), 'Somebody owes me a drink.');
}

// explosions: grenades, barrels, artillery
async function explode(cx, cy, r, dmg, kind, src) {
  const big = kind === 'arty';
  fx(big ? 'bigexp' : 'smallexp', cx * TS + 8, cy * TS + 6);
  if (big) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fx('smallexp', (cx + dx) * TS + 8, (cy + dy) * TS + 6, { delay: Math.random() * 0.2 });
  fx(big ? 'bigfrag' : 'smallfrag', cx * TS + 8, cy * TS + 6, { delay: 0.05 });
  Audio2.play(big ? 'expL' : 'expM', big ? 0.9 : 0.7, 0.9 + Math.random() * 0.2);
  Audio2.play('bricks', 0.25);
  cam.shake = big ? 6 : 4; G.flash = big ? 0.22 : 0.12; buzz(big ? [40, 30, 60] : 35);
  particles(cx * TS + 8, cy * TS + 8, big ? 30 : 16, '#ffd23f', 70);
  for (let i = 0; i < 4; i++) fx('smoke', cx * TS + 8 + rint(-10, 10), cy * TS + 4 + rint(-8, 4), { delay: 0.2 + i * 0.08 });
  await sleep(0.15);
  const hitUnits = new Set(), chain = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inb(x, y)) continue;
    const u = unitAt(x, y); if (u && !hitUnits.has(u)) hitUnits.add(u);
    const o = objAt[y][x];
    if (o && o.alive) {
      const d = OBJ[o.type];
      if (d.explosive) { removeObj(o); chain.push(o); }
      else if (d.debris) { removeObj(o); fx('smallfrag', o.x * TS + 8, o.y * TS + 8); }
      else if (d.wreck && (big || kind === 'grenade')) { removeObj(o); placeObj(d.wreck, o.x, o.y); }
    }
  }
  // wake nearby pods
  for (const e of enemies()) if (!e.active && Math.hypot(e.x - cx, e.y - cy) < 7) { for (const o of enemies()) if (o.pod === e.pod) o.active = true; }
  for (const u of hitUnits) await applyDamage(u, dmg, src, true);
  for (const u of hitUnits) if (u.alive && u.side !== 'enemy') setAnim(u, 'idle');
  for (const o of chain) { await sleep(0.15); await explode(o.x, o.y, 1, 3, 'barrel', src); }
  computeVis();
}

async function throwGrenade(u, tx, ty) {
  u.acted = true; u.grenades--;
  u.flip = tx < u.x;
  setAnim(u, 'throw'); Audio2.play('throw', 0.5); Audio2.voice(u.voice, 'grunt');
  await sleep(0.2);
  const [ax, ay] = centerOf(u);
  await projectile('grenade', ax, ay - 4, tx * TS + 8, ty * TS + 8, 220, 28);
  Audio2.play('dirt', 0.3);
  await sleep(0.15);
  await explode(tx, ty, 1, 3, 'grenade', u);
  setAnim(u, 'idle');
}

async function callArtillery(u, tx, ty) {
  u.acted = true; u.arty--;
  setAnim(u, 'crawl');
  Audio2.play('static', 0.4); Audio2.voice(u.voice, 'count', true);
  bubble(u, 'Fire mission, grid ' + (tx + 10) + '-' + (ty + 40) + '!');
  G.artyQueue.push({ x: tx, y: ty, src: u });
  message('Artillery inbound. Lands at the start of your next turn.', C.orange);
  await sleep(0.6); setAnim(u, 'idle');
}

// overwatch reaction fire against a moving enemy
async function overwatchCheck(e) {
  let fired = false;
  for (const s of soldiers()) {
    if (!s.overwatch || !e.alive || s.side !== 'player') continue;
    if (!e.visible) continue;
    if (!canTarget(s, e)) continue;
    s.overwatch = false; fired = true;
    floatText('OVERWATCH', s.x * TS + 8, s.y * TS - 2, C.yellow);
    camTo(e.x * TS + 8, e.y * TS + 8);
    await sleep(0.2);
    await attack(s, e, { overwatch: true });
    setAnim(s, 'idle');
    if (!e.alive) break;
  }
  return fired;
}

// ---------------- spotting / barks ----------------
async function onSpotted(list, spotter) {
  const types = new Set(list.map(e => e.key));
  Audio2.voice(spotter.voice, 'spot', true);
  for (const e of list) e.alertT = 1.5;
  Audio2.play('warning', 0.3, 1.3);
  if (G.state !== 'player') return;
  const wasBusy = G.busy; G.busy = true;
  camTo(list[0].x * TS + 8, list[0].y * TS + 8);
  await sleep(0.5);
  if (!G.flags.firstContact) {
    G.flags.firstContact = true;
    await say(spotter.key, types.has('spider') ? 'Contact! Spiders! They close fast. Keep something solid at your back.' : 'Contact! Bugs ahead!');
    await line(anyBut('reyes').filter(k => k !== spotter.key), 'Weapons free, Kestrel. Make every shot count.');
    showTip((COARSE ? 'Tap a red-bracketed enemy to see your odds, tap again to fire.' : 'Click a red-bracketed enemy to fire.') + ' Cover lowers your odds: half cover -20, full cover -40.');
  } else if (types.has('scarab') && !G.flags.scarab) {
    G.flags.scarab = true;
    await line(anyBut('okafor'), 'Scarab. Plasma cannon, thick shell. Don\'t stand in the open.');
  } else if (types.has('hornet') && !G.flags.hornet) {
    G.flags.hornet = true;
    await line(anyBut('lin'), 'Hornets! Flyers go right over the cars. Shoot them out of the sky.');
  }
  G.busy = wasBusy;
}

function bubble(u, s, dur = 2.2) { G.bubbles.push({ u, s, t: 0, dur }); }
function message(s, color = C.white) { G.msgs.push({ s, color, t: 0 }); if (G.msgs.length > 4) G.msgs.shift(); }
function showTip(s) { if (COARSE) s = s.replace(/Click/g, 'Tap').replace(/click/g, 'tap'); G.tip = { s, t: 0 }; }

// ---------------- player actions ----------------
function selectUnit(u, quiet) {
  if (!u || u.side !== 'player' || !u.alive || u.extracted || u.downed) return;
  G.armed = null;
  G.sel = u; G.mode = 'move';
  G.reachMap = (!u.moved && !u.acted) ? reach(u, u.mv) : null;
  if (!quiet) { Audio2.play('select', 0.4); if (Math.random() < 0.6) Audio2.voice(u.voice, 'sel'); }
  camTo(u.x * TS + 8, u.y * TS + 8);
}
function hasActions(u) { return u.alive && !u.extracted && !u.acted && !u.downed; }
function nextSoldier(fromCurrent) {
  const list = soldiers().filter(hasActions);
  if (!list.length) { G.sel = null; G.reachMap = null; return; }
  let i = fromCurrent && G.sel ? list.indexOf(G.sel) : -1;
  selectUnit(list[(i + 1) % list.length]);
}

async function playerMove(u, node) {
  G.busy = true;
  Audio2.play('confirm', 0.35); if (Math.random() < 0.6) Audio2.voice(u.voice, 'go');
  u.overwatch = false;
  const path = pathTo(node);
  G.reachMap = null;
  await moveUnit(u, path);
  u.moved = true;
  await checkTriggers(u);
  G.busy = false;
  if (G.state === 'player' && u.alive && !u.extracted && G.sel === u) selectUnit(u, true);
  autoEnd();
}
async function playerAttack(u, tgt) {
  G.busy = true; u.acted = true; G.reachMap = null; u.overwatch = false;
  if (u.gun === 'mg') Audio2.voice(u.voice, 'grunt');
  await attack(u, tgt);
  await checkTriggers(u);
  G.busy = false;
  afterAction();
}
async function playerAbility(u, tx, ty) {
  G.busy = true; G.reachMap = null; u.overwatch = false;
  if (G.mode === 'grenade') await throwGrenade(u, tx, ty);
  else if (G.mode === 'arty') await callArtillery(u, tx, ty);
  G.mode = 'move';
  await checkTriggers(u);
  G.busy = false;
  afterAction();
}
function setOverwatch(u) {
  u.acted = true; u.overwatch = true; G.reachMap = null; setAnim(u, 'crawl');
  Audio2.play('equip', 0.5); floatText('OVERWATCH', u.x * TS + 8, u.y * TS, C.yellow);
  afterAction();
}
function afterAction() {
  if (G.state !== 'player') return;
  if (G.sel && !hasActions(G.sel)) nextSoldier(true);
  autoEnd();
}
function autoEnd() {
  if (G.state !== 'player') return;
  if (soldiers().length && soldiers().every(u => !hasActions(u))) { G.autoEndT = 0.6; }
}

// ---------------- turn flow ----------------
async function startPlayerTurn() {
  G.state = 'banner'; G.busy = true;
  for (const u of downedList()) if (u.bleed <= 0) {
    camTo(u.x * TS + 8, u.y * TS + 8); await sleep(0.5);
    u.alive = false; u.dead = true; u.downed = false;
    message(u.name + ' didn\'t make it.', C.red); Audio2.play('lose', 0.35, 1.2);
    floatText('KIA', u.x * TS + 8, u.y * TS, C.red);
    await sleep(0.8);
  }
  for (const u of soldiers()) { u.moved = false; u.acted = false; if (!u.overwatch) setAnim(u, 'idle'); }
  // pending artillery
  if (G.artyQueue.length) {
    for (const a of G.artyQueue) {
      camTo(a.x * TS + 8, a.y * TS + 8); await sleep(0.4);
      Audio2.play('whoosh', 0.6, 0.6);
      await projectile('shell', a.x * TS + 8, a.y * TS - 140, a.x * TS + 8, a.y * TS + 8, 500);
      await explode(a.x, a.y, 1, 6, 'arty', a.src);
      await sleep(0.4);
    }
    G.artyQueue = [];
  }
  await bannerShow('PLAYER PHASE', C.cyan, 'Turn ' + G.turn, false, 1.1);
  if (G.phase === 'hold') {
    G.holdTurns--;
    if (G.holdTurns <= 0) { await dropshipArrives(); return; }
  }
  if (await checkEnd()) return;
  G.state = 'player'; G.busy = false;
  const first = soldiers().find(hasActions);
  if (first) selectUnit(first, true);
}

async function endPlayerTurn() {
  if (G.state !== 'player' || G.busy) return;
  G.busy = true; G.sel = null; G.reachMap = null; G.mode = 'move'; G.armed = null;
  if (mouse.touch) G.hover = null;
  for (const u of downedList()) u.bleed--;
  Audio2.play('selbig', 0.4);
  await enemyTurn();
}

async function enemyTurn() {
  G.state = 'enemy';
  const act = enemies().filter(e => e.active);
  await bannerShow('ENEMY PHASE', C.red, act.length ? act.length + ' hostiles active' : '', false, 1.1);
  let attackedBark = false;
  const order = act.sort((a, b) => nearestSoldierDist(a) - nearestSoldierDist(b));
  for (const e of order) {
    if (!e.alive || !soldiers().length) continue;
    const hpBefore = soldiers().reduce((s, u) => s + u.hp, 0);
    await enemyAct(e);
    const hpAfter = soldiers().reduce((s, u) => s + u.hp, 0);
    if (hpAfter < hpBefore && !attackedBark) { attackedBark = true; const v = soldiers()[rint(0, soldiers().length - 1)]; if (v) setTimeout(() => Audio2.voice(v.voice, 'attacked'), 400); }
    if (await checkEnd()) return;
  }
  await missionEnemyPhaseEnd();
  if (await checkEnd()) return;
  G.turn++;
  await startPlayerTurn();
}
function nearestSoldierDist(e) { let b = 1e9; for (const s of soldiers()) b = Math.min(b, mdist(e, s)); return b; }

async function enemyAct(e) {
  if (e.segs) return centipedeAct(e);
  const targets = soldiers();
  if (!targets.length) return;
  if (e.visible) { camTo(e.x * TS + 8, e.y * TS + 8); await sleep(0.25); }
  const rm = reach(e, e.mv);
  let best = null, bestScore = -1e9;
  if (e.melee) {
    for (const [, n] of rm) {
      if (n.occupied) continue;
      for (const t of targets) {
        if (mdist(n, t) !== 1) continue;
        const score = 100 - t.hp * 5 - n.d + (t.overwatch ? -5 : 0) + Math.random() * 3;
        if (score > bestScore) { bestScore = score; best = { node: n, target: t }; }
      }
    }
  } else {
    for (const [, n] of rm) {
      if (n.occupied) continue;
      for (const t of targets) {
        if (Math.hypot(n.x - t.x, n.y - t.y) > e.range || !los(n.x, n.y, t.x, t.y)) continue;
        const hc = hitChance(e, t, n.x, n.y).chance;
        const myCover = coverFrom(n.x, n.y, t.x, t.y);
        const score = hc + myCover * 18 - n.d * 1.5 + (t.hp <= 2 ? 15 : 0) + Math.random() * 4;
        if (score > bestScore) { bestScore = score; best = { node: n, target: t }; }
      }
    }
  }
  if (!best) {
    // advance toward nearest soldier
    const D = distField(targets.map(t => ({ x: t.x, y: t.y })), e.fly);
    let bn = null, bd = 1e9;
    for (const [, n] of rm) { if (n.occupied) continue; const d = D[n.y * MW + n.x] + (e.melee ? 0 : -coverFrom(n.x, n.y, targets[0].x, targets[0].y) * 0.5) + Math.random() * 0.3; if (d < bd) { bd = d; bn = n; } }
    if (bn && (bn.x !== e.x || bn.y !== e.y)) await moveUnit(e, pathTo(bn));
    return;
  }
  if (best.node.x !== e.x || best.node.y !== e.y) await moveUnit(e, pathTo(best.node));
  if (!e.alive || !best.target.alive) return;
  if (canTarget(e, best.target)) {
    if (!e.visible) { e.visible = true; }
    camTo(e.x * TS + 8, e.y * TS + 8);
    await sleep(0.15);
    await attack(e, best.target);
  }
}

async function centipedeAct(e) {
  const targets = soldiers(); if (!targets.length) return;
  camTo(e.x * TS + 8, e.y * TS + 8); await sleep(0.3);
  // pathing ignores objects (it crushes them)
  const key = (x, y) => y * MW + x;
  const start = { x: e.segs[0].x, y: e.segs[0].y, d: 0, prev: null };
  const seen = new Map([[key(start.x, start.y), start]]), q = [start];
  const free = (x, y) => inb(x, y) && grid[y][x] !== T.WALL && (!unitAt(x, y) || unitAt(x, y) === e);
  while (q.length) {
    const c = q.shift(); if (c.d >= e.mv) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy; if (!free(nx, ny) || seen.has(key(nx, ny))) continue;
      const n = { x: nx, y: ny, d: c.d + 1, prev: c }; seen.set(key(nx, ny), n); q.push(n);
    }
  }
  let best = null, bd = 1e9;
  const D = distField(targets.map(t => ({ x: t.x, y: t.y })), true);
  for (const [, n] of seen) {
    if (e.segs.some((s, i) => i > 0 && s.x === n.x && s.y === n.y)) continue;
    const adj = targets.some(t => mdist(n, t) === 1);
    const s = (adj ? -100 : 0) + D[key(n.x, n.y)] + n.d * 0.1;
    if (s < bd) { bd = s; best = n; }
  }
  if (best && best.d > 0) { Audio2.play('rumble', 0.5, 1.2); await moveCentipede(e, pathTo(best)); }
  if (!e.alive) return;
  const adj = targets.filter(t => t.alive && mdist(e.segs[0], t) === 1);
  if (adj.length) {
    const t = adj.sort((a, b) => a.hp - b.hp)[0];
    Audio2.play('drill', 0.5); await sleep(0.2);
    const hit = Math.random() * 100 < e.aim;
    if (hit) { Audio2.play('crunch', 0.9, 0.8); Audio2.play('wet', 0.5); cam.shake = 4; await applyDamage(t, rint(e.dmg[0], e.dmg[1]), e); }
    else floatText('MISS', t.x * TS + 8, t.y * TS + 8, C.grey);
    await sleep(0.3);
  }
}

// ---------------- mission script ----------------
async function checkTriggers(u) {
  const o = u.alive && objAt[u.y] && objAt[u.y][u.x];
  if (o && o.type === 'cache') {
    removeObj(o); G.scrap += 15;
    floatText('+15', u.x * TS + 8, u.y * TS, C.yellow); Audio2.play('complete', 0.45); Audio2.play('equip', 0.3);
    message('Supply cache: +15 scrap', C.yellow); bubble(u, 'Supplies!', 1.4);
  }
  // Vance rescue
  const v = byKey('vance');
  if (G.phase === 'find' && v.side === 'npc' && u.alive && los(u.x, u.y, v.x, v.y) && dist(u, v) <= 4.5) {
    G.phase = 'rescued';
    await rescueVance(u, v);
  }
  // LZ reached
  if (G.phase === 'toLZ' && soldiers().some(s => onPad(s.x, s.y))) { await startHold(); }
}
function onPad(x, y) { return x >= 33 && x <= 36 && y >= 3 && y <= 6; }

async function rescueVance(u, v) {
  G.busy = true;
  camTo(v.x * TS + 8, v.y * TS + 8); await sleep(0.4);
  setAnim(v, 'idle'); v.flip = u.x < v.x;
  Audio2.voice('alex', 'sel', true);
  await say('vance', 'Kestrel? Oh, thank god. I thought you were the bugs knocking.');
  await line(anyBut('reyes'), 'Vance. You hurt?');
  await say('vance', 'Just my pride. My radio has one fire mission left in it. Point me at something ugly.');
  v.side = 'player'; v.moved = true; v.acted = true;
  message('Pvt. Vance joins the squad.', C.green);
  Audio2.play('chime', 0.5);
  await line(anyBut('reyes').filter(k => k !== 'vance'), 'Overwatch, Kestrel. We have Vance. Moving to the pad.');
  await say('overwatch', 'Good copy. Bad news: you made noise. Flyers inbound from the north. Get to that pad.');
  // reinforcements
  Audio2.play('warning', 0.5); Audio2.play('buzz', 0.4);
  const sp = [['hornet', 30, 0], ['hornet', 37, 2], ['wasp', 26, 0], ['wasp', 39, 6]];
  for (const [t, x, y] of sp) { const e = spawnEnemy(t, x, y, 'R1'); e.active = true; }
  G.phase = 'toLZ';
  G.objective = 'Get the squad to the helipad in the northeast lot.';
  bannerShow('OBJECTIVE UPDATED', C.yellow, 'Reach the landing zone', true);
  showTip('Vance can call ARTILLERY once (ARTY button): 6 damage in a 3x3 area, landing at the start of your next turn. Mark where the bugs will be.');
  computeVis();
  G.busy = false;
}

async function startHold() {
  G.busy = true; G.phase = 'hold'; G.holdTurns = 3;
  camTo(34.5 * TS, 4.5 * TS);
  fx('smoke', 35 * TS, 4 * TS);
  const s = soldiers().find(s => onPad(s.x, s.y));
  Audio2.voice(s ? s.voice : 'meghan', 'obj', true);
  await line(anyBut('reyes'), 'Overwatch, Kestrel is on the pad. Send the bird.');
  await say('overwatch', 'Bird\'s away. Three turns out. Hold that pad, Kestrel.');
  if (canSpeak('okafor') && canSpeak('lin')) {
    await say('okafor', 'Three turns. Easy.');
    await say('lin', 'You said that in Kessel.');
    await say('okafor', 'And we lived.');
  }
  G.objective = 'Hold the landing zone until the dropship arrives.';
  Music.play('battle');
  bannerShow('HOLD THE LZ', C.orange, 'Dustoff in 3 turns', true);
  G.busy = false;
}

async function missionEnemyPhaseEnd() {
  if (G.phase === 'hold' || G.phase === 'extract') {
    G.holdEnemyTurns++;
    const h = G.holdEnemyTurns;
    if (h === 1) {
      Audio2.play('warning', 0.5);
      message('Movement on the east edge!', C.orange);
      for (const [t, x, y] of [['spider', 39, 13], ['spider', 39, 17], ['scarab', 39, 1]]) spawnEnemy(t, x, y, 'H1').active = true;
    } else if (h === 2) {
      await burrowerEmerges();
      for (const [t, x, y] of [['wasp', 39, 20], ['wasp', 30, 0]]) spawnEnemy(t, x, y, 'H2').active = true;
    } else if (h === 3) {
      message('More contacts inbound!', C.orange); Audio2.play('warning', 0.5);
      for (const [t, x, y] of [['hornet', 39, 8], ['spider', 39, 22], ['spider', 28, 0]]) spawnEnemy(t, x, y, 'H3').active = true;
    } else if (h >= 4 && h % 2 === 0) {
      for (const [t, x, y] of [['spider', 39, 15], ['wasp', 39, 4]]) spawnEnemy(t, x, y, 'H' + h).active = true;
    }
    computeVis();
  }
}

async function burrowerEmerges() {
  camTo(37.5 * TS, 12.5 * TS); await sleep(0.3);
  Music.stop(1.5);
  Audio2.play('rumble', 0.9, 0.8); cam.shake = 3;
  for (let i = 0; i < 12; i++) { particles(37.5 * TS + rint(-14, 14), 12.5 * TS + rint(-10, 10), 3, '#1f6363', 40); await sleep(0.08); }
  await line(anyBut('vance', 'haas'), 'Uh... guys? The ground is moving.');
  Audio2.play('rumble', 1, 0.6); Audio2.play('heavy', 0.8); Audio2.play('sting', 0.8);
  cam.shake = 7;
  for (let i = 0; i < 3; i++) fx('bigfrag', (36.5 + i) * TS, 12 * TS, { delay: i * 0.1 });
  const c = spawnEnemy('centipede', 37, 12, 'BOSS'); c.active = true; c.alpha = 0;
  c.segs = [{ x: 37, y: 12, dir: 4 }, { x: 38, y: 12, dir: 4 }, { x: 38, y: 11, dir: 6 }, { x: 37, y: 11, dir: 0 }, { x: 36, y: 11, dir: 0 }, { x: 36, y: 12, dir: 2 }];
  for (const s of c.segs) { const o = objAt[s.y][s.x]; if (o) removeObj(o); }
  G.centipede = c;
  for (let k = 0; k <= 10; k++) { c.alpha = k / 10; await sleep(0.05); }
  computeVis();
  Music.play('boss');
  await sleep(0.5);
  await line(anyBut('lin'), 'What... is that.');
  await say('overwatch', 'Kestrel, that is a Burrower. Do NOT try to kill it. Survive it.');
  await line(anyBut('haas', 'okafor').filter(k => k !== 'reyes'), 'It\'ll plough straight through cover. Don\'t bunch up!');
  await line(anyBut('reyes'), 'You heard Overwatch. Nobody gets eaten. Hold the pad!');
  showTip('The Burrower has 22 HP and crushes any cover it crawls through. You don\'t have to kill it. Just survive until dustoff.');
}

// rotor wash: the bird is never drawn, only the dust it kicks up (pack smoke sprites)
function washAt(x, y) { G.wash = { x, y, t: 0, on: true, strength: 1 }; }

async function dropshipArrives() {
  G.phase = 'extract';
  G.state = 'cutscene'; G.busy = true; G.sel = null; G.reachMap = null;
  Music.stop(1.5);
  Audio2.play('plane', 1);
  camTo(35 * TS, 5 * TS);
  await say('overwatch', 'Kestrel, bird is overhead. Stay low, we\'re coming down on the pad!');
  washAt(35 * TS, 5 * TS);
  cam.shake = 2;
  await sleep(1.6);
  // everyone still breathing goes home: the squad carries out anyone who is down
  const going = units.filter(u => u.side === 'player' && u.alive && !u.extracted);
  for (const u of going) if (u.downed) { u.downed = false; u.carried = true; }
  for (let k = 10; k >= 0; k--) { for (const u of going) u.alpha = k / 10; await sleep(0.08); }
  for (const u of going) u.extracted = true;
  await sleep(0.6);
  await victory();
}

function spawnEnemy(type, x, y, pod) {
  // nearest free tile
  let best = null, bd = 1e9;
  for (let yy = Math.max(0, y - 3); yy <= Math.min(MH - 1, y + 3); yy++) for (let xx = Math.max(0, x - 3); xx <= Math.min(MW - 1, x + 3); xx++) {
    const fly = ENEMY_DEFS[type].fly;
    if (!(fly ? (grid[yy][xx] !== T.WALL && !objAt[yy][xx]) : walkable(xx, yy)) || unitAt(xx, yy)) continue;
    const d = Math.abs(xx - x) + Math.abs(yy - y); if (d < bd) { bd = d; best = [xx, yy]; }
  }
  if (!best) best = [x, y];
  return makeEnemy(type, best[0], best[1], pod);
}

async function checkEnd() {
  if (G.state === 'win' || G.state === 'lose') return true;
  const squad = units.filter(u => u.side === 'player');
  const standing = squad.filter(u => u.alive && !u.downed && !u.extracted);
  const aboard = squad.filter(u => u.extracted);
  if (!standing.length && !aboard.length) { await defeat(); return true; }
  return false;
}

function bankScrap(win) {
  const aboard = units.filter(u => u.side === 'player' && u.extracted).length;
  const bonus = win ? 40 + aboard * 5 : 0;
  G.earned = { kills: G.scrap, bonus, total: G.scrap + bonus };
  Save.data.scrap += G.earned.total; Save.data.runs++; if (win) Save.data.wins++;
  Save.write();
}
async function victory() {
  G.state = 'cutscene'; G.busy = true;
  Audio2.play('win', 0.8);
  await bannerShow('MISSION CLEARED', C.green, 'Kestrel Squad extracted', false, 2.4);
  if (G.wash) G.wash.leaving = true;
  const lost = units.filter(u => SQUAD_DEFS[u.key] && u.side === 'player' && !u.alive);
  const carried = units.filter(u => u.carried);
  await say('overwatch', 'All aboard. Wheels up. Good work tonight, Kestrel.');
  if (carried.length) await say('overwatch', carried.map(u => u.name).join(' and ') + (carried.length > 1 ? ' are' : ' is') + ' with the medic. They\'ll pull through.');
  if (lost.length) await say('overwatch', (lost.length === 1 ? lost[0].name + ' won\'t be forgotten.' : 'We lost good people tonight.') + ' We\'ll bring them home when we take this district back.');
  await line(anyBut('reyes'), 'Flag this for command. The swarm has something big living under the streets.');
  if (G.flags.burrowerKilled) { await line(anyBut('vance', 'haas'), 'Had. Past tense. We killed it.'); await say('overwatch', '...You were told not to engage. Drinks are on me.'); }
  else await say('overwatch', 'Already flagged. Get some sleep. Tomorrow you go back in.');
  bankScrap(true);
  G.state = 'win'; G.busy = false; G.endT = 0;
  Music.play('brief');
}
async function defeat() {
  G.state = 'cutscene'; G.busy = true;
  Music.stop(2);
  Audio2.play('static', 0.6); await sleep(0.4);
  Audio2.play('lose', 0.8);
  await say('overwatch', 'Kestrel? Kestrel, respond... Kestrel...');
  bankScrap(false);
  G.state = 'lose'; G.busy = false; G.endT = 0;
}

async function runIntro() {
  G.state = 'cutscene'; G.busy = true;
  Music.play('brief');
  G.ambient = Audio2.loop('wind', 0.12);
  const squad = ['reyes', 'okafor', 'haas', 'lin'].map(byKey);
  for (const u of squad) u.alpha = 0;
  camTo(3.5 * TS, 21 * TS, true);
  bannerShow('MISSION 1', C.yellow, 'DEAD SIGNAL', true, 2.4);
  // insertion: the bird is heard, never seen. Dust kicks up and the squad is there when it clears.
  Audio2.play('plane', 0.7);
  washAt(3.5 * TS, 21 * TS);
  setTimeout(() => Audio2.play('start', 0.6), 600);
  await pause(1.2);
  for (const u of squad) {
    if (!skipping) { Audio2.play('dirt', 0.4); fx('smoke', u.x * TS + 8, u.y * TS + 10, { scale: 2 }); for (let k = 1; k <= 6; k++) { u.alpha = k / 6; await sleep(0.05); } await sleep(0.12); }
    u.alpha = 1;
  }
  await pause(0.5);
  G.wash.leaving = true;
  await say('overwatch', 'Kestrel Squad, Overwatch. You\'re on the ground. Welcome to Meridian District.');
  await say('overwatch', 'Six hours ago the swarm took the city grid. Ninety minutes ago our forward observer went dark.');
  camTo(8.5 * TS, 6 * TS); await pause(0.8);
  await say('overwatch', 'Private Eli Vance. His last ping came from the Halvorsen office block, north of you.');
  await say('reyes', 'Copy. We find Vance. Then what?');
  camTo(34.5 * TS, 5 * TS); await pause(1.2);
  await say('overwatch', 'Then get to the helipad in the northeast lot. Call from the pad and the bird comes back for you.');
  await say('haas', 'Why can\'t the bird just wait for us?');
  await say('overwatch', 'Because the swarm shoots at birds, Private. Three turns from your call. Four if the pilot finishes his coffee.');
  camTo(4 * TS, 20 * TS); await pause(1.0);
  await say('okafor', 'Quiet streets. I hate quiet streets.');
  Audio2.play('crows', 0.35);
  await say('lin', 'It isn\'t quiet. Listen.');
  Audio2.voice('meghan', 'ready', true);
  await say('reyes', 'Eyes up, Kestrel. Stick to cover. Move out.');
  Music.play('explore', 2);
  showTip(COARSE ? 'Tap a soldier, tap a green tile to preview the move, then tap it again to go. One move + one action per turn. Drag to look around, pinch to zoom.' : 'Click a soldier, then a green tile to move. Each soldier gets one move and one action per turn. Shields on a tile show the cover you\'d get there.');
  G.turn = 1;
  await startPlayerTurn();
}
