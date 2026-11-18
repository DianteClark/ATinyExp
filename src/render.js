'use strict';
// ============================================================
// RENDER: the world view (map, units, overlays, lighting, weather)
// ============================================================

function drawWorld() {
  const sx = Math.round(cam.x + cam.sx), sy = Math.round(cam.y + cam.sy);
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, Math.ceil(WVW) + 1, Math.ceil(WVH) + 1);
  ctx.drawImage(mapCanvas, -sx, -sy);
  const sel = G.sel;
  const pulse = (Math.sin(gt * 5) + 1) / 2;
  const M = G.mission;
  // landing pad marker while it is the objective
  const padGoal = (M.id === 1 && (G.phase === 'toLZ' || G.phase === 'hold')) || (M.id === 2 && G.phase === 'exfil');
  if (padGoal) {
    ctx.globalAlpha = 0.25 + pulse * 0.25;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) spr(I.rangegrid, 112, 0, 16, 16, (M.pad[0] + x) * TS - sx, (M.pad[1] + y) * TS - sy);
    ctx.globalAlpha = 1;
  }
  if (M.drawOverlay) M.drawOverlay(sx, sy);
  // overlays
  const tile = G.hover;
  if (G.state === 'player' && sel && !G.busy && !G.dialog) {
    if (G.mode === 'move' && G.reachMap) {
      ctx.globalAlpha = 0.33;
      for (const [, n] of G.reachMap) if (!n.occupied && n.d > 0) spr(I.rangegrid, 0, 0, 16, 16, n.x * TS - sx, n.y * TS - sy);
      ctx.globalAlpha = 1;
    }
    if (G.mode === 'fire') {
      ctx.globalAlpha = 0.18;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (Math.hypot(x - sel.x, y - sel.y) <= sel.range && G.vis[y][x] && los(sel.x, sel.y, x, y)) spr(I.rangegrid, 16, 0, 16, 16, x * TS - sx, y * TS - sy);
      ctx.globalAlpha = 1;
    }
    if (G.mode === 'grenade' || G.mode === 'arty' || G.mode === 'rocket') {
      ctx.globalAlpha = G.mode === 'rocket' ? 0.14 : 0.28;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (abilityValid(sel, x, y)) spr(I.rangegrid, 48, 0, 16, 16, x * TS - sx, y * TS - sy);
      ctx.globalAlpha = 1;
      if (tile && abilityValid(sel, tile.x, tile.y)) {
        ctx.globalAlpha = 0.6 + pulse * 0.3;
        for (let y = tile.y - 1; y <= tile.y + 1; y++) for (let x = tile.x - 1; x <= tile.x + 1; x++) if (inb(x, y)) spr(I.rangegrid, x === tile.x && y === tile.y && G.mode === 'rocket' ? 16 : 48, 0, 16, 16, x * TS - sx, y * TS - sy);
        ctx.globalAlpha = 1;
      }
    }
  }
  // enemy threat preview: where the hovered enemy can move next turn
  const hu = tile && unitAt(tile.x, tile.y);
  if (hu && hu.side === 'enemy' && hu.visible && G.state === 'player' && !hu.segs) {
    if (!hu._reach || hu._reachKey !== hu.x + ',' + hu.y + ',' + G.turn) { hu._reach = reach(hu, hu.mv); hu._reachKey = hu.x + ',' + hu.y + ',' + G.turn; }
    ctx.globalAlpha = 0.5;
    for (const [, n] of hu._reach) if (n.d > 0 && !n.occupied) spr(I.rangegrid, 112, 0, 16, 16, n.x * TS - sx, n.y * TS - sy);
    ctx.globalAlpha = 1;
  }
  // queued artillery / charge markers
  for (const a of G.artyQueue) {
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    for (let y = a.y - 1; y <= a.y + 1; y++) for (let x = a.x - 1; x <= a.x + 1; x++) if (inb(x, y)) spr(I.rangegrid, 80, 0, 16, 16, x * TS - sx, y * TS - sy);
    ctx.globalAlpha = 1;
  }
  // path preview + cover shields on hovered reachable tile
  let pathNodes = null;
  if (G.state === 'player' && sel && G.mode === 'move' && G.reachMap && tile && !G.busy && !G.dialog) {
    const n = G.reachMap.get(tile.y * MW + tile.x);
    if (n && !n.occupied && n.d > 0) pathNodes = pathTo(n);
  }
  // selection circle under selected
  if (sel && sel.alive && !sel.extracted) { const [px, py] = unitPx(sel); spr(I.selcircle, 0, 24, 24, 24, px - sx - 4, py - sy + 2); }

  // depth-sorted drawables
  const dr = [];
  for (const o of objects) if (o.alive) dr.push({ y: o.y + o.h - 1 + 0.5, f: () => drawObj(o, sx, sy) });
  for (const u of units) {
    if (u.extracted) continue;
    if (u.corpse) { if (explored[u.y][u.x] && !u.segs) dr.push({ y: u.y - 0.3, f: () => spr(I[u.img], u.key === 'hornet' || u.key === 'wasp' ? 0 : 0, u.key === 'hornet' ? 0 : u.key === 'wasp' ? 0 : 64, u.key === 'hornet' ? 24 : 16, u.key === 'hornet' ? 24 : 16, u.x * TS - sx, u.y * TS - sy, u.flip, u.key === 'hornet' || u.key === 'wasp' ? 0 : 0.85) }); continue; }
    if (!u.alive && !u.dead) continue;
    if (u.side === 'enemy' && !u.visible) continue;
    if (u.side === 'npc' && !u.visible) continue;
    dr.push({ y: u.y + u.oy / TS + (u.fly ? 0.6 : 0.4), f: () => drawUnit(u, sx, sy) });
  }
  // pack objective flag on the landing pad
  if (M.pad && !M.noFlag && G.phase !== 'done') { const fx0 = M.pad[0] + 2, fy0 = M.pad[1] + 1; dr.push({ y: fy0 + 0.4, f: () => spr(I.flag, (Math.floor(gt * 8) % 6) * 64, 0, 64, 64, fx0 * TS - sx - 22, fy0 * TS - sy - 40) }); }
  dr.sort((a, b) => a.y - b.y);
  for (const d of dr) d.f();

  drawLighting(sx, sy);

  // fog of war
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (G.vis && G.vis[y][x]) continue;
    ctx.fillStyle = explored[y][x] ? 'rgba(3,4,22,0.5)' : 'rgba(3,4,22,0.72)';
    ctx.fillRect(x * TS - sx, y * TS - sy, TS, TS);
  }

  if (pathNodes) drawPathArrows(pathNodes, sx, sy);
  if (pathNodes) {
    const e = pathNodes[pathNodes.length - 1];
    for (const c of coverDirs(e.x, e.y)) {
      // full cover = solid shield, half cover = outline shield (pack icon set)
      spr(I.icons, 4 * 16, c.c === 2 ? 16 : 0, 16, 16, e.x * TS - sx + c.dx * 9, e.y * TS - sy + c.dy * 9 - 2, false, 0.95);
    }
  }
  // supply caches: a bobbing "!" from the pack icon set
  for (const o of objects) if (o.alive && o.type === 'cache' && explored[o.y][o.x])
    spr(I.icons, 7 * 16, 16, 16, 16, o.x * TS - sx, o.y * TS - sy - 15 + Math.round(Math.sin(gt * 4 + o.x) * 2));

  // unit overlays
  for (const u of units) {
    if (!u.alive || u.extracted) continue;
    if (u.side === 'enemy' && !u.visible) continue;
    if (u.side === 'npc') { if (u.visible) { const [px, py] = unitPx(u); spr(I.icons, 6 * 16, 16, 16, 16, px - sx, py - sy - 18 + Math.sin(gt * 4) * 2); } continue; }
    const head = u.segs ? u.segs[0] : u;
    const px = head.x * TS + (u.segs ? 0 : u.ox), py = head.y * TS + (u.segs ? 0 : u.oy);
    const yy = py - sy - (u.fly ? 9 : 4) - (u.key === 'hornet' ? 6 : 0);
    const hov = tile && unitAt(tile.x, tile.y) === u;
    if (u.alpha !== undefined && u.alpha < 1) continue;
    if (u.downed) {
      // downed: pack heart icon + turns left before they bleed out
      const blink = u.bleed <= 1 && Math.floor(gt * 4) % 2;
      spr(I.icons, 3 * 16, 16, 16, 16, px - sx, py - sy - 18, false, blink ? 0.4 : 1);
      num(String(Math.max(0, u.bleed)), px - sx + 13, py - sy - 14, 2);
      continue;
    }
    if (u.side === 'player' && u.hp >= u.maxhp && G.sel !== u && !hov) { /* healthy soldiers: no bar, less clutter */ }
    else if (u.maxhp > 12) { packBarSmall(px - sx + 2, yy - 1, u.hp / u.maxhp); packBarSmall(px - sx + 14, yy - 1, u.hp / u.maxhp); }
    else packBarSmall(px - sx + 8, yy, u.hp / u.maxhp);
    if (u.overwatch) { ctx.fillStyle = C.yellow; text('OW', px - sx + 14, py - sy - 4, C.yellow); }
    if (u.alertT > 0) spr(I.icons, 7 * 16, 16, 16, 16, px - sx, yy - 18 - (1 - Math.min(1, u.alertT)) * 4);
    // targetable brackets
    if (u.side === 'enemy' && G.state === 'player' && sel && hasActions(sel) && !G.busy && G.mode !== 'grenade' && G.mode !== 'arty' && G.mode !== 'rocket' && canTarget(sel, u)) {
      const hv = tile && unitAt(tile.x, tile.y) === u;
      const hc = hitChance(sel, u);
      const cx = hc.tx * TS - sx, cy = hc.ty * TS - sy;
      corners(cx, cy, 1, hv ? 1 + Math.round(pulse) : 0);
      // hit chance over the target you're aiming at (pack digits)
      if (hv) { const s2 = hc.chance + '%'; num(s2, cx + 8 - s2.length * 3.5, cy - 22, hc.chance >= 65 ? 1 : hc.chance >= 40 ? 0 : 4); }
    }
  }
  // barrels targetable
  if (G.state === 'player' && sel && hasActions(sel) && G.mode === 'move' && !G.busy) {
    for (const o of objects) if (o.alive && OBJ[o.type].explosive && G.vis[o.y][o.x] && Math.hypot(o.x - sel.x, o.y - sel.y) <= sel.range && los(sel.x, sel.y, o.x, o.y)) {
      if (tile && tile.x === o.x && tile.y === o.y) corners(o.x * TS - sx, o.y * TS - sy, 4, 1);
    }
  }
  // selected brackets
  if (sel && sel.alive && !sel.extracted) { const [px, py] = unitPx(sel); corners(px - sx, py - sy, 0, Math.round(pulse)); }

  drawFX(sx, sy);

  // speech bubbles
  for (const b of G.bubbles) {
    const u = b.u; const [px, py] = unitPx(u);
    const w = textW(b.s) + 8, x = Math.round(px - sx + 8 - w / 2), y = Math.round(py - sy - 32);
    panel(x, y, w, 15, C.white, 'rgba(10,12,40,0.95)');
    ctx.fillStyle = C.white; ctx.fillRect(x + w / 2 - 1, y + 15, 3, 2); ctx.fillRect(x + w / 2, y + 17, 1, 2);
    text(b.s, x + 4, y + 2, C.white);
  }
}

