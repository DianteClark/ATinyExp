'use strict';
// ============================================================
// SCREENS: title, campaign, loadout, barracks, results, ending, credits
// All screens draw in HUD pixels; every tappable thing is pushed into `hud`.
// ============================================================

function linesC(str, y, color, maxW = VW - 12) { for (const p of wrap(str, Math.floor(maxW / FW))) { textC(p, VW / 2, y, color); y += 11; } return y; }
function fitBig(s, maxW, max = 4) { return Math.max(1, Math.min(max, Math.floor(maxW / (textW(s) + 2)))); }

// slowly drifting mission map behind every menu
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
  drawWeather(1 / 60, menuMission().weather);
}
function menuMission() { return MISSIONS[G.msel || 0]; }
function scrapTag(cx, y) {
  const s = 'SCRAP ' + Save.data.scrap, w = textW(s) + 22, x = Math.round(cx - w / 2);
  spr(I.icons, 0, 16, 16, 16, x, y - 3); text(s, x + 20, y, C.yellow);
}
// a medal = the pack's star insignia; purple when earned, faded when not
function medal(x, y, got) { spr(I.insignia, 4 * 24, 8 * 24, 24, 24, x, y, false, got ? 1 : 0.18); }
function header(title, y = 8) {
  const sc = fitBig(title, VW - 8, 2);
  bigText(title, VW / 2, y, sc, C.mint);
  return y + 13 * sc + 4;
}
function missionUnlocked(i) { return i === 0 || !!Save.data.cleared[MISSIONS[i - 1].key]; }
// switch the menu backdrop (and loadout preview) to a mission's map
function showMissionMap(i) { if (G.mapFor !== i) { G.msel = i; buildMap(MISSIONS[i]); G.mapFor = i; } }

// ---------- title ----------
function drawTitle() {
  hud = [];
  drawBackdrop();
  const pulse = 0.5 + 0.5 * Math.sin(gt * 2.5);
  const ls = VW >= 220 ? 2 : 1, lw = 64 * ls, lx = Math.round(VW / 2 - lw / 2), ly = Math.round(VH * 0.07);
  const gl = ctx.createRadialGradient(VW / 2, ly + lw / 2, lw * 0.3, VW / 2, ly + lw / 2, lw * 0.95);
  gl.addColorStop(0, `rgba(21,198,166,${0.22 + pulse * 0.12})`); gl.addColorStop(1, 'rgba(21,198,166,0)');
  ctx.fillStyle = gl; ctx.fillRect(lx - lw, ly - lw / 2, lw * 3, lw * 2);
  panel(lx - 3, ly - 3, lw + 6, lw + 6, C.mint, '#05061a');
  ctx.drawImage(I.logo, 0, 0, 64, 64, lx, ly, lw, lw);
  let y = ly + lw + 12;
  const tsc = fitBig('ROBOT WARFARE', VW - 8);
  bigText('ROBOT WARFARE', VW / 2, y, tsc, C.mint); y += 13 * tsc + 6;
  linesC('KESTREL SQUAD', y, C.yellow);
  // squad marching toward a spider, 2x
  const py = Math.round(VH * 0.55), sp = 24, keys = ['leader', 'gunner', 'grenadier', 'sniper', 'radio', 'antitank'], x0 = Math.round(VW / 2 - (keys.length * sp + 34) / 2);
  keys.forEach((k, i) => ctx.drawImage(I[k], (Math.floor(gt * 4 + i) % 2) * 16, 16, 16, 16, x0 + i * sp, py, 32, 32));
  ctx.save(); ctx.translate(x0 + keys.length * sp + 34, py); ctx.scale(-1, 1); ctx.drawImage(I.spider, (Math.floor(gt * 8) % 2) * 16, 0, 16, 16, 0, 0, 32, 32); ctx.restore();
  const bw = Math.min(150, VW - 40), bx = Math.round(VW / 2 - bw / 2);
  const by = Math.round(VH * 0.67);
  if (G.state === 'waitaudio') textC('LOADING AUDIO...', VW / 2, by + 6, C.white);
  else {
    button('play', bx, by, bw, 24, 'PLAY', { active: pulse > 0.5, center: true });
    button('barracks', bx, by + 28, bw, 20, 'BARRACKS', { center: true });
    button('credits', bx, by + 52, bw, 18, 'CREDITS', { center: true });
  }
  if (Save.data.scrap > 0 || Save.data.runs > 0) scrapTag(VW / 2, by + 80);
  const help = COARSE ? 'Tap to preview, tap again to act. Drag to pan, pinch to zoom.' : 'Click to act. Wheel or +/- to zoom. Right-drag or WASD to pan.';
  const hy = linesC(help, VH - 46, C.grey);
  linesC(COARSE ? 'Sound on (silent mode off) for voices + music' : 'Sound on for voices + music', hy + 1, '#4a5a8a');
}

