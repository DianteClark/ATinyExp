'use strict';
// ============================================================
// UI: dialogue, HUD, rendering, input, main loop
// ============================================================
const SPEAKERS = {
  overwatch: { name: 'OVERWATCH', color: '#5ad8ff', pitch: 180 },
  reyes: { name: 'SGT. REYES', color: '#ffd23f', pitch: 330, unit: 'reyes' },
  okafor: { name: 'CPL. OKAFOR', color: '#ff9a1a', pitch: 170, unit: 'okafor' },
  haas: { name: 'PVT. HAAS', color: '#3ee03e', pitch: 230, unit: 'haas' },
  lin: { name: 'SPC. LIN', color: '#7fe3ff', pitch: 390, unit: 'lin' },
  vance: { name: 'PVT. VANCE', color: '#c58bff', pitch: 260, unit: 'vance' },
};
let skipping = false;
function say(who, s) {
  if (skipping) return Promise.resolve();
  return new Promise(res => { G.dialogGap = 0; G.dialog = { who, s, shown: 0, res, t: 0, lines: null }; Audio2.play('blip', 0.25, who === 'overwatch' ? 0.8 : 1.2); if (who === 'overwatch') Audio2.play('static', 0.12, 1.4); });
}
function advanceDialog() {
  const d = G.dialog; if (!d) return;
  if (d.shown < d.s.length) { d.shown = d.s.length; return; }
  G.lastDialog = d; G.dialogGap = 0.25; G.dialog = null; d.res();
}
function bannerShow(title, color, sub, nowait, dur = 1.5) {
  G.banner = { title, color, sub, t: 0, dur };
  Audio2.play(color === C.red ? 'hydDn' : 'selbig', 0.35);
  return nowait ? Promise.resolve() : sleep(dur);
}

// ---------- big text ----------
const bigCache = {};
function bigText(s, cx, y, scale, color) {
  const k = s + scale + color;
  if (!bigCache[k]) {
    const c = document.createElement('canvas'); c.width = textW(s) + 2; c.height = FH + 2;
    const g = c.getContext('2d'); const f1 = fontFor(C.ink), f2 = fontFor(color);
    for (const [f, o] of [[f1, 1], [f2, 0]]) for (let i = 0; i < s.length; i++) { const code = s.charCodeAt(i) - 32; if (code > 0 && code <= 94) g.drawImage(f, code * FW, 0, FW, FH, i * FW + o, o, FW, FH); }
    bigCache[k] = c;
  }
  const c = bigCache[k];
  ctx.drawImage(c, Math.round(cx - c.width * scale / 2), Math.round(y), c.width * scale, c.height * scale);
}

// ---------- HUD geometry / hit areas ----------
let hud = [];
function button(id, x, y, w, h, label, opts = {}) {
  const hov = mouse.inside && mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h;
  const dis = opts.disabled;
  panel(x, y, w, h, dis ? '#2a3355' : opts.active ? C.yellow : hov ? C.mint : C.cyan, opts.active ? 'rgba(60,50,10,0.95)' : C.panel);
  let tx = x + 5;
  if (opts.icon !== undefined) { spr(I.icons, opts.icon * 16, 16, 16, 16, x + 2, y + Math.floor((h - 16) / 2), false, dis ? 0.35 : 1); tx = x + 20; }
  if (opts.key) text(opts.key, x + w - 8, y + 2, dis ? '#3a4466' : C.grey, false);
  text(label, tx, y + Math.floor((h - FH) / 2) + 1, dis ? '#4a5577' : C.white);
  hud.push({ id, x, y, w, h, tip: opts.tip, disabled: dis });
  return hov;
}
function hudHit(x, y) { for (let i = hud.length - 1; i >= 0; i--) { const b = hud[i]; if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b; } return null; }

// ---------- world rendering ----------
function worldToScreen(px, py) { return [px - Math.round(cam.x + cam.sx), py - Math.round(cam.y + cam.sy)]; }
function drawWorld() {
  const sx = Math.round(cam.x + cam.sx), sy = Math.round(cam.y + cam.sy);
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, Math.ceil(WVW) + 1, Math.ceil(WVH) + 1);
  ctx.drawImage(mapCanvas, -sx, -sy);
  const sel = G.sel;
  const pulse = (Math.sin(gt * 5) + 1) / 2;
  // helipad marker
  if (G.phase === 'toLZ' || G.phase === 'hold' || G.phase === 'extract') {
    ctx.globalAlpha = 0.25 + pulse * 0.25;
    for (let y = 3; y <= 6; y++) for (let x = 33; x <= 36; x++) spr(I.rangegrid, G.phase === 'extract' ? 64 : 112, 0, 16, 16, x * TS - sx, y * TS - sy);
    ctx.globalAlpha = 1;
  }
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
    if (G.mode === 'grenade' || G.mode === 'arty') {
      ctx.globalAlpha = 0.28;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (abilityValid(sel, x, y)) spr(I.rangegrid, 48, 0, 16, 16, x * TS - sx, y * TS - sy);
      ctx.globalAlpha = 1;
      if (tile && abilityValid(sel, tile.x, tile.y)) {
        ctx.globalAlpha = 0.6 + pulse * 0.3;
        for (let y = tile.y - 1; y <= tile.y + 1; y++) for (let x = tile.x - 1; x <= tile.x + 1; x++) if (inb(x, y)) spr(I.rangegrid, 48, 0, 16, 16, x * TS - sx, y * TS - sy);
        ctx.globalAlpha = 1;
      }
    }
  }
  // queued artillery markers
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
  // objective flag
  if (G.phase === 'toLZ' || G.phase === 'hold' || G.phase === 'find') dr.push({ y: 4.4, f: () => spr(I.flag, (Math.floor(gt * 8) % 6) * 64, 0, 64, 64, 35 * TS - sx - 22, 4 * TS - sy - 40) });
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
    if ((u.alpha !== undefined && u.alpha < 1) || G.state === 'cutscene' && G.phase === 'extract') continue;
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
    if (u.side === 'enemy' && G.state === 'player' && sel && hasActions(sel) && !G.busy && G.mode !== 'grenade' && G.mode !== 'arty' && canTarget(sel, u)) {
      const hv = tile && unitAt(tile.x, tile.y) === u;
      const cx = (u.segs ? hitChance(sel, u).tx : u.x) * TS - sx, cy = (u.segs ? hitChance(sel, u).ty : u.y) * TS - sy;
      corners(cx, cy, 1, hv ? 1 + Math.round(pulse) : 0);
    }
  }
  // barrels targetable
  if (G.state === 'player' && sel && hasActions(sel) && G.mode !== 'grenade' && G.mode !== 'arty' && !G.busy) {
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
  g.fillStyle = 'rgba(6,8,40,0.36)'; g.fillRect(0, 0, w, h);
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
function abilityValid(u, x, y) {
  if (!inb(x, y) || grid[y][x] === T.WALL) return false;
  if (G.mode === 'grenade') return Math.hypot(x - u.x, y - u.y) <= 5 && explored[y][x] && (G.vis[y][x]) && los(u.x, u.y, x, y);
  if (G.mode === 'arty') return explored[y][x] && G.vis[y][x];
  return false;
}

// ---------- portraits ----------
function portrait(who, x, y, size) {
  panel(x, y, size, size, SPEAKERS[who].color, '#0b1030');
  const inner = size - 4, s = size >= 50 ? 48 : 32;
  ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y + 2, inner, inner); ctx.clip();
  for (let i = 0; i < inner; i += 2) { ctx.fillStyle = i % 4 ? '#0d1640' : '#101c4c'; ctx.fillRect(x + 2, y + 2 + i, inner, 1); }
  if (who === 'overwatch') {
    ctx.drawImage(I.insignia, 4 * 24, 2 * 24, 24, 24, x + Math.round((size - s) / 2), y + Math.round((size - s) / 2), s, s);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(120,200,255,' + (Math.random() * 0.15) + ')'; ctx.fillRect(x + 2, y + 2 + Math.random() * inner, inner, 1); }
  } else {
    const def = SQUAD_DEFS[SPEAKERS[who].unit];
    const talking = G.dialog && G.dialog.who === who && G.dialog.shown < G.dialog.s.length;
    const f = talking ? Math.floor(gt * 6) % 2 : 0;
    ctx.drawImage(I[def.img], f * 16, 0, 16, 16, x + Math.round((size - s) / 2), y + Math.round((size - s) / 2), s, s);
  }
  ctx.restore();
}