let lightCv = null, lightG = null;

function drawLighting(sx, sy) {
  const w = Math.ceil(WVW) + 2, h = Math.ceil(WVH) + 2;
  if (!lightCv) lightCv = document.createElement('canvas');
  if (lightCv.width !== w || lightCv.height !== h) { lightCv.width = w; lightCv.height = h; lightG = lightCv.getContext('2d'); }
  const g = lightG;
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  g.fillStyle = `rgba(6,8,40,${G.mission ? G.mission.dark : 0.36})`; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a) => {
    if (x < -r || y < -r || x > w + r || y > h + r) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const flick = 0.92 + Math.sin(gt * 13) * 0.04 + Math.sin(gt * 7.3) * 0.04;
  for (const o of objects) if (o.alive && o.type === 'lamp') hole(o.x * TS + 8 - sx, o.y * TS + 2 - sy, 46, flick);
  for (const u of units) if (u.side === 'player' && u.alive && !u.extracted) { const [px, py] = unitPx(u); hole(px + 8 - sx, py + 8 - sy, 32, 0.8); }
  for (const l of LIGHTS) hole(l.x - sx, l.y - sy, l.r, 1 - l.t / l.life);
  if (G.wash) hole(G.wash.x - sx, G.wash.y - sy, 64, G.wash.leaving ? 0.4 : 0.9);
  ctx.drawImage(lightCv, 0, 0);
  // warm additive glow from flashes
  ctx.globalCompositeOperation = 'lighter';
  for (const l of LIGHTS) {
    const k = 1 - l.t / l.life, x = l.x - sx, y = l.y - sy, r = l.r * 0.7;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${l.color},${0.35 * k})`); gr.addColorStop(1, `rgba(${l.color},0)`);
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}
// movement path from the pack's thick-arrow pieces (blue set): straights, corners, arrowhead

function drawPathArrows(p, sx, sy) {
  const dir = (a, b) => (b.x > a.x ? 'R' : b.x < a.x ? 'L' : b.y > a.y ? 'D' : 'U');
  const opp = { R: 'L', L: 'R', U: 'D', D: 'U' };
  const START = { R: [0, 0], L: [3, 0], D: [1, 0], U: [2, 0] }, HEAD = { R: [0, 2], L: [0, 3], D: [1, 2], U: [1, 3] };
  const MID = { LR: [0, 1], DU: [1, 1], DR: [2, 1], DL: [3, 1], RU: [2, 2], LU: [3, 2] };   // keys = sorted pair of connected sides
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < p.length; i++) {
    let c;
    if (i === 0) c = START[dir(p[0], p[1])];
    else if (i === p.length - 1) c = HEAD[dir(p[i - 1], p[i])];
    else c = MID[[opp[dir(p[i - 1], p[i])], dir(p[i], p[i + 1])].sort().join('')];
    if (c) spr(I.arrows, c[0] * 16, c[1] * 16, 16, 16, p[i].x * TS - sx, p[i].y * TS - sy);
  }
  ctx.globalAlpha = 1;
}

function corners(x, y, color, spread) {
  const o = spread || 0;
  spr(I.selcursor, (color * 4 + 0) * 8, 0, 8, 8, x - 2 - o, y - 2 - o);
  spr(I.selcursor, (color * 4 + 1) * 8, 0, 8, 8, x + 10 + o, y - 2 - o);
  spr(I.selcursor, (color * 4 + 2) * 8, 0, 8, 8, x - 2 - o, y + 10 + o);
  spr(I.selcursor, (color * 4 + 3) * 8, 0, 8, 8, x + 10 + o, y + 10 + o);
}

function drawObj(o, sx, sy) {
  const d = OBJ[o.type]; const [rx, ry, rw, rh] = d.r;
  const dx = o.x * TS + o.w * 8 - rw / 2, dy = (o.y + o.h) * TS - rh + (d.tall ? 2 : 0);
  spr(I.obj, rx, ry, rw, rh, dx - sx, dy - sy);
}

// can the selected soldier's ability target tile (x, y)?
function abilityValid(u, x, y) {
  if (!inb(x, y) || grid[y][x] === T.WALL) return false;
  if (G.mode === 'grenade') return Math.hypot(x - u.x, y - u.y) <= 5 && G.vis[y][x] && los(u.x, u.y, x, y);
  if (G.mode === 'arty') return G.vis[y][x];
  if (G.mode === 'rocket') return Math.hypot(x - u.x, y - u.y) <= 8 && G.vis[y][x] && los(u.x, u.y, x, y) && !(x === u.x && y === u.y);
  return false;
}

// ---------- weather (atmosphere, drawn over the world in HUD space) ----------
const WX = [];
function drawWeather(dt, kind) {
  kind = kind || 'rain';
  const n = kind === 'storm' ? 130 : kind === 'dust' ? 60 : 70;
  if (WX.kind !== kind) { WX.length = 0; WX.kind = kind; }
  while (WX.length < n) WX.push({ x: Math.random() * (VW + 60), y: Math.random() * (VH + 40), v: 0.7 + Math.random() * 0.6, l: 4 + Math.random() * 6 });
  ctx.lineWidth = 1; ctx.beginPath();
  if (kind === 'dust') {
    // wind-blown grit streaking sideways
    ctx.strokeStyle = 'rgba(190,200,170,0.16)';
    for (const p of WX) {
      p.x += 260 * p.v * dt; p.y += 30 * p.v * dt;
      if (p.x > VW + 20) { p.x = -20; p.y = Math.random() * VH; }
      ctx.moveTo(Math.round(p.x), Math.round(p.y) + 0.5); ctx.lineTo(Math.round(p.x - p.l * 1.6), Math.round(p.y - p.l * 0.2) + 0.5);
    }
  } else {
    const speed = kind === 'storm' ? 300 : 200, slant = kind === 'storm' ? 0.45 : 0.25;
    ctx.strokeStyle = kind === 'storm' ? 'rgba(160,210,255,0.24)' : 'rgba(150,200,255,0.18)';
    for (const p of WX) {
      p.y += speed * p.v * dt; p.x -= speed * slant * p.v * dt;
      if (p.y > VH + 10) { p.y = -10; p.x = Math.random() * (VW + 60); }
      if (p.x < -10) p.x += VW + 20;
      ctx.moveTo(Math.round(p.x) + 0.5, Math.round(p.y)); ctx.lineTo(Math.round(p.x + p.l * slant) + 0.5, Math.round(p.y - p.l));
    }
  }
  ctx.stroke();
  // storm: lightning flashes with a rolling thunder rumble a moment later
  if (kind === 'storm' && G.state !== 'title') {
    G.boltT = (G.boltT === undefined ? 6 : G.boltT) - dt;
    if (G.boltT <= 0) { G.boltT = 7 + Math.random() * 9; G.flash = Math.max(G.flash || 0, 0.18); setTimeout(() => Audio2.play('rumble', 0.45, 0.55), 500 + Math.random() * 900); }
  }
}
function drawFlash(dt) {
  if (!(G.flash > 0)) return;
  ctx.fillStyle = `rgba(255,240,210,${Math.min(0.55, G.flash * 2.2)})`; ctx.fillRect(0, 0, VW, VH);
  G.flash -= dt;
}