// ---------- campaign: pick a mission ----------
function drawCampaign() {
  hud = [];
  drawBackdrop(0.8);
  let y = header('CAMPAIGN');
  scrapTag(VW / 2, y + 2); y += 16;
  const W = VW - 8;
  MISSIONS.forEach((m, i) => {
    const open = missionUnlocked(i), cleared = Save.data.cleared[m.key], got = Save.data.medals[m.key] || [];
    const blurb = wrap(m.blurb, Math.floor((W - 12) / FW)).slice(0, 4);
    const h = 30 + blurb.length * 11 + 6;
    const sel = G.msel === i;
    panel(4, y, W, h, !open ? '#2a3355' : sel ? C.yellow : cleared ? C.green : C.cyan, sel ? 'rgba(40,32,4,0.95)' : C.panel);
    text('MISSION ' + m.id, 10, y + 4, open ? C.yellow : '#4a5577');
    text(m.name, 10, y + 15, open ? C.white : '#4a5577');
    if (open) { for (let k = 0; k < 3; k++) medal(4 + W - 80 + k * 25, y + 2, got[k]); blurb.forEach((l, j) => text(l, 10, y + 28 + j * 11, C.grey)); }
    else textC('LOCKED: clear mission ' + (i) + ' first', VW / 2, y + 30, '#4a5577');
    hud.push({ id: 'mission', i, x: 4, y, w: W, h, disabled: !open });
    y += h + 4;
  });
  const fy = VH - 30;
  button('barracks', 4, fy, Math.round(W * 0.55), 24, 'BARRACKS', { center: true });
  button('back', 8 + Math.round(W * 0.55), fy, W - Math.round(W * 0.55) - 4, 24, 'BACK', { center: true });
}