function dialogUp() { return !!G.dialog || G.dialogGap > 0; }
function drawDialog() {
  const d = G.dialog || (G.dialogGap > 0 ? G.lastDialog : null); if (!d) return;
  const sp = SPEAKERS[d.who];
  let w, h, x, y, tx, ty, chars;
  if (TALL) {
    w = VW - 8; chars = Math.floor((w - 12) / FW);
    if (!d.lines || d.lw !== chars) { d.lines = wrap(d.s, chars); d.lw = chars; }
    const ps = 36; h = ps + 10 + Math.max(4, d.lines.length) * 11 + 6;   // fixed height: the box never resizes between lines
    x = 4; y = VH - h - 6;
    panel(x, y, w, h, sp.color, 'rgba(6,8,30,0.96)');
    portrait(d.who, x + 5, y + 5, ps);
    text(sp.name, x + ps + 12, y + 9, sp.color);
    tx = x + 6; ty = y + ps + 10;
  } else {
    w = Math.min(VW - 16, 460); chars = Math.floor((w - 76) / FW);
    if (!d.lines || d.lw !== chars) { d.lines = wrap(d.s, chars); d.lw = chars; }
    h = Math.max(64, 26 + d.lines.length * 11); x = Math.round((VW - w) / 2); y = VH - h - 8;
    panel(x, y, w, h, sp.color, 'rgba(6,8,30,0.96)');
    portrait(d.who, x + 6, y + 6, 52);
    text(sp.name, x + 66, y + 6, sp.color);
    tx = x + 66; ty = y + 20;
  }
  let left = G.dialog ? Math.floor(d.shown) : d.s.length;
  for (let i = 0; i < d.lines.length && left > 0; i++) { const ln = d.lines[i]; text(ln.slice(0, left), tx, ty + i * 11, C.white); left -= ln.length + 1; }
  if (d.shown >= d.s.length && Math.floor(gt * 3) % 2) { ctx.fillStyle = sp.color; ctx.fillRect(x + w - 12, y + h - 9, 5, 2); ctx.fillRect(x + w - 11, y + h - 7, 3, 1); ctx.fillRect(x + w - 10, y + h - 6, 1, 1); }
  button('skip', x + w - 44, y + 5, 39, 15, 'SKIP', {});
}

// ---------- HUD ----------
const ORDER = ['reyes', 'okafor', 'haas', 'lin', 'vance'];
const HUD_BOTTOM = 4 + 30 + 2 + 30 + 2 + 15 + 2;   // action row + squad row + soldier strip
function hudMargins() { return { l: 4, r: 4, t: G.hudTop || 44, b: HUD_BOTTOM }; }
function squadList() { return ORDER.map(byKey).filter(u => u && u.side !== 'npc'); }
function iconBtn(id, x, y, w, h, kind, on) {
  panel(x, y, w, h, on ? C.cyan : '#2a3355');
  textC(kind === 'music' ? 'MUS' : 'SFX', x + w / 2, y + Math.round((h - FH) / 2) + 1, on ? C.white : '#4a5577');
  if (!on) { ctx.fillStyle = C.red; ctx.fillRect(x + 3, y + Math.round(h / 2), w - 6, 1); }
  hud.push({ id, x, y, w, h });
}
// pack health bars: overhead (12x4) for units, card bar (48x6, sliced to any width) for the HUD
function hpColorIdx(f) { return f > 0.5 ? 0 : f > 0.25 ? 1 : 2; }
function packBarSmall(cx, y, frac) {
  const ci = hpColorIdx(frac), x = Math.round(cx - 6); y = Math.round(y);
  ctx.drawImage(I.overheadbars, 2 + ci * 16, 22, 12, 4, x, y, 12, 4);
  const f = Math.max(0, Math.min(10, Math.round(10 * frac)));
  if (f < 10) { ctx.fillStyle = '#000'; ctx.fillRect(x + 1 + f, y + 1, 10 - f, 2); }
}
function packBarWide(x, y, w, frac) {
  const ci = hpColorIdx(frac), sx = ci * 48; x = Math.round(x); y = Math.round(y);
  ctx.drawImage(I.healthbars, sx, 5, 2, 6, x, y, 2, 6);
  ctx.drawImage(I.healthbars, sx + 2, 5, 44, 6, x + 2, y, w - 4, 6);
  ctx.drawImage(I.healthbars, sx + 46, 5, 2, 6, x + w - 2, y, 2, 6);
  const inner = w - 2, f = Math.max(0, Math.min(inner, Math.round(inner * frac)));
  if (f < inner) { ctx.fillStyle = '#000'; ctx.fillRect(x + 1 + f, y + 1, inner - f, 4); }
}
// icon over label, for the phone action bar
function sbutton(id, x, y, w, h, label, icon, opts = {}) {
  const dis = opts.disabled;
  panel(x, y, w, h, dis ? '#2a3355' : opts.active ? C.yellow : opts.hot ? C.green : C.cyan, opts.active ? 'rgba(60,50,10,0.95)' : C.panel);
  spr(I.icons, icon * 16, 16, 16, 16, x + Math.round((w - 16) / 2), y + 2, false, dis ? 0.3 : 1);
  textC(label, x + w / 2, y + h - 12, dis ? '#4a5577' : C.white);
  hud.push({ id, x, y, w, h, disabled: dis });
}
function actionDefs(s) {
  const can = s && hasActions(s) && !G.busy && G.state === 'player';
  const out = [{ id: 'fire', label: 'FIRE', icon: 0, disabled: !can, active: G.mode === 'fire' }];
  if (s && s.grenades !== undefined) out.push({ id: 'grenade', label: 'NADE ' + s.grenades, icon: 7, disabled: !can || s.grenades <= 0, active: G.mode === 'grenade' });
  else if (s && s.arty !== undefined) out.push({ id: 'arty', label: 'ARTY ' + s.arty, icon: 8, disabled: !can || s.arty <= 0, active: G.mode === 'arty' });
  else out.push({ id: 'none', label: '--', icon: 6, disabled: true });
  out.push({ id: 'overwatch', label: 'WATCH', icon: 4, disabled: !can });
  const anyLeft = soldiers().some(hasActions);
  out.push({ id: 'end', label: 'END', icon: 5, disabled: G.busy || G.state !== 'player', hot: !anyLeft && !G.busy && G.state === 'player' });
  return out;
}
function modeHint() {
  const s = G.sel; if (!s || G.state !== 'player' || G.busy) return null;
  const t = COARSE ? 'Tap' : 'Click', twice = COARSE ? ' twice' : '';
  if (G.mode === 'grenade') return t + ' a tile' + twice + ' to throw.';
  if (G.mode === 'arty') return t + ' a seen tile' + twice + ' to call it.';
  if (G.mode === 'fire') return t + ' a bracketed enemy' + twice + '.';
  return null;
}

function drawHUD() {
  hud = [];
  const playing = ['player', 'enemy', 'banner', 'cutscene'].includes(G.state);
  if (!playing) return;
  drawHUDTall();
}

