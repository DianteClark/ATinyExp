'use strict';
// ============================================================
// COMBAT: movement, attacks, damage, explosions, enemy AI
// ============================================================

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
    if (u.hp > 0) { setAnim(u, 'hit'); Audio2.voice(u.voice, u.hp <= 2 ? 'low' : 'dmg', true, u.voiceRate); }
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

async function downUnit(u) {
  u.downed = true; u.hp = 0; u.bleed = 3; u.overwatch = false; u.acted = true;
  setAnim(u, 'death');
  Audio2.voice(u.voice, 'death', true, u.voiceRate); buzz([30, 40, 60]);
  const others = soldiers();
  if (others.length) bubble(others[rint(0, others.length - 1)], u.key === 'reyes' ? 'Sarge is down! Get to her!' : u.short.charAt(0) + u.short.slice(1).toLowerCase() + ' is down!');
  message(u.name + ' is down! Revive within 3 turns.', C.red);
  if (G.sel === u) { G.sel = null; G.reachMap = null; }
  if (!G.flags.reviveTip) { G.flags.reviveTip = true; showTip('A downed soldier bleeds out in 3 turns. Move a squadmate next to them, then tap the downed soldier to revive them with 3 HP. Reviving uses that squadmate\'s action.'); }
  await sleep(0.4);
}

async function centipedeDeath(u) {
  G.flags.bossKilled = true;
  if (!G.flags.shutdown) Music.play(G.mission.music.battle);
  for (let i = 0; i < u.segs.length; i++) {
    const s = u.segs[i]; fx(i === 0 ? 'bigexp' : 'smallexp', s.x * TS + 8, s.y * TS + 6); Audio2.play(i === 0 ? 'expL' : 'expM', 0.6);
    cam.shake = 4; particles(s.x * TS + 8, s.y * TS + 8, 8, '#ffb0b0', 60);
    await sleep(0.18);
  }
  u.corpse = true;
  if (G.flags.shutdown) return;
  if (G.mission.onBossKilled) await G.mission.onBossKilled();
  else {
    await line(anyBut('lin'), 'It\'s down. The big one is DOWN.');
    await line(others('lin'), 'Somebody owes me a drink.');
  }
}

// explosions: grenades, barrels, artillery

async function explode(cx, cy, r, dmg, kind, src, skip) {
  const big = kind === 'arty' || kind === 'charge';
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
      else if (d.wreck && (big || kind === 'grenade' || kind === 'rocket')) { removeObj(o); placeObj(d.wreck, o.x, o.y); }
    }
  }
  // wake nearby pods
  for (const e of enemies()) if (!e.active && Math.hypot(e.x - cx, e.y - cy) < 7) { for (const o of enemies()) if (o.pod === e.pod) o.active = true; }
  // shaped demolition charges only hurt bugs
  for (const u of hitUnits) if (u !== skip && !(kind === 'charge' && u.side !== 'enemy')) await applyDamage(u, dmg, src, true);
  for (const u of hitUnits) if (u.alive && u.side !== 'enemy') setAnim(u, 'idle');
  for (const o of chain) { await sleep(0.15); await explode(o.x, o.y, 1, 3, 'barrel', src); }
  computeVis();
}

async function throwGrenade(u, tx, ty) {
  u.acted = true; u.grenades--;
  u.flip = tx < u.x;
  setAnim(u, 'throw'); Audio2.play('throw', 0.5); Audio2.voice(u.voice, 'grunt', false, u.voiceRate);
  await sleep(0.2);
  const [ax, ay] = centerOf(u);
  await projectile('grenade', ax, ay - 4, tx * TS + 8, ty * TS + 8, 220, 28);
  Audio2.play('dirt', 0.3);
  await sleep(0.15);
  await explode(tx, ty, 1, 3, 'grenade', u);
  setAnim(u, 'idle');
}

// anti-tank rocket: 5 to whatever is on the tile, 2 splash around it, wrecks cover
async function fireRocket(u, tx, ty) {
  u.acted = true; u.rockets--;
  u.flip = tx < u.x;
  setAnim(u, 'fire'); Audio2.play('whoosh', 0.6, 0.8); Audio2.play('airburst', 0.4);
  Audio2.voice(u.voice, 'grunt', false, u.voiceRate);
  const [ax, ay] = centerOf(u);
  fx('muzzle', ax + (u.flip ? -8 : 8), ay, { flip: u.flip });
  await projectile('rpg', ax + (u.flip ? -6 : 6), ay, tx * TS + 8, ty * TS + 8, 300);
  const t = unitAt(tx, ty);
  if (t && t.side !== 'player') await applyDamage(t, 5, u);
  await explode(tx, ty, 1, 2, 'rocket', u, t);
  setAnim(u, 'idle');
}

async function callArtillery(u, tx, ty) {
  u.acted = true; u.arty--;
  setAnim(u, 'crawl');
  Audio2.play('static', 0.4); Audio2.voice(u.voice, 'count', true, u.voiceRate);
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