// ---------- loadout: briefing, map preview, squad picker ----------
function loadoutRoster(m) { return SQUAD_ORDER.filter(k => m.squad.fixed ? m.squad.fixed.includes(k) : rosterUnlocked(k)); }
function defaultSquad(m) {
  if (m.squad.fixed) return m.squad.fixed.slice();
  const pool = loadoutRoster(m), pick = (m.squad.required || []).slice();
  const prev = (Save.data.squad || []).filter(k => pool.includes(k) && !pick.includes(k));
  for (const k of [...prev, ...pool]) if (pick.length < m.squad.size && !pick.includes(k)) pick.push(k);
  return pick;
}
function drawLoadout() {
  hud = [];
  const m = MISSIONS[G.msel];
  drawBackdrop(0.86);
  const W = VW - 8;
  text('MISSION ' + m.id, 6, 6, C.yellow);
  let y = header(m.name, 18);
  // map preview with start, pad and objective markers
  const mw = W, mh = Math.round(W * MH / MW), sc = mw / (MW * TS);
  panel(3, y - 1, mw + 2, mh + 2, C.cyan, '#05061a');
  ctx.drawImage(mapCanvas, 0, 0, MW * TS, MH * TS, 4, y, mw, mh);
  const dot = (tx, ty, col, r = 3) => { ctx.fillStyle = C.ink; ctx.fillRect(Math.round(4 + (tx + 0.5) * TS * sc) - r, Math.round(y + (ty + 0.5) * TS * sc) - r, r * 2, r * 2); ctx.fillStyle = col; ctx.fillRect(Math.round(4 + (tx + 0.5) * TS * sc) - r + 1, Math.round(y + (ty + 0.5) * TS * sc) - r + 1, r * 2 - 2, r * 2 - 2); };
  for (const [sx0, sy0] of m.start) dot(sx0, sy0, C.green, 2);
  if (m.pad) dot(m.pad[0] + 1.5, m.pad[1] + 1.5, C.mint, 4);
  if (m.id === 2) for (const [hx, hy] of HOLES2) dot(hx, hy, Math.floor(gt * 3) % 2 ? C.orange : C.red, 3);
  if (m.id === 3) dot(CONSOLE3.x, CONSOLE3.y, Math.floor(gt * 3) % 2 ? C.orange : C.red, 3);
  if (m.id === 1) dot(6, 4, C.yellow, 3);
  y += mh + 6;
  for (const l of wrap(m.blurb, Math.floor((W - 4) / FW))) { text(l, 6, y, C.white); y += 11; }
  y += 4;
  // squad picker
  const roster = loadoutRoster(m), size = m.squad.fixed ? m.squad.fixed.length : m.squad.size;
  text('SQUAD ' + G.loadout.length + '/' + size + (m.squad.fixed ? '  (fixed)' : ''), 6, y, C.yellow); y += 13;
  const cw = Math.floor((W - 2 * (SQUAD_ORDER.length - 1)) / SQUAD_ORDER.length);
  SQUAD_ORDER.forEach((k, i) => {
    const d = SQUAD_DEFS[k], x = 4 + i * (cw + 2), avail = roster.includes(k), on = G.loadout.includes(k), req = (m.squad.required || []).includes(k);
    panel(x, y, cw, 40, !avail ? '#2a3355' : on ? C.green : C.cyan, on ? 'rgba(10,40,20,0.95)' : C.panel);
    spr(I.insignia, (d.shape + (on ? 5 : 0)) * 24, d.rank * 24, 24, 24, x + Math.round((cw - 24) / 2), y + 2, false, avail ? (on ? 1 : 0.5) : 0.15);
    textC(avail ? (req ? 'REQ' : d.short.slice(0, Math.floor((cw - 2) / FW))) : '?', x + cw / 2, y + 27, avail ? (on ? C.white : C.grey) : '#3a4466', false);
    hud.push({ id: 'pick', key: k, x, y, w: cw, h: 40, disabled: !avail || !!m.squad.fixed || req });
  });
  y += 44;
  // medals for this mission
  const got = Save.data.medals[m.key] || [];
  m.medals.forEach((md, i) => { if (y + 12 > VH - 34) return; medal(4, y - 6, got[i]); text(md.name, 30, y, got[i] ? C.white : C.grey); y += 12; });
  const fy = VH - 30;
  const ok = G.loadout.length > 0;
  button('deploy', 4, fy, Math.round(W * 0.6), 24, 'DEPLOY', { active: ok, disabled: !ok, center: true });
  button('back', 8 + Math.round(W * 0.6), fy, W - Math.round(W * 0.6) - 4, 24, 'BACK', { center: true });
}

// ---------- barracks: spend scrap on squad upgrades ----------
function drawBarracks() {
  hud = [];
  drawBackdrop(0.82);
  const W = VW - 8;
  let ty = header('BARRACKS');
  scrapTag(VW / 2, ty + 2); ty += 14;
  const keys = SQUAD_ORDER, tw = Math.floor((W - 2 * (keys.length - 1)) / keys.length);
  keys.forEach((k, i) => {
    const d = SQUAD_DEFS[k], x = 4 + i * (tw + 2), sel = G.bsel === k, open = rosterUnlocked(k);
    panel(x, ty, tw, 30, sel ? C.white : C.cyan, sel ? 'rgba(20,30,70,0.95)' : C.panel);
    spr(I.insignia, (d.shape + (sel ? 5 : 0)) * 24, d.rank * 24, 24, 24, x + Math.round((tw - 24) / 2), ty + 3, false, open ? 1 : 0.25);
    hud.push({ id: 'tab', key: k, x, y: ty, w: tw, h: 30 });
  });
  const k = G.bsel, d = SQUAD_DEFS[k], st = statsFor(k), L = Save.data.up[k], open = rosterUnlocked(k);
  let y = ty + 36;
  const perkLines = wrap(open ? d.perk : 'Joins the squad after Mission 1.', Math.floor((W - 54) / FW));
  const dh = Math.max(48, 30 + perkLines.length * 11);
  panel(4, y, W, dh, d.color);
  portrait(k, 8, y + 4, 40);
  text(d.name.toUpperCase(), 54, y + 5, d.color);
  text(d.role, 54, y + 16, C.grey);
  perkLines.forEach((l, i) => text(l, 54, y + 28 + i * 11, open ? C.white : C.orange));
  y += dh + 4;
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
  const fy = VH - 30;
  button('play', 4, fy, Math.round(W * 0.6), 24, 'TO CAMPAIGN', { active: true, center: true });
  button('back', 8 + Math.round(W * 0.6), fy, W - Math.round(W * 0.6) - 4, 24, 'BACK', { center: true });
  if (y + 18 < fy) button('reset', VW / 2 - 50, fy - 22, 100, 16, G.resetArmed ? 'TAP TO CONFIRM' : 'RESET SAVE', { center: true });
  if (G.bmsg && G.bmsg.t > 0) { G.bmsg.t -= 1 / 60; textC(G.bmsg.s, VW / 2, fy - 36, C.green); }
}