function drawHUDTall() {
  const W = VW - 8, s = G.sel;
  // --- top bar: turn, phase, objective, toggles
  const ol = wrap(G.objective, Math.floor((W - 10) / FW));
  const topH = 17 + ol.length * 11;
  panel(4, 4, W, topH, C.cyan);
  text('T' + G.turn, 9, 6, C.yellow);
  let px = 9 + textW('T' + G.turn) + 6;
  const enemyPh = G.state === 'enemy';
  text(enemyPh ? 'ENEMY' : 'PLAYER', px, 6, enemyPh ? C.red : C.cyan); px += textW('PLAYER') + 6;
  if (G.phase === 'hold' && G.holdTurns > 0) text('DUSTOFF ' + G.holdTurns, px, 6, C.orange);
  else { const sc = String(G.scrap || 0); spr(I.icons, 0, 16, 16, 16, VW - 4 - 2 * 20 - 2 - 22 - textW(sc), 3, false); text(sc, VW - 4 - 2 * 20 - 2 - 4 - textW(sc), 6, C.yellow); }
  ol.forEach((l, i) => text(l, 9, 17 + i * 11, C.white));
  iconBtn('music', VW - 4 - 2 * 21 - 2, 4 + 2, 21, 15, 'music', !Audio2.muteMusic);
  iconBtn('sound', VW - 4 - 21 - 1, 4 + 2, 21, 15, 'sound', !Audio2.muteAll);
  G.hudTop = 4 + topH + 2;
  let ty = G.hudTop;
  // tip
  if (G.tip && G.state === 'player' && !dialogUp()) {
    G.tip.t += 1 / 60;
    if (G.tip.t > 24) G.tip = null;
    else {
      const lines = wrap(G.tip.s, Math.floor((W - 10) / FW)), h = lines.length * 11 + 17;
      ctx.globalAlpha = G.tip.t > 22 ? (24 - G.tip.t) / 2 : 1;
      panel(4, ty, W, h, C.yellow, 'rgba(30,24,4,0.94)');
      text('TIP', 9, ty + 3, C.yellow); text('[x]', 4 + W - 22, ty + 3, C.grey, false);
      lines.forEach((l, i) => text(l, 9, ty + 14 + i * 11, C.white));
      ctx.globalAlpha = 1;
      hud.push({ id: 'tipclose', x: 4, y: ty, w: W, h });
      ty += h + 2;
    }
  }
  // message log
  for (const m of G.msgs) { if (m.t > 6) continue; const ls = wrap(m.s, Math.floor((W - 4) / FW)); for (const l of ls) { text(l, 6, ty, m.color); ty += 11; } }

  if (dialogUp() || G.state === 'cutscene') { G.hudBottom = 8; return; }
  // --- bottom: action row, squad row, selected strip
  let by = VH - 4;
  const acts = actionDefs(s);
  const ah = 30, gap = 2, aw = Math.floor((W - gap * (acts.length - 1)) / acts.length);
  by -= ah;
  acts.forEach((a, i) => sbutton(a.id, 4 + i * (aw + gap), by, i === acts.length - 1 ? W - i * (aw + gap) : aw, ah, a.label, a.icon, a));
  // squad
  const sq = squadList(), sh = 30;
  by -= sh + 2;
  const cw = Math.floor((W - 2 * (sq.length - 1)) / sq.length);
  sq.forEach((u, i) => {
    const cx = 4 + i * (cw + 2), sel = G.sel === u, dead = !u.alive, ex = u.extracted;
    panel(cx, by, cw, sh, dead ? '#5a1a2a' : sel ? C.white : ex ? C.green : C.cyan, sel ? 'rgba(20,30,70,0.95)' : C.panel);
    const done = G.state === 'player' && !dead && !ex && !hasActions(u);
    spr(I.insignia, (u.shape + (sel ? 5 : 0)) * 24, u.rank * 24, 24, 24, cx + Math.round((cw - 24) / 2), by + 1, false, dead ? 0.25 : done ? 0.45 : 1);
    if (dead) textC('KIA', cx + cw / 2, by + 9, C.red);
    else if (ex) textC('OK', cx + cw / 2, by + 9, C.green);
    else if (u.downed) {
      if (Math.floor(gt * 3) % 2) spr(I.icons, 3 * 16, 16, 16, 16, cx + Math.round((cw - 16) / 2), by + 5);
      num(String(Math.max(0, u.bleed)), cx + cw - 10, by + sh - 10, 2);
    } else {
      packBarWide(cx + 3, by + sh - 7, cw - 6, u.hp / u.maxhp);
      if (u.overwatch) text('OW', cx + 2, by + 2, C.yellow, true);
      else if (G.state === 'player' && !u.acted) { ctx.fillStyle = C.yellow; ctx.fillRect(cx + cw - 5, by + 3, 2, 2); }
    }
    hud.push({ id: 'card', unit: u, x: cx, y: by, w: cw, h: sh });
  });
  // selected soldier strip / mode hint
  const hint = modeHint();
  if (s && G.state === 'player') {
    by -= 15;
    panel(4, by, W, 14, hint ? C.yellow : s.color);
    text(hint || `${s.short}  HP ${s.hp}/${s.maxhp}  AIM ${s.aim}  ${s.moved ? 'MOVED' : 'MV ' + s.mv}`, 8, by + 1, hint ? C.yellow : C.white);
  }
  G.hudBottom = VH - by + 2;
  if ((G.state === 'player' || G.state === 'enemy') && G.hover) drawHoverInfo(4, VH - G.hudBottom, W - 26);
  zoomButtons();
}

function drawHUDWide() {
  // top-left: turn + objective
  const objW = Math.min(250, VW - 140);
  const ol = wrap(G.objective, Math.floor((objW - 10) / FW));
  const objH = 18 + ol.length * 11;
  panel(4, 4, objW, objH, C.cyan);
  text('TURN ' + G.turn, 9, 6, C.yellow);
  const ph = G.state === 'enemy' ? 'ENEMY PHASE' : 'PLAYER PHASE';
  text(ph, 9 + textW('TURN ' + G.turn) + 10, 6, G.state === 'enemy' ? C.red : C.cyan);
  ol.forEach((l, i) => text(l, 9, 18 + i * 11, C.white));
  G.hudTop = 4 + objH + 2;
  if (G.phase === 'hold' && G.holdTurns > 0) {
    panel(4, G.hudTop, 100, 18, C.orange); text('DUSTOFF IN', 9, G.hudTop + 3, C.orange); num(String(G.holdTurns), 78, G.hudTop + 5, 4); G.hudTop += 20;
  }
  // squad cards (right)
  const sq = squadList();
  const cw = 104, chh = VH < 260 ? 26 : 30; let cy = 4; const cx = VW - cw - 4;
  for (const u of sq) {
    const sel = G.sel === u, dead = !u.alive, ex = u.extracted;
    panel(cx, cy, cw, chh, dead ? '#5a1a2a' : sel ? C.white : ex ? C.green : C.cyan, sel ? 'rgba(20,30,70,0.95)' : C.panel);
    spr(I.insignia, (u.shape + (sel ? 5 : 0)) * 24, u.rank * 24, 24, 24, cx + 3, cy + Math.round((chh - 24) / 2), false, dead ? 0.3 : 1);
    text(u.short, cx + 29, cy + 2, dead ? '#7a3a4a' : u.color);
    const ry = cy + chh - 11;
    if (dead) text('KIA', cx + 29, ry - 1, C.red);
    else if (ex) text('ABOARD', cx + 29, ry - 1, C.green);
    else {
      for (let i = 0; i < u.maxhp; i++) { ctx.fillStyle = C.ink; ctx.fillRect(cx + 29 + i * 5, ry, 5, 6); ctx.fillStyle = i < u.hp ? (u.hp <= 2 ? C.orange : C.green) : '#3a1020'; ctx.fillRect(cx + 30 + i * 5, ry + 1, 4, 4); }
      const st = u.overwatch ? 'OW' : u.acted ? 'DONE' : u.moved ? 'MOVED' : '';
      if (G.state === 'player') text(st, cx + cw - 5 - textW(st), cy + 2, u.overwatch ? C.yellow : C.grey, false);
    }
    hud.push({ id: 'card', unit: u, x: cx, y: cy, w: cw, h: chh });
    cy += chh + 2;
  }
  iconBtn('music', cx, cy + 1, 50, 16, 'music', !Audio2.muteMusic);
  iconBtn('sound', cx + 54, cy + 1, 50, 16, 'sound', !Audio2.muteAll);

  let my = VH - 100;
  for (let i = G.msgs.length - 1; i >= 0; i--) { const m = G.msgs[i]; if (m.t > 6) continue; text(m.s, VW - textW(m.s) - 8, my, m.color); my -= 12; }

  const s = G.sel;
  if (!G.dialog) {
    const acts = actionDefs(s);
    const bw = 64, bh = 30, gap = 3, total = acts.length * bw + (acts.length - 1) * gap;
    let bx = Math.round((VW - total) / 2); const by = VH - bh - 4;
    acts.forEach((a, i) => sbutton(a.id, bx + i * (bw + gap), by, bw, bh, a.label, a.icon, a));
    const hint = modeHint();
    if (s && G.state === 'player') {
      panel(bx, by - 16, total, 14, hint ? C.yellow : s.color);
      text(hint || `${s.name.toUpperCase()}  HP ${s.hp}/${s.maxhp}  AIM ${s.aim}`, bx + 5, by - 15, hint ? C.yellow : C.white);
    }
    if ((G.state === 'player' || G.state === 'enemy') && G.hover) drawHoverInfo(4, bx > 178 ? VH - 4 : by - 18, 168);
  }
  if (G.tip && G.state === 'player' && !G.dialog) {
    G.tip.t += 1 / 60;
    if (G.tip.t > 24) { G.tip = null; return; }
    const w = Math.min(264, VW - 140), lines = wrap(G.tip.s, Math.floor((w - 12) / FW)), h = lines.length * 11 + 20;
    const x = 4, y = G.hudTop;
    ctx.globalAlpha = G.tip.t > 22 ? (24 - G.tip.t) / 2 : 1;
    panel(x, y, w, h, C.yellow, 'rgba(30,24,4,0.94)');
    text('TIP', x + 5, y + 3, C.yellow); text('[x]', x + w - 22, y + 3, C.grey, false);
    hud.push({ id: 'tipclose', x, y, w, h });
    lines.forEach((l, i) => text(l, x + 5, y + 15 + i * 11, C.white));
    ctx.globalAlpha = 1;
  }
}

