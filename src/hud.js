'use strict';
// ============================================================
// HUD: dialogue, banners, squad bar, action buttons, info panel
// ============================================================

const SPEAKERS = {
  overwatch: { name: 'OVERWATCH', color: '#5ad8ff', pitch: 180 },
  reyes: { name: 'SGT. REYES', color: '#ffd23f', pitch: 330, unit: 'reyes' },
  okafor: { name: 'CPL. OKAFOR', color: '#ff9a1a', pitch: 170, unit: 'okafor' },
  haas: { name: 'PVT. HAAS', color: '#3ee03e', pitch: 230, unit: 'haas' },
  lin: { name: 'SPC. LIN', color: '#7fe3ff', pitch: 390, unit: 'lin' },
  vance: { name: 'PVT. VANCE', color: '#c58bff', pitch: 260, unit: 'vance' },
  mercer: { name: 'CPL. MERCER', color: '#9be15d', pitch: 200, unit: 'mercer' },
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

let hud = [];

function button(id, x, y, w, h, label, opts = {}) {
  const hov = mouse.inside && mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h;
  const dis = opts.disabled;
  panel(x, y, w, h, dis ? '#2a3355' : opts.active ? C.yellow : hov ? C.mint : C.cyan, opts.active ? 'rgba(60,50,10,0.95)' : C.panel);
  let tx = x + 5;
  if (opts.icon !== undefined) { spr(I.icons, opts.icon * 16, 16, 16, 16, x + 2, y + Math.floor((h - 16) / 2), false, dis ? 0.35 : 1); tx = x + 20; }
  if (opts.center) textC(label, x + w / 2, y + Math.floor((h - FH) / 2) + 1, dis ? '#4a5577' : C.white);
  else text(label, tx, y + Math.floor((h - FH) / 2) + 1, dis ? '#4a5577' : C.white);
  hud.push({ id, x, y, w, h, disabled: dis, ...(opts.data || {}) });
  return hov;
}

function hudHit(x, y) { for (let i = hud.length - 1; i >= 0; i--) { const b = hud[i]; if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b; } return null; }

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
  const w = VW - 8, chars = Math.floor((w - 12) / FW);
  if (!d.lines || d.lw !== chars) { d.lines = wrap(d.s, chars); d.lw = chars; }
  const ps = 36, h = ps + 10 + Math.max(4, d.lines.length) * 11 + 6;   // fixed height: the box never resizes between lines
  const x = 4, y = VH - h - 6;
  panel(x, y, w, h, sp.color, 'rgba(6,8,30,0.96)');
  portrait(d.who, x + 5, y + 5, ps);
  text(sp.name, x + ps + 12, y + 9, sp.color);
  const tx = x + 6, ty = y + ps + 10;
  let left = G.dialog ? Math.floor(d.shown) : d.s.length;
  for (let i = 0; i < d.lines.length && left > 0; i++) { const ln = d.lines[i]; text(ln.slice(0, left), tx, ty + i * 11, C.white); left -= ln.length + 1; }
  if (d.shown >= d.s.length && Math.floor(gt * 3) % 2) { ctx.fillStyle = sp.color; ctx.fillRect(x + w - 12, y + h - 9, 5, 2); ctx.fillRect(x + w - 11, y + h - 7, 3, 1); ctx.fillRect(x + w - 10, y + h - 6, 1, 1); }
  button('skip', x + w - 44, y + 5, 39, 15, 'SKIP', {});
}

const HUD_BOTTOM = 4 + 30 + 2 + 30 + 2 + 15 + 2;   // action row + squad row + soldier strip

function hudMargins() { return { l: 4, r: 4, t: G.hudTop || 44, b: HUD_BOTTOM }; }

function squadList() { return SQUAD_ORDER.map(byKey).filter(u => u && u.side !== 'npc'); }

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
  else if (s && s.rockets !== undefined) out.push({ id: 'rocket', label: 'RKT ' + s.rockets, icon: 1, disabled: !can || s.rockets <= 0, active: G.mode === 'rocket' });
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
  if (G.mode === 'rocket') return t + ' a target' + twice + ' to fire.';
  if (G.mode === 'fire') return t + ' a bracketed enemy' + twice + '.';
  return null;
}

