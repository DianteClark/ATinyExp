'use strict';
// ============================================================
// MAIN: input routing per screen, main loop, boot
// ============================================================

function pressedToggle(code) { keys['_' + code] = true; }
function stopMissionAudio() { try { G.ambient && G.ambient.s.stop(); } catch (e) {} G.ambient = null; }
function goMenu(state) {
  stopMissionAudio(); showCredits = false;
  if (Music.cur !== 'title') Music.play('title');
  G.state = state; G.endY = undefined;
  if (G.msel === undefined) G.msel = 0;
  showMissionMap(G.msel);
}
function openLoadout(i) {
  showMissionMap(i);
  G.loadout = defaultSquad(MISSIONS[i]);
  G.state = 'loadout';
}
function startMission(i = G.msel, squad = G.loadout) {
  const m = MISSIONS[i];
  if (!m.squad.fixed) { Save.data.squad = squad.slice(); Save.write(); }
  Music.stop(0.4); stopMissionAudio(); showCredits = false; skipping = false;
  G.msel = i; G.mapFor = -1; G.lastSquad = squad.slice();
  newGame(m, squad);
  runMission();
}
// Android: go fullscreen and pin portrait (iOS ignores both; the rotate screen covers it)
function tryFullscreen() {
  try { if (COARSE && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait')).catch(() => {}); } catch (e) {}
}

// ---------- menus ----------
function menuInput() {
  for (const c of clicks) {
    const b = hudHit(c.x, c.y); if (!b) continue;
    if (b.disabled) { Audio2.play('disallow', 0.3); continue; }
    Audio2.play('toggle', 0.25);
    if (G.state === 'title') {
      if (b.id === 'play') {
        tryFullscreen();
        const next = MISSIONS.findIndex((m, i) => missionUnlocked(i) && !Save.data.cleared[m.key]);   // first unfinished mission
        G.msel = next < 0 ? MISSIONS.length - 1 : next;
        goMenu('campaign');
      }
      else if (b.id === 'barracks') { goMenu('barracks'); G.bsel = G.bsel || 'reyes'; }
      else if (b.id === 'credits') showCredits = true;
    } else if (G.state === 'campaign') {
      if (b.id === 'mission') { if (G.msel === b.i) openLoadout(b.i); else { showMissionMap(b.i); Audio2.play('select', 0.35); } }
      else if (b.id === 'barracks') { G.state = 'barracks'; G.bsel = G.bsel || 'reyes'; }
      else if (b.id === 'back') G.state = 'title';
    } else if (G.state === 'loadout') {
      const m = MISSIONS[G.msel];
      if (b.id === 'pick') {
        const on = G.loadout.indexOf(b.key);
        if (on >= 0) G.loadout.splice(on, 1);
        else if (G.loadout.length < m.squad.size) { G.loadout.push(b.key); Audio2.voice(SQUAD_DEFS[b.key].voice, 'sel', true, SQUAD_DEFS[b.key].voiceRate); }
        else Audio2.play('disallow', 0.3);
        G.loadout.sort((a, c2) => SQUAD_ORDER.indexOf(a) - SQUAD_ORDER.indexOf(c2));
      }
      else if (b.id === 'deploy') { startMission(G.msel, G.loadout); return; }
      else if (b.id === 'back') G.state = 'campaign';
    } else if (G.state === 'barracks') {
      if (b.id !== 'reset') G.resetArmed = false;
      if (b.id === 'tab') { G.bsel = b.key; Audio2.voice(SQUAD_DEFS[b.key].voice, 'sel', false, SQUAD_DEFS[b.key].voiceRate); }
      else if (b.id === 'buy') {
        const L = Save.data.up[G.bsel], up = UPGRADES.find(u => u.id === b.stat), cost = up.cost[L[b.stat]];
        if (L[b.stat] >= up.max || Save.data.scrap < cost) { Audio2.play('disallow', 0.35); continue; }
        Save.data.scrap -= cost; L[b.stat]++; Save.write();
        Audio2.play('complete', 0.5); Audio2.play('equip', 0.35); Audio2.voice(SQUAD_DEFS[G.bsel].voice, 'go', false, SQUAD_DEFS[G.bsel].voiceRate);
        G.bmsg = { s: SQUAD_DEFS[G.bsel].short + ': ' + (b.stat === 'dmg' && SQUAD_DEFS[G.bsel].shots >= 4 ? 'ROUNDS' : up.label) + ' UP', t: 1.5 };
      }
      else if (b.id === 'play') goMenu('campaign');
      else if (b.id === 'back') G.state = 'title';
      else if (b.id === 'reset') { if (G.resetArmed) { Save.reset(); G.resetArmed = false; G.bmsg = { s: 'SAVE RESET', t: 1.5 }; } else G.resetArmed = true; }
    } else if (G.state === 'ending') {
      if (b.id === 'menu') goMenu('title');
    }
  }
  clicks.length = 0;
}

// ---------- in a mission ----------
function missionInput() {
  if (G.state === 'win' || G.state === 'lose') {
    for (const c of clicks) {
      const b = hudHit(c.x, c.y); if (!b) continue;
      Audio2.play('toggle', 0.25);
      if (b.id === 'again') startMission(G.msel, G.lastSquad);
      else if (b.id === 'next') { goMenu('campaign'); openLoadout(Math.min(MISSIONS.length - 1, G.msel + 1)); }
      else if (b.id === 'ending') { stopMissionAudio(); G.state = 'ending'; G.endY = undefined; Music.play('ending'); }
      else if (b.id === 'barracks') { goMenu('barracks'); G.bsel = G.bsel || 'reyes'; }
      else if (b.id === 'menu') goMenu('campaign');
    }
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
  if (G.state !== 'player') {
    for (const c of clicks) {
      const b = hudHit(c.x, c.y);
      if (!b) { if (G.state === 'enemy') G.ff = true; continue; }   // tap during the enemy turn: fast-forward
      if (b.id === 'music') pressedToggle('KeyM'); if (b.id === 'sound') pressedToggle('KeyN');
      if (b.id === 'zoomin') setZoom(WS + 1); if (b.id === 'zoomout') setZoom(WS - 1);
    }
    if (G.state === 'enemy' && pressed('Space')) G.ff = true;
    clicks.length = 0; return;
  }
  if (G.busy) { clicks.length = 0; return; }
  skipping = false;
  const s = G.sel;
  if (pressed('Tab')) nextSoldier(true);
  if (pressed('Space') || pressed('Enter')) { endPlayerTurn(); return; }
  if (pressed('KeyZ')) undoMove();
  if (pressed('Escape')) { if (G.mode !== 'move') G.mode = 'move'; else { G.sel = null; G.reachMap = null; } }
  if (pressed('Digit1') && s && hasActions(s)) G.mode = G.mode === 'fire' ? 'move' : 'fire';
  if (pressed('Digit2') && s && hasActions(s)) {
    const ab = s.grenades > 0 ? 'grenade' : s.arty > 0 ? 'arty' : s.rockets > 0 ? 'rocket' : null;
    if (ab) G.mode = G.mode === ab ? 'move' : ab; else Audio2.play('disallow', 0.3);
  }
  if (pressed('Digit3') && s && hasActions(s)) setOverwatch(s);

  for (const c of clicks) {
    const b = hudHit(c.x, c.y);
    if (b) {
      G.armed = null;
      if (b.disabled) { Audio2.play('disallow', 0.3); continue; }
      if (b.id === 'card' && b.unit.alive && b.unit.downed) { camTo(b.unit.x * TS + 8, b.unit.y * TS + 8); G.hover = { x: b.unit.x, y: b.unit.y }; }
      else if (b.id === 'card' && b.unit.alive && !b.unit.extracted) selectUnit(b.unit);
      else if (['fire', 'grenade', 'arty', 'rocket'].includes(b.id)) G.mode = G.mode === b.id ? 'move' : b.id;
      else if (b.id === 'overwatch' && s) setOverwatch(s);
      else if (b.id === 'end') endPlayerTurn();
      else if (b.id === 'undo') undoMove();
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
    if (u && u.side === 'player' && !u.downed && G.mode === 'move') { G.armed = null; if (u !== s) selectUnit(u); continue; }
    const act = worldAction(s, tx, ty, u);
    if (!act) {
      G.armed = null;
      if (s && u && u.side === 'enemy' && u.visible) { Audio2.play('disallow', 0.3); if (!c.touch) Audio2.voice(s.voice, 'no', false, s.voiceRate); }
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

// what tapping (tx, ty) would do for the selected soldier; returns a function or null
function worldAction(s, tx, ty, u) {
  if (!s || !s.alive) return null;
  if (G.mode === 'grenade' || G.mode === 'arty' || G.mode === 'rocket') return abilityValid(s, tx, ty) ? () => playerAbility(s, tx, ty) : null;
  if (u && u.side === 'player' && u.downed) return (hasActions(s) && mdist(s, u) === 1) ? () => playerRevive(s, u) : null;
  if (u && u.side === 'enemy' && u.visible) return (hasActions(s) && canTarget(s, u)) ? () => playerAttack(s, u) : null;
  const ia = hasActions(s) && G.mission.interact && G.mission.interact(s, tx, ty);
  if (ia) return () => playerInteract(s, ia);
  const o = objAt[ty][tx];
  if (o && OBJ[o.type].explosive && hasActions(s) && G.vis[ty][tx] && Math.hypot(tx - s.x, ty - s.y) <= s.range && los(s.x, s.y, tx, ty))
    return () => playerAttack(s, { isObj: true, obj: o, x: tx, y: ty, alive: true, flip: false });
  if (G.reachMap) { const n = G.reachMap.get(ty * MW + tx); if (n && !n.occupied && n.d > 0) return () => playerMove(s, n); }
  return null;
}

function handleInput(dt) {
  const pan = 220 * dt;
  if (keys.KeyW || keys.ArrowUp) { cam.y -= pan; cam.follow = null; }
  if (keys.KeyS || keys.ArrowDown) { cam.y += pan; cam.follow = null; }
  if (keys.KeyA || keys.ArrowLeft) { cam.x -= pan; cam.follow = null; }
  if (keys.KeyD || keys.ArrowRight) { cam.x += pan; cam.follow = null; }
  if (pressed('KeyM')) { Audio2.muteMusic = !Audio2.muteMusic; Audio2.musGain && (Audio2.musGain.gain.value = Audio2.muteMusic ? 0 : 0.22); }
  if (pressed('KeyN')) { Audio2.muteAll = !Audio2.muteAll; Audio2.master && (Audio2.master.gain.value = Audio2.muteAll ? 0 : 0.9); }
  // mouse hover (phones use the last tapped tile instead)
  if (mouse.inside && !mouse.touch && G.mission && MENUS.indexOf(G.state) < 0) {
    const [wx, wy] = hudToWorld(mouse.x, mouse.y); const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    const nh = inb(tx, ty) && !hudHit(mouse.x, mouse.y) ? { x: tx, y: ty } : null;
    if (nh && (!G.hover || G.hover.x !== nh.x || G.hover.y !== nh.y) && G.state === 'player' && G.sel && G.reachMap && G.reachMap.has(ty * MW + tx)) Audio2.play('hover', 0.08, 1.5);
    G.hover = nh;
  }
  if (ROTATE) { clicks.length = 0; return; }
  if (clicks.length) Audio2.unlock();
  if (Audio2.ctx && !Music.cur && MENUS.includes(G.state)) Music.play('title');
  if (showCredits) { if (clicks.length || pressed('Escape')) { clicks.length = 0; showCredits = false; } return; }
  if (G.state === 'title' && (pressed('Space') || pressed('Enter'))) clicks.push({ x: VW / 2, y: Math.round(VH * 0.67) + 5 });
  if (MENUS.includes(G.state)) return menuInput();
  missionInput();
}
const MENUS = ['title', 'campaign', 'loadout', 'barracks', 'ending', 'waitaudio', 'loading'];

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  let ts = window.__speed || 1;
  if (G.slowmo > 0) { G.slowmo -= raw; ts *= 0.3; }
  if (G.ff && G.state === 'enemy') ts *= 2.6;
  const dt = raw * ts;
  gt += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (gt >= timers[i].t) { const t = timers[i]; timers.splice(i, 1); t.res(); }
  handleInput(dt);
  for (const u of units) { u.anim.t += dt; if (u.hitFlash > 0) u.hitFlash -= dt * 4; if (u.alertT > 0) u.alertT -= dt; }
  updateFX(dt);
  if (G.dialogGap > 0) G.dialogGap -= dt;
  updateWash(dt);
  if (G.banner) G.banner.t += dt;
  for (let i = G.bubbles.length - 1; i >= 0; i--) { G.bubbles[i].t += dt; if (G.bubbles[i].t > G.bubbles[i].dur) G.bubbles.splice(i, 1); }
  for (const m of G.msgs) m.t += dt;
  if (G.dialog) {
    const d = G.dialog, before = Math.floor(d.shown);
    d.shown = Math.min(d.s.length, d.shown + dt * 52);
    if (Math.floor(d.shown) !== before && Math.floor(d.shown) % 2 === 0 && d.s[Math.floor(d.shown)] !== ' ') Audio2.blip(SPEAKERS[d.who].pitch);
  }
  if (G.autoEndT > 0 && G.state === 'player' && !G.busy && !G.dialog) { G.autoEndT -= dt; if (G.autoEndT <= 0) { G.autoEndT = 0; if (soldiers().every(u => !hasActions(u))) endPlayerTurn(); } }
  updateCamera(dt);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setTransform(HS, 0, 0, HS, 0, 0);
  if (ROTATE) drawRotate();
  else if (G.state === 'title' || G.state === 'waitaudio' || G.state === 'loading') { if (I.font && mapCanvas) drawTitle(); }
  else if (G.state === 'campaign') drawCampaign();
  else if (G.state === 'loadout') drawLoadout();
  else if (G.state === 'barracks') drawBarracks();
  else if (G.state === 'ending') drawEnding(raw);
  else {
    ctx.setTransform(WS, 0, 0, WS, 0, 0);
    drawWorld();
    ctx.setTransform(HS, 0, 0, HS, 0, 0);
    drawWeather(dt, G.mission.weather); drawFlash(dt);
    drawHUD(); drawBanner(); drawDialog();
    if (G.state === 'win' || G.state === 'lose') drawEnd();
  }
  if (showCredits) drawCredits();
  if (I.pointer && mouse.inside && !mouse.touch) spr(I.pointer, 0, 0, 16, 16, mouse.x - 1, mouse.y - 1);
  requestAnimationFrame(frame);
}

// rotor wash dust: pack smoke sprites thrown out in a ring
function updateWash(dt) {
  const w = G.wash; if (!w) return;
  w.t += dt;
  if (w.leaving) w.lt = (w.lt || 0) + dt;
  const rate = w.leaving ? Math.max(0, 1 - w.lt / 2.5) : Math.min(1, w.t / 0.6);
  if (rate <= 0 && w.leaving) { G.wash = null; return; }
  w.acc = (w.acc || 0) + dt * 40 * rate;
  while (w.acc >= 1) {
    w.acc--;
    const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 46;
    fx('smoke', w.x + Math.cos(a) * r, w.y + Math.sin(a) * r * 0.6 + 4, { scale: Math.random() < 0.6 ? 2 : 3, alpha: 0.85 });
  }
  if (!w.leaving && Math.random() < dt * 3) fx('smallfrag', w.x + rint(-30, 30), w.y + rint(-16, 16));
}

// keep the camera on its follow target, inside the map, clear of the HUD bars
function updateCamera(dt) {
  if (MENUS.includes(G.state)) return;
  const k = HS / WS, m0 = hudMargins(); const m = { l: m0.l * k, r: m0.r * k, t: m0.t * k, b: m0.b * k };
  const cxo = (m.l + WVW - m.r) / 2, cyo = (m.t + WVH - m.b) / 2;
  if (cam.follow) { const tx = cam.follow.x - cxo, ty = cam.follow.y - cyo; cam.x += (tx - cam.x) * Math.min(1, dt * 6); cam.y += (ty - cam.y) * Math.min(1, dt * 6); }
  const minX = -m.l - 8, maxX = Math.max(minX, MW * TS - WVW + m.r + 8), minY = -m.t - 4, maxY = Math.max(minY, MH * TS - WVH + m.b + 4);
  cam.x = Math.max(minX, Math.min(maxX, cam.x)); cam.y = Math.max(minY, Math.min(maxY, cam.y));
  if (cam.shake > 0) { cam.sx = (Math.random() - 0.5) * cam.shake * 2; cam.sy = (Math.random() - 0.5) * cam.shake * 2; cam.shake = Math.max(0, cam.shake - dt * 12); } else { cam.sx = cam.sy = 0; }
}

// ---------- boot ----------
loadImages().then(() => {
  G.msel = 0; showMissionMap(0);
  G.state = 'title';
  window.__G = G;
  requestAnimationFrame(frame);
});