// info about the hovered / tapped tile. (x, bottomY, width)
function drawHoverInfo(x, bottom, w) {
  const t = G.hover; if (!t || !inb(t.x, t.y)) return;
  const u = unitAt(t.x, t.y);
  const chars = Math.floor((w - 10) / FW);
  const armed = G.armed && G.armed.x === t.x && G.armed.y === t.y;
  let lines = [], border = C.cyan;
  if (u && (u.side === 'player' || u.visible) && u.side !== 'npc') {
    const s = G.sel;
    if (u.side === 'enemy') {
      border = C.red;
      lines.push([u.name.toUpperCase() + `  HP ${u.hp}/${u.maxhp}  DMG ${u.dmg[0]}${u.dmg[1] > u.dmg[0] ? '-' + u.dmg[1] : ''}`, C.red]);
      lines.push([u.desc, C.grey]);
      if (s && G.state === 'player' && hasActions(s) && G.mode !== 'grenade' && G.mode !== 'arty') {
        if (canTarget(s, u)) {
          const hc = hitChance(s, u);
          lines.push([s.short + ' HIT CHANCE ' + hc.chance + '%', hc.chance >= 65 ? C.green : hc.chance >= 40 ? C.yellow : C.orange]);
          if (hc.notes.length) lines.push([hc.notes.join(', '), C.grey]);
          if (armed) lines.push(['TAP AGAIN TO FIRE', C.yellow]);
        } else lines.push([Math.hypot(u.x - s.x, u.y - s.y) > s.range ? 'OUT OF RANGE' : 'NO LINE OF SIGHT', C.orange]);
      }
    } else if (u.downed) {
      border = C.red;
      lines.push([u.name.toUpperCase() + '  DOWN', C.red]);
      lines.push([u.bleed > 1 ? 'Bleeds out in ' + u.bleed + ' turns.' : 'Bleeds out after this turn!', C.orange]);
      const sel = G.sel;
      if (sel && hasActions(sel) && mdist(sel, u) === 1) lines.push([armed ? 'TAP AGAIN TO REVIVE' : (COARSE ? 'Tap again to revive (+3 HP).' : 'Click to revive (+3 HP).'), C.yellow]);
      else lines.push(['Move a squadmate next to them to revive.', C.grey]);
    } else { lines.push([u.name.toUpperCase() + '  ' + u.role, u.color]); lines.push([`HP ${u.hp}/${u.maxhp}  AIM ${u.aim}  MOVE ${u.mv}`, C.white]); lines.push([u.perk, C.grey]); }
  } else {
    if (!explored[t.y][t.x]) return;
    const o = objAt[t.y][t.x];
    let name = ['Rough ground', 'Pavement', 'Road', 'Wall', 'Floor', 'Helipad', 'Parking lot', 'Dirt'][grid[t.y][t.x]];
    let cov = grid[t.y][t.x] === T.WALL ? 2 : 0;
    if (o) { name = { cache: 'Supplies', lamp: 'Street lamp', barrel: 'Fuel barrels', barrel1: 'Fuel barrel', desk: 'Desk', chair: 'Chair', junk: 'Office junk', crate: 'Crate', shelf: 'Shelf', cabinet: 'Cabinet' }[o.type] || (o.type.startsWith('car') || o.type.startsWith('burnt') ? 'Car' : o.type.startsWith('rock') ? 'Rubble' : 'Debris'); cov = OBJ[o.type].cover; }
    const s = G.sel;
    const n = s && G.mode === 'move' && G.reachMap ? G.reachMap.get(t.y * MW + t.x) : null;
    if (n && !n.occupied && n.d > 0) {
      const best = coverDirs(t.x, t.y).reduce((m, c) => Math.max(m, c.c), 0);
      lines.push(['MOVE ' + s.short + ' HERE' + (o && o.type === 'cache' ? '  (+15 SCRAP)' : ''), C.white]);
      lines.push([best === 2 ? 'Full cover next to you (-40 to enemy aim)' : best === 1 ? 'Half cover next to you (-20 to enemy aim)' : 'No cover here - exposed!', best ? C.green : C.orange]);
      if (armed) lines.push(['TAP AGAIN TO MOVE', C.yellow]);
    } else {
      lines.push([name.toUpperCase() + '  ' + (cov === 2 ? 'FULL COVER' : cov === 1 ? 'HALF COVER' : 'NO COVER'), cov ? C.cyan : C.white]);
      if (o && OBJ[o.type].explosive) lines.push(['Shoot it to detonate!', C.orange]);
      if (o && o.type === 'cache') lines.push(['SUPPLY CACHE: end a move here for +15 scrap.', C.yellow]);
    }
    if ((G.mode === 'grenade' || G.mode === 'arty') && s && abilityValid(s, t.x, t.y) && armed) lines.push([G.mode === 'grenade' ? 'TAP AGAIN TO THROW' : 'TAP AGAIN TO CALL STRIKE', C.yellow]);
  }
  const wrapped = []; for (const [l, c] of lines) for (const p of wrap(l, chars)) wrapped.push([p, c]);
  const h = wrapped.length * 11 + 6, y = bottom - h - 2;
  panel(x, y, w, h, border);
  wrapped.forEach(([l, c], i) => text(l, x + 5, y + 3 + i * 11, c));
}