// ---------- results ----------
function drawEnd() {
  const win = G.state === 'win', M = G.mission;
  ctx.fillStyle = 'rgba(3,4,22,0.82)'; ctx.fillRect(0, 0, VW, VH);
  const w = Math.min(340, VW - 12), h = 250, x = Math.round((VW - w) / 2), y = Math.max(4, Math.round((VH - h) / 2) - 8);
  panel(x, y, w, h, win ? C.green : C.red);
  const title = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
  const sc = textW(title) * 2 + 12 <= w ? 2 : 1;
  bigText(title, VW / 2, y + 8, sc, win ? C.green : C.red);
  textC('MISSION ' + M.id + ': ' + M.name, VW / 2, y + 12 + 13 * sc, C.yellow);
  const sq = units.filter(u => SQUAD_DEFS[u.key] && u.side !== 'npc');
  const acc = G.stats.shots ? Math.round(G.stats.hits / G.stats.shots * 100) : 0;
  const pad = Math.min(20, Math.round(w * 0.06));
  let ry = y + 52;
  for (const [a, b] of [['Turns', G.turn], ['Robots destroyed', G.stats.kills], ['Accuracy', acc + '%']]) {
    text(a, x + pad, ry, C.grey); text(String(b), x + w - pad - textW(String(b)), ry, C.white); ry += 12;
  }
  ry += 4;
  M.medals.forEach((md, i) => {
    const got = G.medals && G.medals.got[i], fresh = G.medals && G.medals.fresh[i];
    medal(x + pad - 4, ry - 6, got);
    text(md.name, x + pad + 22, ry, got ? C.white : C.grey);
    if (fresh) text('NEW +15', x + w - pad - textW('NEW +15'), ry, C.yellow);
    else if (!got) text(md.desc.length * FW < w - pad * 2 - 120 ? md.desc : '', x + w - pad - textW(md.desc), ry, '#4a5577', false);
    ry += 14;
  });
  ry += 2;
  sq.forEach((u, i) => {
    const px = x + w / 2 - sq.length * 26 / 2 + i * 26;
    spr(I.insignia, u.shape * 24, u.rank * 24, 24, 24, px, ry, false, u.alive ? 1 : 0.25);
    textC(u.alive ? (u.extracted ? 'OK' : '--') : 'KIA', px + 12, ry + 24, u.alive ? C.green : C.red, false);
  });
  ry += 38;
  if (G.earned) {
    const e = G.earned, s = 'SCRAP +' + e.total + (e.bonus ? '  (' + e.kills + ' + ' + e.bonus + ' bonus)' : '');
    const sx = x + w / 2 - (textW(s) + 20) / 2;
    spr(I.icons, 0, 16, 16, 16, sx, ry - 3); text(s, sx + 20, ry, C.yellow);
  }
  hud = [];
  const bw = Math.floor((w - 20) / 3), byy = y + h - 26;
  const hasNext = win && MISSIONS[M.id];
  button(win ? (M.final ? 'ending' : 'next') : 'again', x + 5, byy, bw, 20, win ? (M.final ? 'ENDING' : 'NEXT') : 'RETRY', { center: true, active: win });
  button('barracks', x + 10 + bw, byy, bw, 20, 'UPGRADE', { center: true });
  button('menu', x + w - 5 - bw, byy, bw, 20, 'MENU', { center: true });
  void hasNext;
}

