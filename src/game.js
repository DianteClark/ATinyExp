'use strict';
// ============================================================
// GAME: state, turn flow, player actions, mission plumbing
// ============================================================
// Missions (missions.js) plug in through hooks:
//   build(MapB)            map layout          setup()                  units, pods, caches
//   intro()                opening dialogue    onMove(u)                after any player move/action
//   onPlayerTurnStart()    -> true if it ended the mission
//   onEnemyPhaseEnd()      reinforcements, set pieces
//   interact(s, x, y)      -> { label, run } contextual action on a tile (plant charge...)
//   counter()              short HUD text ("DUSTOFF 2")   debrief(lost, carried) victory lines
//   medals[]               { name, test(win) }

const G = {
  state: 'loading', mission: null, turn: 1, phase: '', busy: false, sel: null, mode: 'move', hover: null,
  reachMap: null, artyQueue: [], vis: null, stats: null, flags: {}, banner: null, objective: '', tip: null,
  bubbles: [], msgs: [], boss: null, wash: null, scrap: 0, earned: null, lastDialog: null, dialogGap: 0,
  undo: null, ff: false, armed: null,
};
let gt = 0;                       // game clock (seconds, slowed/sped by time scale)
const timers = [];

function sleep(s) { return new Promise(res => timers.push({ t: gt + s, res })); }
function pause(s) { return skipping ? Promise.resolve() : sleep(s); }   // skippable cutscene wait
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

const soldiers = () => units.filter(u => u.side === 'player' && u.alive && !u.extracted && !u.downed);
const downedList = () => units.filter(u => u.side === 'player' && u.alive && u.downed);
const enemies = () => units.filter(u => u.side === 'enemy' && u.alive);
const byKey = k => units.find(u => u.key === k);

// ---------------- setup ----------------
function newGame(mission, squadKeys) {
  units.length = 0; LIGHTS.length = 0; FX.length = 0; PROJ.length = 0; FLOAT.length = 0; PARTS.length = 0;
  Object.assign(G, {
    mission, turn: 1, phase: '', busy: false, sel: null, mode: 'move', reachMap: null, artyQueue: [],
    stats: { kills: 0, shots: 0, hits: 0, downs: 0 }, flags: {}, banner: null, tip: null, bubbles: [], msgs: [],
    boss: null, wash: null, scrap: 0, earned: null, lastDialog: null, dialogGap: 0, undo: null, ff: false, armed: null, medals: null,
  });
  buildMap(mission);
  const keys = squadKeys || mission.squad.fixed;
  keys.forEach((k, i) => makeSoldier(k, mission.start[i][0], mission.start[i][1]));
  mission.setup();
  computeVis(true);
  camTo(mission.start[0][0] * TS, mission.start[0][1] * TS, true);
}