function drawBanner() {
  const b = G.banner; if (!b) return;
  const k = b.t / b.dur; if (k >= 1) { G.banner = null; return; }
  const a = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
  const sc = textW(b.title) * 2 + 8 <= VW ? 2 : 1;
  const h = sc === 2 ? 46 : 36, y = Math.round(VH * 0.36);
  ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#05061a'; ctx.fillRect(0, y, VW, h);
  ctx.fillStyle = b.color; ctx.fillRect(0, y, VW, 1); ctx.fillRect(0, y + h - 1, VW, 1);
  ctx.globalAlpha = a;
  const slide = (1 - Math.min(1, k / 0.15)) * 40;
  bigText(b.title, VW / 2 + slide, y + 4, sc, b.color);
  if (b.sub) textC(b.sub, VW / 2 - slide, y + h - 15, C.white);
  ctx.globalAlpha = 1;
}

// ---------- title / end screens ----------
function linesC(arr, y, color, maxW = VW - 12) { for (const p of wrap(arr, Math.floor(maxW / FW))) { textC(p, VW / 2, y, color); y += 11; } return y; }
let titleScroll = 0;
function drawBackdrop(dark = 0.62) {
  titleScroll += 1 / 60;
  const m = Math.max(1, Math.ceil(VH / (MH * TS)));
  const vw = VW / m, vh = VH / m;
  const sx = Math.round((MW * TS - vw) * (0.5 + 0.5 * Math.sin(titleScroll / 14))), sy = Math.round((MH * TS - vh) * 0.5);
  ctx.save(); ctx.scale(m, m);
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, vw + 1, vh + 1);
  ctx.drawImage(mapCanvas, -sx, -sy);
  for (const o of objects) drawObj(o, sx, sy);
  ctx.restore();
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, 'rgba(3,4,22,0.92)'); g.addColorStop(0.45, `rgba(3,4,22,${dark})`); g.addColorStop(1, 'rgba(3,4,22,0.92)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  drawRain(1 / 60);
}
function scrapTag(cx, y) {
  const s = 'SCRAP ' + Save.data.scrap, w = textW(s) + 22, x = Math.round(cx - w / 2);
  spr(I.icons, 0, 16, 16, 16, x, y - 3); text(s, x + 20, y, C.yellow);
}
function drawTitle() {
  hud = [];
  drawBackdrop();
  const pulse = 0.5 + 0.5 * Math.sin(gt * 2.5);
  const ls = VW >= 220 ? 2 : 1, lw = 64 * ls, lx = Math.round(VW / 2 - lw / 2), ly = Math.round(VH * 0.08);
  const gl = ctx.createRadialGradient(VW / 2, ly + lw / 2, lw * 0.3, VW / 2, ly + lw / 2, lw * 0.95);
  gl.addColorStop(0, `rgba(21,198,166,${0.22 + pulse * 0.12})`); gl.addColorStop(1, 'rgba(21,198,166,0)');
  ctx.fillStyle = gl; ctx.fillRect(lx - lw, ly - lw / 2, lw * 3, lw * 2);
  panel(lx - 3, ly - 3, lw + 6, lw + 6, C.mint, '#05061a');
  ctx.drawImage(I.logo, 0, 0, 64, 64, lx, ly, lw, lw);
  let y = ly + lw + 12;
  const tsc = Math.max(1, Math.min(4, Math.floor((VW - 8) / (textW('ROBOT WARFARE') + 2))));
  bigText('ROBOT WARFARE', VW / 2, y, tsc, C.mint); y += 13 * tsc + 6;
  y = linesC('KESTREL SQUAD // MISSION 1', y, C.yellow);
  linesC('DEAD SIGNAL', y, C.white);
  const py = Math.round(VH * 0.6), sp = 26, n = 5, x0 = Math.round(VW / 2 - (n * sp + 40) / 2);
  ['leader', 'gunner', 'grenadier', 'sniper', 'radio'].forEach((k, i) => ctx.drawImage(I[k], (Math.floor(gt * 4 + i) % 2) * 16, 16, 16, 16, x0 + i * sp, py, 32, 32));
  ctx.save(); ctx.translate(x0 + n * sp + 40, py); ctx.scale(-1, 1); ctx.drawImage(I.spider, (Math.floor(gt * 8) % 2) * 16, 0, 16, 16, 0, 0, 32, 32); ctx.restore();
  const bw = Math.min(150, VW - 40), bx = Math.round(VW / 2 - bw / 2);
  let by = Math.round(VH * 0.72);
  if (G.state === 'waitaudio') { textC('LOADING AUDIO...', VW / 2, by + 6, C.white); }
  else {
    button('deploy', bx, by, bw, 22, 'DEPLOY', { active: pulse > 0.5 });
    button('barracks', bx, by + 26, bw, 20, 'BARRACKS', {});
  }
  if (Save.data.scrap > 0 || Save.data.runs > 0) scrapTag(VW / 2, by + 56);
  const help = COARSE ? 'Tap to preview, tap again to act. Drag to pan, pinch to zoom.' : 'Click to act. Wheel or +/- to zoom. Right-drag or WASD to pan.';
  let hy = linesC(help, VH - 46, C.grey);
  linesC(COARSE ? 'Sound on (silent mode off) for voices + music' : 'Sound on for voices + music', hy + 1, '#4a5a8a');
}

// ---------- barracks: spend scrap on squad upgrades ----------
function drawBarracks() {
  hud = [];
  drawBackdrop(0.82);
  const W = VW - 8;
  const hsc = textW('BARRACKS') * 2 + 8 <= W ? 2 : 1;
  bigText('BARRACKS', VW / 2, 8, hsc, C.mint);
  scrapTag(VW / 2, 12 + 13 * hsc);
  // squad tabs
  const keys = Object.keys(SQUAD_DEFS).filter(k => SQUAD_DEFS[k].role);
  const ty = 30 + 13 * hsc, tw = Math.floor((W - 2 * (keys.length - 1)) / keys.length);
  keys.forEach((k, i) => {
    const d = SQUAD_DEFS[k], x = 4 + i * (tw + 2), sel = G.bsel === k;
    panel(x, ty, tw, 30, sel ? C.white : C.cyan, sel ? 'rgba(20,30,70,0.95)' : C.panel);
    spr(I.insignia, (d.shape + (sel ? 5 : 0)) * 24, d.rank * 24, 24, 24, x + Math.round((tw - 24) / 2), ty + 3);
    hud.push({ id: 'tab', key: k, x, y: ty, w: tw, h: 30 });
  });
  // soldier detail
  const k = G.bsel, d = SQUAD_DEFS[k], st = statsFor(k), L = Save.data.up[k];
  let y = ty + 36;
  const perkLines = wrap(d.perk, Math.floor((W - 54) / FW));
  const dh = Math.max(48, 30 + perkLines.length * 11);
  panel(4, y, W, dh, d.color);
  portrait(k, 8, y + 4, 40);
  text(d.name.toUpperCase(), 54, y + 5, d.color);
  text(d.role, 54, y + 16, C.grey);
  perkLines.forEach((l, i) => text(l, 54, y + 28 + i * 11, C.white));
  y += dh + 4;
  // upgrade rows
  for (const up of UPGRADES) {
    const lvl = L[up.id], maxed = lvl >= up.max, cost = maxed ? 0 : up.cost[lvl];
    const next = maxed ? null : (() => { Save.data.up[k][up.id]++; const n = statsFor(k); Save.data.up[k][up.id]--; return n; })();
    const label = up.id === 'dmg' && d.shots >= 4 ? 'ROUNDS' : up.label;
    panel(4, y, W, 30, C.cyan);
    text(label, 9, y + 4, C.white);
    let v = statText(st, up.id); if (next) v += ' > ' + statText(next, up.id);
    text(v, 9, y + 16, next ? C.green : C.grey);
    for (let i = 0; i < up.max; i++) { ctx.fillStyle = C.ink; ctx.fillRect(9 + textW(label) + 6 + i * 7, y + 6, 6, 6); ctx.fillStyle = i < lvl ? C.yellow : '#2a3355'; ctx.fillRect(10 + textW(label) + 6 + i * 7, y + 7, 4, 4); }
    const bw = 58, bx = 4 + W - bw - 4;
    if (maxed) { panel(bx, y + 5, bw, 20, '#2a3355'); textC('MAX', bx + bw / 2, y + 10, C.grey); }
    else {
      const can = Save.data.scrap >= cost;
      panel(bx, y + 5, bw, 20, can ? C.yellow : '#2a3355', can ? 'rgba(40,32,4,0.95)' : C.panel);
      spr(I.icons, 0, 16, 16, 16, bx + 3, y + 7, false, can ? 1 : 0.35);
      text(String(cost), bx + 22, y + 10, can ? C.white : '#4a5577');
      hud.push({ id: 'buy', stat: up.id, x: bx, y: y + 5, w: bw, h: 20, disabled: !can });
    }
    y += 32;
  }
  // footer
  const fy = VH - 30;
  button('deploy', 4, fy, Math.round(W * 0.6), 24, 'DEPLOY', { active: true });
  button('back', 8 + Math.round(W * 0.6), fy, W - Math.round(W * 0.6) - 4, 24, 'BACK', {});
  if (y + 18 < fy) { button('reset', VW / 2 - 50, fy - 22, 100, 16, G.resetArmed ? 'TAP TO CONFIRM' : 'RESET SAVE', {}); }
  if (G.bmsg && G.bmsg.t > 0) { G.bmsg.t -= 1 / 60; textC(G.bmsg.s, VW / 2, fy - 36, C.green); }
}