function drawHUD() {
  hud = [];
  if (!['player', 'enemy', 'banner', 'cutscene'].includes(G.state)) return;
  const W = VW - 8, s = G.sel;
  // --- top bar: turn, phase, objective, toggles
  const ol = wrap(G.objective, Math.floor((W - 10) / FW));
  const topH = 17 + ol.length * 11;
  panel(4, 4, W, topH, C.cyan);
  text('T' + G.turn, 9, 6, C.yellow);
  let px = 9 + textW('T' + G.turn) + 6;
  const enemyPh = G.state === 'enemy';
  text(enemyPh ? 'ENEMY' : 'PLAYER', px, 6, enemyPh ? C.red : C.cyan); px += textW('PLAYER') + 6;
  const counter = G.mission.counter && G.mission.counter();
  if (counter) text(counter, px, 6, C.orange);
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
  // undo the last move (left side, mirrors the zoom buttons)
  if (G.undo && G.state === 'player' && !G.busy) {
    const ux = 4, uy = VH - HUD_BOTTOM - 24;
    panel(ux, uy, 40, 20, C.yellow, 'rgba(30,24,4,0.9)'); textC('UNDO', ux + 20, uy + 5, C.white);
    hud.push({ id: 'undo', x: ux, y: uy, w: 40, h: 20 });
  }
  if (G.state === 'enemy' && G.ff) textC('>> FAST', VW / 2, VH - HUD_BOTTOM - 20, C.yellow);
  drawObjectiveArrow();
}

// pack arrow at the screen edge pointing at an off-screen objective
function drawObjectiveArrow() {
  const tg = G.mission.target && G.mission.target();
  if (!tg || G.state !== 'player' || dialogUp()) return;
  const k = WS / HS, px = (tg.x * TS + 8 - cam.x) * k, py = (tg.y * TS + 8 - cam.y) * k;
  const top = G.hudTop + 4, bot = VH - HUD_BOTTOM - 4;
  if (px > 10 && px < VW - 10 && py > top && py < bot) return;
  const cx = VW / 2, cy = (top + bot) / 2, a = Math.atan2(py - cy, px - cx);
  const ex = Math.max(14, Math.min(VW - 14, cx + Math.cos(a) * 1000)), ey = Math.max(top + 10, Math.min(bot - 10, cy + Math.sin(a) * 1000));
  // pick the closest of the 8 small arrows in the pack sheet (col 4-5, rows 0-3)
  const dirs = [[4, 2, 0], [4, 0, 45], [5, 2, 90], [5, 0, 135], [4, 3, 180], [5, 1, 225], [5, 3, 270], [4, 1, 315]];
  const deg = (a * 180 / Math.PI + 360) % 360;
  const d = dirs.reduce((b, c) => Math.abs(((c[2] - deg + 540) % 360) - 180) < Math.abs(((b[2] - deg + 540) % 360) - 180) ? c : b);
  const bob = Math.sin(gt * 6) * 2;
  spr(I.arrows, d[0] * 16, (8 + d[1]) * 16, 16, 16, ex - 8 + Math.cos(a) * bob, ey - 8 + Math.sin(a) * bob);
}

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
      if (s && G.state === 'player' && hasActions(s) && G.mode !== 'grenade' && G.mode !== 'arty' && G.mode !== 'rocket') {
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
    const iaHere = s && hasActions(s) && G.mission.interact && G.mission.interact(s, t.x, t.y);
    const n = !iaHere && s && G.mode === 'move' && G.reachMap ? G.reachMap.get(t.y * MW + t.x) : null;
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
    if ((G.mode === 'grenade' || G.mode === 'arty' || G.mode === 'rocket') && s && abilityValid(s, t.x, t.y) && armed) lines.push([{ grenade: 'TAP AGAIN TO THROW', arty: 'TAP AGAIN TO CALL STRIKE', rocket: 'TAP AGAIN TO FIRE ROCKET' }[G.mode], C.yellow]);
    const ia = s && hasActions(s) && G.mission.interact && G.mission.interact(s, t.x, t.y);
    if (ia) lines.push([armed ? 'TAP AGAIN TO ' + ia.label : (COARSE ? 'Tap again: ' : 'Click: ') + ia.label.toLowerCase(), C.yellow]);
    else if (G.mission.id === 2 && G.holes && G.holes.some(h => h.x === t.x && h.y === t.y && h.open)) lines.push([G.holes.find(h => h.x === t.x && h.y === t.y).charged ? 'Charge set. Blows next turn.' : 'BURROW HOLE: stand next to it to plant a charge.', C.orange]);
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