// ---------- ending: epilogue crawl ----------
const ENDING = [
  ['MERIDIAN IS QUIET', C.mint, 2], ['', ''],
  ['The kill switch went out at 03:12.', C.white], ['Every bug in the city stopped', C.white], ['where it stood.', C.white], ['', ''],
  ['The Burrower tunnels were sealed', C.grey], ['by the end of the week.', C.grey], ['', ''],
  ['Kestrel Squad', C.yellow], ['', ''],
  ['@squad', ''], ['', ''], ['', ''],
  ['THE END', C.mint, 2], ['', ''], ['', ''],
  ['Pixel art: Matt Walkden (CC0)', C.white], ['Voices: Super Dialogue Audio Pack', C.white], ['by Dillon Becker (CC BY 4.0)', C.grey],
  ['Sound: 400 Sounds Pack, 96 Extra SFX', C.white], ['Music: MIDI pack, chiptune synth', C.white], ['', ''],
  ['Thanks for playing.', C.yellow],
];
function drawEnding(dt) {
  hud = [];
  drawBackdrop(0.85);
  G.endY = (G.endY === undefined ? VH : G.endY) - dt * 18;
  let y = Math.round(G.endY);
  for (const [l, c, big] of ENDING) {
    if (l === '@squad') {
      const keys = SQUAD_ORDER.filter(k => SQUAD_DEFS[k]);
      keys.forEach((k, i) => { const d = SQUAD_DEFS[k]; ctx.drawImage(I[d.img], (Math.floor(gt * 3 + i) % 2) * 16, 0, 16, 16, VW / 2 - 70, y + i * 22, 32, 32); text(d.name, VW / 2 - 30, y + i * 22 + 10, d.color); });
      y += keys.length * 22; continue;
    }
    if (big) { bigText(l, VW / 2, y, fitBig(l, VW - 8, big), c); y += 13 * big + 4; }
    else { if (l) textC(l, VW / 2, y, c); y += 12; }
  }
  if (y < VH * 0.4) G.endY = VH;   // loop the crawl
  button('menu', VW - 58, 6, 52, 18, 'MENU', { center: true });
}

// ---------- credits ----------
let showCredits = false;
function drawCredits() {
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, VW, VH);
  const blocks = [
    ['CREDITS', C.yellow],
    ['Pixel art: Robot Warfare Asset Pack by Matt Walkden (CC0) - mattwalkden.itch.io', C.white],
    ['Voices: Super Dialogue Audio Pack v1 by Dillon Becker. Performed by Ian Lampert, Sean Lenhart, Alex Brodie, Meghan Christian and Karen Cenon. Licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0). Clips trimmed and converted.', C.grey],
    ['Sound effects: 400 Sounds Pack, 96 Extra SFX', C.white],
    ['Music: MIDI tracks played live through an in-browser chiptune synth.', C.grey],
    ['Game code, design + writing: built with Claude', C.white],
    [COARSE ? 'Tap to close' : 'Click to close', C.cyan],
  ];
  let y = 14;
  for (const [l, c] of blocks) y = linesC(l, y, c) + 8;
}

// ---------- phone held sideways ----------
function drawRotate() {
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, VW, VH);
  const cy = Math.round(VH / 2 - 30);
  if (I.logo) ctx.drawImage(I.logo, 0, 0, 64, 64, Math.round(VW / 2 - 32), cy - 40, 64, 64);
  spr(I.arrows, (Math.floor(gt * 2) % 2 ? 4 : 5) * 16, 0, 16, 16, VW / 2 - 8, cy + 30);
  textC('TURN YOUR PHONE UPRIGHT', VW / 2, cy + 52, C.yellow);
  textC('Robot Warfare plays in portrait', VW / 2, cy + 66, C.grey);
}