function drawEnd() {
  const win = G.state === 'win';
  ctx.fillStyle = 'rgba(3,4,22,0.8)'; ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(340, VW - 12), h = 226, x = Math.round((VW - w) / 2), y = Math.max(4, Math.round((VH - h) / 2) - 8);
  panel(x, y, w, h, win ? C.green : C.red);
  const title = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
  const sc = textW(title) * 2 + 12 <= w ? 2 : 1;
  bigText(title, VW / 2, y + 8, sc, win ? C.green : C.red);
  textC('DEAD SIGNAL', VW / 2, y + 12 + 13 * sc, C.yellow);
  const sq = units.filter(u => SQUAD_DEFS[u.key]);
  const extracted = sq.filter(u => u.extracted).length;
  const acc = G.stats.shots ? Math.round(G.stats.hits / G.stats.shots * 100) : 0;
  const rows = [
    ['Turns', G.turn], ['Robots destroyed', G.stats.kills], ['Accuracy', acc + '%'],
    ['Extracted', extracted + ' / ' + sq.filter(u => u.side === 'player').length],
    ['Burrower', G.flags.burrowerKilled ? 'DESTROYED' : G.centipede ? 'ESCAPED' : 'NOT SEEN'],
  ];
  const pad = Math.min(24, Math.round(w * 0.07));
  rows.forEach(([a, b], i) => { text(a, x + pad, y + 54 + i * 13, C.grey); text(String(b), x + w - pad - textW(String(b)), y + 54 + i * 13, C.white); });
  sq.forEach((u, i) => {
    const px = x + w / 2 - sq.length * 26 / 2 + i * 26;
    spr(I.insignia, u.shape * 24, u.rank * 24, 24, 24, px, y + 122, false, u.alive ? 1 : 0.25);
    textC(u.alive ? (u.extracted ? 'OK' : '--') : 'KIA', px + 12, y + 146, u.alive ? C.green : C.red, false);
  });
  if (G.earned) {
    const e = G.earned, line = 'SCRAP +' + e.total + (e.bonus ? '  (' + e.kills + ' + ' + e.bonus + ' bonus)' : '');
    spr(I.icons, 0, 16, 16, 16, x + w / 2 - (textW(line) + 20) / 2, y + 158); text(line, x + w / 2 - (textW(line) + 20) / 2 + 20, y + 161, C.yellow);
  }
  if (win) linesC('Mission 2 - coming soon', y + 176, C.cyan, w - 12);
  hud = [];
  const bw = Math.floor((w - 20) / 3);
  button('again', x + 5, y + h - 26, bw, 20, win ? 'AGAIN' : 'RETRY');
  button('barracks', x + 10 + bw, y + h - 26, bw, 20, 'UPGRADE');
  button('credits', x + w - 5 - bw, y + h - 26, bw, 20, 'CREDITS');
}
let showCredits = false;
function drawCredits() {
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, VW, VH);
  const blocks = [
    ['CREDITS', C.yellow],
    ['Pixel art: Robot Warfare Asset Pack by Matt Walkden (CC0) - mattwalkden.itch.io', C.white],
    ['Voices: Super Dialogue Audio Pack v1 by Dillon Becker. Performed by Ian Lampert, Sean Lenhart, Alex Brodie, Meghan Christian and Karen Cenon. Licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0). Clips trimmed and converted.', C.grey],
    ['Sound effects: 400 Sounds Pack, 96 Extra SFX', C.white],
    ['Music: MIDI tracks (Military Base, Dark Factory, Battle Theme, The Evil One, Malicious Scheme) played live through an in-browser chiptune synth.', C.grey],
    ['Game code, design + writing: built with Claude', C.white],
    [COARSE ? 'Tap to close' : 'Click to close', C.cyan],
  ];
  let y = 14;
  for (const [l, c] of blocks) { y = linesC(l, y, c) + 8; }
}

// ---------- atmosphere ----------
// light rain over the city (atmosphere)
const RAIN = [];
function drawRain(dt) {
  if (RAIN.length === 0) for (let i = 0; i < 70; i++) RAIN.push({ x: Math.random() * 400, y: Math.random() * 800, v: 160 + Math.random() * 90, l: 4 + Math.random() * 5 });
  ctx.strokeStyle = 'rgba(150,200,255,0.18)'; ctx.lineWidth = 1; ctx.beginPath();
  for (const r of RAIN) {
    r.y += r.v * dt; r.x -= r.v * 0.25 * dt;
    if (r.y > VH + 10) { r.y = -10; r.x = Math.random() * (VW + 60); }
    if (r.x < -10) r.x += VW + 20;
    ctx.moveTo(Math.round(r.x) + 0.5, Math.round(r.y)); ctx.lineTo(Math.round(r.x + r.l * 0.25) + 0.5, Math.round(r.y - r.l));
  }
  ctx.stroke();
}
function drawFlash(dt) {
  if (!(G.flash > 0)) return;
  ctx.fillStyle = `rgba(255,240,210,${Math.min(0.55, G.flash * 2.2)})`; ctx.fillRect(0, 0, VW, VH);
  G.flash -= dt;
}
function drawRotate() {
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, VW, VH);
  const cy = Math.round(VH / 2 - 30);
  if (I.logo) ctx.drawImage(I.logo, 0, 0, 64, 64, Math.round(VW / 2 - 32), cy - 40, 64, 64);
  spr(I.arrows, (Math.floor(gt * 2) % 2 ? 4 : 5) * 16, 0, 16, 16, VW / 2 - 8, cy + 30);
  textC('TURN YOUR PHONE UPRIGHT', VW / 2, cy + 52, C.yellow);
  textC('Robot Warfare plays in portrait', VW / 2, cy + 66, C.grey);
}
function zoomButtons() {
  // small +/- stack on the right edge, just above the bottom HUD
  if (dialogUp() || G.state === 'cutscene') return;
  const x = VW - 24, y = VH - HUD_BOTTOM - 46;
  for (const [id, lbl, dy] of [['zoomin', '+', 0], ['zoomout', '-', 22]]) {
    panel(x, y + dy, 20, 20, C.cyan, 'rgba(8,10,34,0.85)');
    textC(lbl, x + 10, y + dy + 5, C.white);
    hud.push({ id, x, y: y + dy, w: 20, h: 20 });
  }
}