// ---------------- visibility ----------------
const SIGHT = 8;
function computeVis() {
  const vis = []; for (let y = 0; y < MH; y++) vis.push(new Array(MW).fill(false));
  for (const s of soldiers()) {
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
  for (const u of units) if (u.side === 'npc') u.visible = vis[u.y][u.x];
  return spotted;
}

// ---------------- dialogue helpers ----------------
const SQUAD_ORDER = ['reyes', 'okafor', 'haas', 'lin', 'vance', 'mercer'];
// who can speak: Overwatch always; soldiers only while deployed and on their feet
function canSpeak(k) {
  if (k === 'overwatch') return true;
  const u = byKey(k); return !!(u && u.alive && !u.downed && (u.side === 'player' || u.talks));
}
// say a line as the first available speaker in the list
function line(who, text) {
  const k = (Array.isArray(who) ? who : [who]).find(canSpeak);
  return k ? say(k, text) : Promise.resolve();
}
// preferred speakers first, then anyone else in the squad
const anyBut = (...first) => [...first, ...SQUAD_ORDER.filter(k => !first.includes(k))];
const others = (...not) => SQUAD_ORDER.filter(k => !not.includes(k));

function bubble(u, s, dur = 2.2) { G.bubbles.push({ u, s, t: 0, dur }); }
function message(s, color = C.white) { G.msgs.push({ s, color, t: 0 }); if (G.msgs.length > 4) G.msgs.shift(); }
function showTip(s) { if (COARSE) s = s.replace(/Click/g, 'Tap').replace(/click/g, 'tap'); G.tip = { s, t: 0 }; }

async function onSpotted(list, spotter) {
  const types = new Set(list.map(e => e.key));
  Audio2.voice(spotter.voice, 'spot', true, spotter.voiceRate);
  for (const e of list) e.alertT = 1.5;
  Audio2.play('warning', 0.3, 1.3);
  G.undo = null;                               // new information: no take-backs
  if (G.state !== 'player') return;
  const wasBusy = G.busy; G.busy = true;
  camTo(list[0].x * TS + 8, list[0].y * TS + 8);
  await sleep(0.5);
  if (!G.flags.firstContact) {
    G.flags.firstContact = true;
    await say(spotter.key, types.has('spider') ? 'Contact! Spiders! They close fast. Keep something solid at your back.' : 'Contact! Bugs ahead!');
    await line(anyBut('reyes').filter(k => k !== spotter.key), 'Weapons free, Kestrel. Make every shot count.');
    if (G.mission.id === 1) showTip((COARSE ? 'Tap a red-bracketed enemy to see your odds, tap again to fire.' : 'Click a red-bracketed enemy to fire.') + ' Cover lowers your odds: half cover -20, full cover -40.');
  } else if (types.has('scarab') && !G.flags.scarab) {
    G.flags.scarab = true;
    await line(anyBut('okafor'), 'Scarab. Plasma cannon, thick shell. Don\'t stand in the open.');
  } else if (types.has('hornet') && !G.flags.hornet) {
    G.flags.hornet = true;
    await line(anyBut('lin'), 'Hornets! Flyers go right over the cars. Shoot them out of the sky.');
  }
  G.busy = wasBusy;
}

// ---------------- player actions ----------------
function selectUnit(u, quiet) {
  if (!u || u.side !== 'player' || !u.alive || u.extracted || u.downed) return;
  G.armed = null;
  G.sel = u; G.mode = 'move';
  G.reachMap = (!u.moved && !u.acted) ? reach(u, u.mv) : null;
  if (!quiet) { Audio2.play('select', 0.4); if (Math.random() < 0.6) Audio2.voice(u.voice, 'sel', false, u.voiceRate); }
  camTo(u.x * TS + 8, u.y * TS + 8);
}
function hasActions(u) { return u.alive && !u.extracted && !u.acted && !u.downed; }
function nextSoldier(fromCurrent) {
  const list = soldiers().filter(hasActions);
  if (!list.length) { G.sel = null; G.reachMap = null; return; }
  const i = fromCurrent && G.sel ? list.indexOf(G.sel) : -1;
  selectUnit(list[(i + 1) % list.length]);
}

async function playerMove(u, node) {
  G.busy = true;
  Audio2.play('confirm', 0.35); if (Math.random() < 0.6) Audio2.voice(u.voice, 'go', false, u.voiceRate);
  // remember enough to take the move back, unless the move reveals or changes something
  const before = { u, x: u.x, y: u.y, ow: u.overwatch, scrap: G.scrap, phase: G.phase, flip: u.flip };
  G.undo = null;
  u.overwatch = false;
  G.reachMap = null;
  await moveUnit(u, pathTo(node));
  u.moved = true;
  G.undo = before;
  await checkTriggers(u);
  if (G.undo && (G.scrap !== before.scrap || G.phase !== before.phase)) G.undo = null;
  G.busy = false;
  if (G.state === 'player' && u.alive && !u.extracted && G.sel === u) selectUnit(u, true);
  autoEnd();
}
function undoMove() {
  const b = G.undo; if (!b || G.busy || G.state !== 'player') return;
  const u = b.u; if (!u.alive || u.downed || u.acted) { G.undo = null; return; }
  u.x = b.x; u.y = b.y; u.flip = b.flip; u.overwatch = b.ow; u.moved = false;
  G.undo = null; G.autoEndT = 0;
  computeVis();
  Audio2.play('cancel', 0.4);
  selectUnit(u, true);
}
async function playerAttack(u, tgt) {
  G.busy = true; G.undo = null; u.acted = true; G.reachMap = null; u.overwatch = false;
  if (u.gun === 'mg') Audio2.voice(u.voice, 'grunt', false, u.voiceRate);
  await attack(u, tgt);
  await checkTriggers(u);
  G.busy = false;
  afterAction();
}
async function playerAbility(u, tx, ty) {
  G.busy = true; G.undo = null; G.reachMap = null; u.overwatch = false;
  if (G.mode === 'grenade') await throwGrenade(u, tx, ty);
  else if (G.mode === 'arty') await callArtillery(u, tx, ty);
  else if (G.mode === 'rocket') await fireRocket(u, tx, ty);
  G.mode = 'move';
  await checkTriggers(u);
  G.busy = false;
  afterAction();
}
async function playerRevive(s, u) {
  G.busy = true; G.undo = null; G.reachMap = null; s.acted = true; s.overwatch = false;
  s.flip = u.x < s.x; setAnim(s, 'crawl');
  Audio2.play('equip', 0.5); bubble(s, ['Stay with me!', 'Up you get!', 'Not today.'][rint(0, 2)], 1.6);
  for (let i = 0; i < 6; i++) { particles(u.x * TS + 8, u.y * TS + 10, 3, '#3ee03e', 30, 0.6); await sleep(0.1); }
  u.downed = false; u.hp = 3; u.bleed = 0; u.acted = true; u.moved = true;
  setAnim(u, 'idle'); setAnim(s, 'idle');
  floatText('+3', u.x * TS + 8, u.y * TS + 4, C.green); Audio2.play('chime', 0.5);
  setTimeout(() => Audio2.voice(u.voice, 'ready', true, u.voiceRate), 300);
  message(u.name + ' is back on their feet.', C.green);
  computeVis();
  G.busy = false;
  afterAction();
}
async function playerInteract(s, act) {
  G.busy = true; G.undo = null; G.reachMap = null; s.acted = true; s.overwatch = false;
  await act.run(s);
  await checkTriggers(s);
  G.busy = false;
  afterAction();
}
function setOverwatch(u) {
  G.undo = null;
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
  if (soldiers().length && soldiers().every(u => !hasActions(u))) G.autoEndT = 0.9;
}

// ---------------- turn flow ----------------
async function startPlayerTurn() {
  G.state = 'banner'; G.busy = true; G.ff = false; G.undo = null;
  for (const u of downedList()) if (u.bleed <= 0) {
    camTo(u.x * TS + 8, u.y * TS + 8); await sleep(0.5);
    u.alive = false; u.dead = true; u.downed = false;
    message(u.name + ' didn\'t make it.', C.red); Audio2.play('lose', 0.35, 1.2);
    floatText('KIA', u.x * TS + 8, u.y * TS, C.red);
    await sleep(0.8);
  }
  for (const u of soldiers()) { u.moved = false; u.acted = false; if (!u.overwatch) setAnim(u, 'idle'); }
  // artillery called last turn lands now
  for (const a of G.artyQueue) {
    camTo(a.x * TS + 8, a.y * TS + 8); await sleep(0.4);
    if (!a.charge) { Audio2.play('whoosh', 0.6, 0.6); await projectile('shell', a.x * TS + 8, a.y * TS - 140, a.x * TS + 8, a.y * TS + 8, 500); }
    await explode(a.x, a.y, 1, a.dmg || 6, a.charge ? 'charge' : 'arty', a.src);
    if (a.after) await a.after();
    await sleep(0.4);
  }
  G.artyQueue = [];
  if (await checkEnd()) return;
  await bannerShow('PLAYER PHASE', C.cyan, 'Turn ' + G.turn, false, 1.1);
  if (G.mission.onPlayerTurnStart && await G.mission.onPlayerTurnStart()) return;
  if (await checkEnd()) return;
  G.state = 'player'; G.busy = false;
  const first = soldiers().find(hasActions);
  if (first) selectUnit(first, true);
}
async function endPlayerTurn() {
  if (G.state !== 'player' || G.busy) return;
  G.busy = true; G.sel = null; G.reachMap = null; G.mode = 'move'; G.armed = null; G.undo = null;
  if (mouse.touch) G.hover = null;
  for (const u of downedList()) u.bleed--;
  Audio2.play('selbig', 0.4);
  await enemyTurn();
}
async function enemyTurn() {
  G.state = 'enemy';
  const act = enemies().filter(e => e.active);
  await bannerShow('ENEMY PHASE', C.red, act.length ? act.length + ' hostiles active' + (COARSE ? ' - tap to speed up' : '') : '', false, 1.1);
  let attackedBark = false;
  const order = act.sort((a, b) => nearestSoldierDist(a) - nearestSoldierDist(b));
  for (const e of order) {
    if (!e.alive || !soldiers().length) continue;
    const hpBefore = soldiers().reduce((s, u) => s + u.hp, 0);
    await enemyAct(e);
    const hpAfter = soldiers().reduce((s, u) => s + u.hp, 0);
    if (hpAfter < hpBefore && !attackedBark) { attackedBark = true; const v = soldiers()[rint(0, soldiers().length - 1)]; if (v) setTimeout(() => Audio2.voice(v.voice, 'attacked', false, v.voiceRate), 400); }
    if (await checkEnd()) return;
  }
  if (G.mission.onEnemyPhaseEnd) await G.mission.onEnemyPhaseEnd();
  computeVis();
  if (await checkEnd()) return;
  G.turn++;
  await startPlayerTurn();
}

// ---------------- triggers / mission plumbing ----------------
async function checkTriggers(u) {
  const o = u.alive && objAt[u.y] && objAt[u.y][u.x];
  if (o && o.type === 'cache') {
    removeObj(o); G.scrap += 15;
    floatText('+15', u.x * TS + 8, u.y * TS, C.yellow); Audio2.play('complete', 0.45); Audio2.play('equip', 0.3);
    message('Supply cache: +15 scrap', C.yellow); bubble(u, 'Supplies!', 1.4);
  }
  if (G.mission.onMove) await G.mission.onMove(u);
}
function onTiles(u, x0, y0, w, h) { return u.x >= x0 && u.x < x0 + w && u.y >= y0 && u.y < y0 + h; }

function spawnEnemy(type, x, y, pod) {
  let best = null, bd = 1e9;
  const fly = ENEMY_DEFS[type].fly;
  for (let yy = Math.max(0, y - 3); yy <= Math.min(MH - 1, y + 3); yy++) for (let xx = Math.max(0, x - 3); xx <= Math.min(MW - 1, x + 3); xx++) {
    if (!(fly ? (grid[yy][xx] !== T.WALL && !(objAt[yy][xx] && OBJ[objAt[yy][xx].type].block)) : walkable(xx, yy)) || unitAt(xx, yy)) continue;
    const d = Math.abs(xx - x) + Math.abs(yy - y); if (d < bd) { bd = d; best = [xx, yy]; }
  }
  if (!best) return null;
  return makeEnemy(type, best[0], best[1], pod);
}
function spawnWave(list, pod) { for (const [t, x, y] of list) { const e = spawnEnemy(t, x, y, pod); if (e) e.active = true; } }

// a Burrower (or the Queen) erupts from the ground with its body coiled around (cx, cy)
async function emergeBurrower(type, cx, cy) {
  camTo(cx * TS + 8, cy * TS + 8); await sleep(0.3);
  Music.stop(1.5);
  Audio2.play('rumble', 0.9, 0.8); cam.shake = 3; buzz([60, 40, 80]);
  for (let i = 0; i < 12; i++) { particles(cx * TS + 8 + rint(-14, 14), cy * TS + 8 + rint(-10, 10), 3, '#1f6363', 40); await sleep(0.08); }
  Audio2.play('rumble', 1, 0.6); Audio2.play('heavy', 0.8); Audio2.play('sting', 0.8);
  cam.shake = 7;
  for (let i = 0; i < 3; i++) fx('bigfrag', (cx - 0.5 + i) * TS, cy * TS, { delay: i * 0.1 });
  const c = makeEnemy(type, cx, cy, 'BOSS');
  c.active = true; c.alpha = 0;
  // coil: walk a small spiral of free tiles for the body
  const ring = [[0, 0], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [2, 0], [2, -1]];
  c.segs = ring.slice(0, c.segN).map(([dx, dy]) => ({ x: Math.max(0, Math.min(MW - 1, cx + dx)), y: Math.max(0, Math.min(MH - 1, cy + dy)), dir: 4 }));
  for (const s of c.segs) { const o = objAt[s.y][s.x]; if (o) removeObj(o); if (grid[s.y][s.x] === T.WALL) grid[s.y][s.x] = T.DIRT; }
  c.x = c.segs[0].x; c.y = c.segs[0].y;
  G.boss = c;
  for (let k = 0; k <= 10; k++) { c.alpha = k / 10; await sleep(0.05); }
  computeVis();
  Music.play(G.mission.music.boss);
  await sleep(0.4);
  return c;
}

// rotor wash: the bird is heard, never seen. Only the dust it kicks up (pack smoke sprites).
function washAt(x, y) { G.wash = { x, y, t: 0, on: true }; }
async function dustoff(px, py, callout) {
  G.state = 'cutscene'; G.busy = true; G.sel = null; G.reachMap = null;
  Music.stop(1.5);
  Audio2.play('plane', 1);
  camTo(px, py);
  await say('overwatch', callout || 'Kestrel, bird is overhead. Stay low, we\'re coming down!');
  washAt(px, py);
  cam.shake = 2;
  await sleep(1.6);
  // everyone still breathing goes home: the squad carries out anyone who is down
  const going = units.filter(u => u.side === 'player' && u.alive && !u.extracted);
  for (const u of going) if (u.downed) { u.downed = false; u.carried = true; }
  for (let k = 10; k >= 0; k--) { for (const u of going) u.alpha = k / 10; await sleep(0.08); }
  for (const u of going) u.extracted = true;
  await sleep(0.6);
  await victory();
  return true;
}

async function checkEnd() {
  if (G.state === 'win' || G.state === 'lose') return true;
  const squad = units.filter(u => u.side === 'player');
  const standing = squad.filter(u => u.alive && !u.downed && !u.extracted);
  if (!standing.length && !squad.some(u => u.extracted)) { await defeat(); return true; }
  if (G.mission.failCheck) { const why = G.mission.failCheck(); if (why) { await defeat(why); return true; } }
  return false;
}

// ---------------- results ----------------
function scoreMedals(win) {
  const id = G.mission.key, prev = Save.data.medals[id] || [false, false, false];
  const got = G.mission.medals.map(m => !!m.test(win));
  const fresh = got.map((g, i) => g && !prev[i]);
  Save.data.medals[id] = prev.map((p, i) => p || got[i]);
  return { got, fresh };
}
function bankScrap(win) {
  const aboard = units.filter(u => u.side === 'player' && u.extracted).length;
  G.medals = scoreMedals(win);
  const medalBonus = G.medals.fresh.filter(Boolean).length * 15;
  const bonus = win ? 40 + aboard * 5 + medalBonus : 0;
  G.earned = { kills: G.scrap, bonus, medalBonus, total: G.scrap + bonus };
  Save.data.scrap += G.earned.total; Save.data.runs++;
  if (win) { Save.data.wins++; Save.data.cleared[G.mission.key] = true; }
  Save.write();
}
async function victory() {
  G.state = 'cutscene'; G.busy = true;
  Audio2.play('win', 0.8);
  await bannerShow('MISSION CLEARED', C.green, 'Kestrel Squad extracted', false, 2.4);
  if (G.wash) G.wash.leaving = true;
  const lost = units.filter(u => SQUAD_DEFS[u.key] && u.side === 'player' && !u.alive);
  const carried = units.filter(u => u.carried);
  await say('overwatch', 'All aboard. Wheels up. Good work, Kestrel.');
  if (carried.length) await say('overwatch', carried.map(u => u.name).join(' and ') + (carried.length > 1 ? ' are' : ' is') + ' with the medic. They\'ll pull through.');
  if (lost.length) await say('overwatch', (lost.length === 1 ? lost[0].name + ' won\'t be forgotten.' : 'We lost good people today.') + ' We\'ll bring them home when this is over.');
  await G.mission.debrief(lost, carried);
  bankScrap(true);
  G.state = 'win'; G.busy = false;
  Music.play(G.mission.final ? 'ending' : 'brief');
}
async function defeat(why) {
  G.state = 'cutscene'; G.busy = true;
  Music.stop(2);
  Audio2.play('static', 0.6); await sleep(0.4);
  Audio2.play('lose', 0.8);
  await say('overwatch', why || 'Kestrel? Kestrel, respond... Kestrel...');
  bankScrap(false);
  G.state = 'lose'; G.busy = false;
}

// opening: dust kicks up, the squad is there when it clears, then the mission's briefing
async function runMission() {
  const M = G.mission;
  G.state = 'cutscene'; G.busy = true;
  Music.play('brief');
  G.ambient = Audio2.loop('wind', M.weather === 'dust' ? 0.22 : 0.12);
  const squad = soldiers();
  for (const u of squad) u.alpha = 0;
  const [sx, sy] = M.start[0];
  camTo(sx * TS + 8, sy * TS + 8, true);
  bannerShow('MISSION ' + M.id, C.yellow, M.name, true, 2.4);
  Audio2.play('plane', 0.7);
  washAt(sx * TS + 8, sy * TS + 8);
  setTimeout(() => Audio2.play('start', 0.6), 600);
  await pause(1.2);
  for (const u of squad) {
    if (!skipping) { Audio2.play('dirt', 0.4); fx('smoke', u.x * TS + 8, u.y * TS + 10, { scale: 2 }); for (let k = 1; k <= 6; k++) { u.alpha = k / 6; await sleep(0.05); } await sleep(0.12); }
    u.alpha = 1;
  }
  await pause(0.5);
  G.wash.leaving = true;
  await M.intro();
  Music.play(M.music.explore, 2);
  G.turn = 1;
  await startPlayerTurn();
}