// ---------- input processing ----------
function handleInput(dt) {
  // camera keys
  const pan = 220 * dt;
  if (keys.KeyW || keys.ArrowUp) { cam.y -= pan; cam.follow = null; }
  if (keys.KeyS || keys.ArrowDown) { cam.y += pan; cam.follow = null; }
  if (keys.KeyA || keys.ArrowLeft) { cam.x -= pan; cam.follow = null; }
  if (keys.KeyD || keys.ArrowRight) { cam.x += pan; cam.follow = null; }
  if (pressed('KeyM')) { Audio2.muteMusic = !Audio2.muteMusic; Audio2.musGain && (Audio2.musGain.gain.value = Audio2.muteMusic ? 0 : 0.22); }
  if (pressed('KeyN')) { Audio2.muteAll = !Audio2.muteAll; Audio2.master && (Audio2.master.gain.value = Audio2.muteAll ? 0 : 0.9); }

  // hover tile
  if (mouse.inside && !mouse.touch) {
    const [wx, wy] = hudToWorld(mouse.x, mouse.y); const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    const onHud = hudHit(mouse.x, mouse.y);
    const nh = inb(tx, ty) && !onHud ? { x: tx, y: ty } : null;
    if (nh && (!G.hover || G.hover.x !== nh.x || G.hover.y !== nh.y) && G.state === 'player' && G.sel && G.reachMap && G.reachMap.has(ty * MW + tx)) Audio2.play('hover', 0.08, 1.5);
    G.hover = nh;
  }

  if (ROTATE) { clicks.length = 0; return; }
  if (G.state === 'barracks') {
    for (const c of clicks) {
      const b = hudHit(c.x, c.y); if (!b) continue;
      if (b.id !== 'reset') G.resetArmed = false;
      if (b.id === 'tab') { G.bsel = b.key; Audio2.play('select', 0.35); Audio2.voice(SQUAD_DEFS[b.key].voice, 'sel'); }
      else if (b.id === 'buy') {
        const L = Save.data.up[G.bsel], up = UPGRADES.find(u => u.id === b.stat), cost = up.cost[L[b.stat]];
        if (b.disabled || L[b.stat] >= up.max || Save.data.scrap < cost) { Audio2.play('disallow', 0.35); continue; }
        Save.data.scrap -= cost; L[b.stat]++; Save.write();
        Audio2.play('complete', 0.5); Audio2.play('equip', 0.35); Audio2.voice(SQUAD_DEFS[G.bsel].voice, 'go');
        G.bmsg = { s: SQUAD_DEFS[G.bsel].short + ': ' + (b.stat === 'dmg' && SQUAD_DEFS[G.bsel].shots >= 4 ? 'ROUNDS' : up.label) + ' UP', t: 1.5 };
      }
      else if (b.id === 'deploy') { startMission(); break; }
      else if (b.id === 'back') { G.state = 'title'; Audio2.play('cancel', 0.3); }
      else if (b.id === 'reset') { if (G.resetArmed) { Save.reset(); G.resetArmed = false; G.bmsg = { s: 'SAVE RESET', t: 1.5 }; } else G.resetArmed = true; }
    }
    clicks.length = 0; return;
  }
  if (G.state === 'title') {
    if (clicks.length || pressed('Space') || pressed('Enter')) {
      Audio2.unlock();
      if (!Music.cur && Audio2.ctx) Music.play('title');
      const b = clicks.length ? hudHit(clicks[clicks.length - 1].x, clicks[clicks.length - 1].y) : { id: 'deploy' };
      clicks.length = 0;
      if (b && b.id === 'barracks') { G.state = 'barracks'; G.bsel = G.bsel || 'reyes'; Audio2.play('select', 0.4); return; }
      if (!b || b.id !== 'deploy') return;
      // Android: go fullscreen and pin portrait (iOS ignores both; the rotate screen covers it)
      try { if (COARSE && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait')).catch(() => {}); } catch (e) {}
      const go = () => startMission();
      if (Audio2.ready) go(); else { G.state = 'waitaudio'; const iv = setInterval(() => { if (Audio2.ready || gt > 8) { clearInterval(iv); go(); } }, 100); }
    }
    return;
  }
  if (showCredits) { if (clicks.length || pressed('Escape')) { clicks.length = 0; showCredits = false; } return; }
  if (G.state === 'win' || G.state === 'lose') {
    for (const c of clicks) { const b = hudHit(c.x, c.y); if (!b) continue; if (b.id === 'again') startMission(); if (b.id === 'barracks') { stopMissionAudio(); Music.play('title'); G.state = 'barracks'; G.bsel = G.bsel || 'reyes'; } if (b.id === 'credits') showCredits = true; }
    clicks.length = 0; return;
  }
  if (G.dialog) {
    if (pressed('Escape')) { skipping = true; const d = G.dialog; G.dialog = null; d.res(); }
    for (const c of clicks) {
      const b = hudHit(c.x, c.y);
      if (b && b.id === 'skip') { skipping = true; const d = G.dialog; if (d) { G.dialog = null; d.res(); } break; }
      if (b && b.id === 'music') { pressedToggle('KeyM'); continue; }
      if (b && b.id === 'sound') { pressedToggle('KeyN'); continue; }
      advanceDialog();
    }
    if (pressed('Space') || pressed('Enter')) advanceDialog();
    clicks.length = 0; return;
  }
  if (G.state !== 'player') { for (const c of clicks) { const b = hudHit(c.x, c.y); if (!b) continue; if (b.id === 'music') pressedToggle('KeyM'); if (b.id === 'sound') pressedToggle('KeyN'); if (b.id === 'zoomin') setZoom(WS + 1); if (b.id === 'zoomout') setZoom(WS - 1); } clicks.length = 0; return; }
  if (G.busy) { clicks.length = 0; return; }
  skipping = false;
  const s = G.sel;
  if (pressed('Tab')) nextSoldier(true);
  if (pressed('Space') || pressed('Enter')) { endPlayerTurn(); return; }
  if (pressed('Escape')) { if (G.mode !== 'move') G.mode = 'move'; else { G.sel = null; G.reachMap = null; } }
  if (pressed('Digit1') && s && hasActions(s)) G.mode = G.mode === 'fire' ? 'move' : 'fire';
  if (pressed('Digit2') && s && hasActions(s)) { if (s.grenades > 0) G.mode = G.mode === 'grenade' ? 'move' : 'grenade'; else if (s.arty > 0) G.mode = G.mode === 'arty' ? 'move' : 'arty'; else { Audio2.play('disallow', 0.3); Audio2.voice(s.voice, 'no'); } }
  if (pressed('Digit3') && s && hasActions(s)) setOverwatch(s);

  for (const c of clicks) {
    const b = hudHit(c.x, c.y);
    if (b) {
      G.armed = null;
      if (b.disabled) { Audio2.play('disallow', 0.3); continue; }
      if (b.id === 'card' && b.unit.alive && b.unit.downed) { camTo(b.unit.x * TS + 8, b.unit.y * TS + 8); G.hover = { x: b.unit.x, y: b.unit.y }; }
      else if (b.id === 'card' && b.unit.alive && !b.unit.extracted) selectUnit(b.unit);
      else if (b.id === 'fire') G.mode = G.mode === 'fire' ? 'move' : 'fire';
      else if (b.id === 'grenade') G.mode = G.mode === 'grenade' ? 'move' : 'grenade';
      else if (b.id === 'arty') G.mode = G.mode === 'arty' ? 'move' : 'arty';
      else if (b.id === 'overwatch' && s) setOverwatch(s);
      else if (b.id === 'end') endPlayerTurn();
      else if (b.id === 'music') pressedToggle('KeyM');
      else if (b.id === 'sound') pressedToggle('KeyN');
      else if (b.id === 'tipclose') G.tip = null;
      else if (b.id === 'zoomin') setZoom(WS + 1);
      else if (b.id === 'zoomout') setZoom(WS - 1);
      Audio2.play('toggle', 0.25);
      continue;
    }
    const [cwx, cwy] = hudToWorld(c.x, c.y); const tx = Math.floor(cwx / TS), ty = Math.floor(cwy / TS);
    if (!inb(tx, ty)) continue;
    if (c.right) { if (G.mode !== 'move') G.mode = 'move'; else { G.sel = null; G.reachMap = null; Audio2.play('cancel', 0.3); } continue; }
    G.hover = { x: tx, y: ty };
    const u = unitAt(tx, ty);
    if (u && u.side === 'player' && !u.downed && G.mode !== 'grenade' && G.mode !== 'arty') { G.armed = null; if (u !== s) selectUnit(u); continue; }
    const act = worldAction(s, tx, ty, u);
    if (!act) {
      G.armed = null;
      if (s && (u && u.side === 'enemy' && u.visible)) { Audio2.play('disallow', 0.3); if (!c.touch) Audio2.voice(s.voice, 'no'); }
      else if (s && !c.touch) Audio2.play('disallow', 0.25);
      continue;
    }
    // phones: first tap previews, second tap on the same tile confirms
    if (c.touch && !(G.armed && G.armed.x === tx && G.armed.y === ty && G.armed.mode === G.mode && G.armed.sel === s)) {
      G.armed = { x: tx, y: ty, mode: G.mode, sel: s };
      Audio2.play('hover', 0.3, 1.3);
      continue;
    }
    G.armed = null;
    act();
  }
  clicks.length = 0;
}
function pressedToggle(code) { keys['_' + code] = true; }
function stopMissionAudio() { try { G.ambient && G.ambient.s.stop(); } catch (e) {} G.ambient = null; }
function startMission() { Music.stop(0.4); stopMissionAudio(); showCredits = false; skipping = false; newGame(); runIntro(); }
// what tapping (tx,ty) would do for the selected soldier; returns a function or null
function worldAction(s, tx, ty, u) {
  if (!s || !s.alive) return null;
  if (G.mode === 'grenade' || G.mode === 'arty') return abilityValid(s, tx, ty) ? () => playerAbility(s, tx, ty) : null;
  if (u && u.side === 'player' && u.downed) return (hasActions(s) && mdist(s, u) === 1) ? () => playerRevive(s, u) : null;
  if (u && u.side === 'enemy' && u.visible) return (hasActions(s) && canTarget(s, u)) ? () => playerAttack(s, u) : null;
  const o = objAt[ty][tx];
  if (o && OBJ[o.type].explosive && hasActions(s) && G.vis[ty][tx] && Math.hypot(tx - s.x, ty - s.y) <= s.range && los(s.x, s.y, tx, ty))
    return () => playerAttack(s, { isObj: true, obj: o, x: tx, y: ty, alive: true, flip: false });
  if (G.reachMap) { const n = G.reachMap.get(ty * MW + tx); if (n && !n.occupied && n.d > 0) return () => playerMove(s, n); }
  return null;
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  let ts = window.__speed || 1;
  if (G.slowmo > 0) { G.slowmo -= raw; ts *= 0.3; }
  const dt = raw * ts;
  gt += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (gt >= timers[i].t) { const t = timers[i]; timers.splice(i, 1); t.res(); }
  handleInput(dt);
  // animations
  for (const u of units) { u.anim.t += dt; if (u.hitFlash > 0) u.hitFlash -= dt * 4; if (u.alertT > 0) u.alertT -= dt; }
  updateFX(dt);
  if (G.dialogGap > 0) G.dialogGap -= dt;
  if (G.wash) {
    const w = G.wash; w.t += dt;
    if (w.leaving) w.lt = (w.lt || 0) + dt;
    const rate = w.leaving ? Math.max(0, 1 - w.lt / 2.5) : Math.min(1, w.t / 0.6);
    if (rate <= 0 && w.leaving) G.wash = null;
    else {
      w.acc = (w.acc || 0) + dt * 40 * rate;
      while (w.acc >= 1) {
        w.acc--;
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 46;
        fx('smoke', w.x + Math.cos(a) * r, w.y + Math.sin(a) * r * 0.6 + 4, { scale: Math.random() < 0.6 ? 2 : 3, alpha: 0.85 });
      }
      if (!w.leaving && Math.random() < dt * 3) fx('smallfrag', w.x + rint(-30, 30), w.y + rint(-16, 16));
    }
  }
  if (G.banner) G.banner.t += dt;
  for (let i = G.bubbles.length - 1; i >= 0; i--) { G.bubbles[i].t += dt; if (G.bubbles[i].t > G.bubbles[i].dur) G.bubbles.splice(i, 1); }
  for (const m of G.msgs) m.t += dt;
  if (G.dialog) {
    const d = G.dialog; const before = Math.floor(d.shown);
    d.shown = Math.min(d.s.length, d.shown + dt * 52);
    if (Math.floor(d.shown) !== before && Math.floor(d.shown) % 2 === 0 && d.s[Math.floor(d.shown)] !== ' ') Audio2.blip(SPEAKERS[d.who].pitch);
  }
  if (G.autoEndT > 0 && G.state === 'player' && !G.busy && !G.dialog) { G.autoEndT -= dt; if (G.autoEndT <= 0) { G.autoEndT = 0; if (soldiers().every(u => !hasActions(u))) endPlayerTurn(); } }
  // camera
  { const k = HS / WS, m0 = hudMargins(); const m = { l: m0.l * k, r: m0.r * k, t: m0.t * k, b: m0.b * k };
    const cxo = (m.l + WVW - m.r) / 2, cyo = (m.t + WVH - m.b) / 2;
    if (cam.follow) { const tx = cam.follow.x - cxo, ty = cam.follow.y - cyo; cam.x += (tx - cam.x) * Math.min(1, dt * 6); cam.y += (ty - cam.y) * Math.min(1, dt * 6); }
    const minX = -m.l - 8, maxX = Math.max(minX, MW * TS - WVW + m.r + 8), minY = -m.t - 4, maxY = Math.max(minY, MH * TS - WVH + m.b + 4);
    cam.x = Math.max(minX, Math.min(maxX, cam.x)); cam.y = Math.max(minY, Math.min(maxY, cam.y)); }
  if (cam.shake > 0) { cam.sx = (Math.random() - 0.5) * cam.shake * 2; cam.sy = (Math.random() - 0.5) * cam.shake * 2; cam.shake = Math.max(0, cam.shake - dt * 12); } else { cam.sx = cam.sy = 0; }

  // render
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (ROTATE) { ctx.setTransform(HS, 0, 0, HS, 0, 0); drawRotate(); }
  else if (G.state === 'title' || G.state === 'waitaudio' || G.state === 'loading') { ctx.setTransform(HS, 0, 0, HS, 0, 0); if (I.font && mapCanvas) drawTitle(); }
  else if (G.state === 'barracks') { ctx.setTransform(HS, 0, 0, HS, 0, 0); drawBarracks(); }
  else {
    ctx.setTransform(WS, 0, 0, WS, 0, 0);
    drawWorld();
    ctx.setTransform(HS, 0, 0, HS, 0, 0);
    drawRain(dt); drawFlash(dt);
    drawHUD(); drawBanner(); drawDialog();
    if (G.state === 'win' || G.state === 'lose') drawEnd();
    if (showCredits) drawCredits();
  }
  ctx.setTransform(HS, 0, 0, HS, 0, 0);
  if (I.pointer && mouse.inside && !mouse.touch) spr(I.pointer, 0, 0, 16, 16, mouse.x - 1, mouse.y - 1);
  requestAnimationFrame(frame);
}

// boot
loadImages().then(() => {
  buildMap();
  G.state = 'title';
  window.__G = G;
  requestAnimationFrame(frame);
});
