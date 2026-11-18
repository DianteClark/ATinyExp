'use strict';
// ============================================================
// MISSIONS: the campaign. Each mission is data + hooks (see game.js header).
// ============================================================
const noKIA = () => !units.some(u => SQUAD_DEFS[u.key] && u.side === 'player' && !u.alive);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const padCenter = (x, y) => [(x + 2) * TS, (y + 2) * TS];

// pulsing objective ring (pack objective-pulse sprite) centred on a tile
function pulseRing(tx, ty, sx, sy, phase = 0) {
  const f = Math.floor(gt * 10 + phase) % 8;
  spr(I.pulse, f * 64, 0, 64, 64, tx * TS + 8 - 32 - sx, ty * TS + 8 - 32 - sy, false, 0.8);
}

// ============================================================
// MISSION 1: DEAD SIGNAL. Find Vance, reach the pad, hold until dustoff.
// ============================================================
const M1 = {
  id: 1, key: 'm1', name: 'DEAD SIGNAL', seed: 7,
  blurb: 'The swarm took Meridian\'s city grid. Find our missing forward observer, then hold the helipad until the bird arrives.',
  music: { explore: 'explore', battle: 'battle', boss: 'boss' }, weather: 'rain', dark: 0.36,
  squad: { fixed: ['reyes', 'okafor', 'haas', 'lin'] },
  start: [[3, 20], [2, 21], [4, 21], [3, 22]],
  pad: [33, 3],
  medals: [
    { name: 'Dead Signal', desc: 'Complete the mission', test: w => w },
    { name: 'No One Left Behind', desc: 'Nobody killed in action', test: w => w && noKIA() },
    { name: 'Big Game', desc: 'Destroy the Burrower', test: w => w && G.flags.bossKilled },
  ],
  build(B) {
    B.fill(T.PAVE, 0, 0, 27, 25);
    for (let y = 0; y < MH; y++) { const e = 28 + ((y * 7) % 3 === 0 ? 1 : 0) - ((y * 5) % 4 === 0 ? 1 : 0); B.fill(T.DIRT, e, y, e + 1, y); }
    B.hroad(14, 0, 31); B.vroad(18, 0, 25);
    B.building(3, 2, 14, 10, [[8, 10], [9, 10], [14, 7]]);            // Halvorsen office
    B.wall(10, 3, 10, 7); B.fill(T.FLOOR, 10, 5, 10, 5);
    B.building(21, 2, 27, 10, [[24, 10], [25, 10], [21, 5], [21, 6], [27, 7], [26, 2], [27, 2], [27, 3]]);   // ruined warehouse
    B.fill(T.PAVE, 26, 2, 27, 2); B.fill(T.PAVE, 27, 3, 27, 3);
    B.building(7, 19, 13, 23, [[10, 19], [11, 19], [7, 21], [13, 21], [13, 22], [9, 23], [10, 23]]);
    B.lot(21, 18, 7, 7);
    B.pad(33, 3);
    for (const c of [[31, 9, 2], [36, 11, 3], [30, 19, 2], [37, 20, 1], [33, 16, 1], [38, 1, 1], [30, 2, 1], [35, 23, 2]]) B.crater(...c);
    const P = (t, x, y) => B.obj(t, x, y);
    P('carBH', 2, 17); P('rock1', 5, 18); P('barrel', 15, 18); P('carRV', 16, 21); P('rock2', 3, 24);
    for (const [x, y] of [[6, 16], [12, 16], [6, 13], [14, 13], [24, 13], [24, 16], [17, 6], [20, 9], [17, 20], [20, 21]]) P('lamp', x, y);
    P('junk', 9, 21); P('crate', 12, 20); P('debris2', 8, 20); P('debris1', 11, 22);
    P('carRH', 4, 14); P('carBV', 13, 14); P('burntV', 22, 14); P('carRH', 25, 15); P('barrel1', 16, 13); P('barrel', 21, 16);
    P('carBH', 9, 12); P('rock3', 1, 12); P('debris3', 11, 15); P('debris1', 17, 14);
    P('desk', 5, 5); P('cabinet', 7, 3); P('chair', 4, 7); P('desk', 12, 4); P('shelf', 13, 8); P('crate', 11, 8); P('junk', 5, 8); P('desk', 8, 7);
    P('carRV', 16, 1); P('barrel', 20, 3); P('rock1', 1, 1); P('carBV', 1, 6);
    P('crate', 23, 4); P('crate', 25, 6); P('junk', 22, 8); P('shelf', 26, 4); P('barrel', 24, 7); P('debris2', 26, 3);
    P('carBV', 22, 19); P('carRV', 24, 19); P('carRHw', 22, 23); P('barrel', 26, 21); P('burntV2', 26, 18);
    P('rockW', 30, 5); P('rock2', 32, 8); P('rock1', 38, 4); P('rock3', 31, 13); P('rockW', 35, 8); P('rock2', 29, 17);
    P('rock1', 34, 18); P('rock3', 37, 14); P('carBVw', 38, 9); P('barrel', 32, 2); P('rock2', 36, 1); P('spike', 33, 12);
    P('rockW', 29, 23); P('rock1', 37, 24); P('carRVw', 30, 10);
    for (const [x, y] of [[4, 4], [26, 8], [25, 22], [38, 18]]) P('cache', x, y);
  },
  setup() {
    G.phase = 'find'; G.hold = 0; G.holdWaves = 0;
    const v = makeSoldier('vance', 6, 4); v.side = 'npc'; v.talks = true; setAnim(v, 'crawl');
    makeEnemy('spider', 14, 19, 'A'); makeEnemy('spider', 15, 23, 'A');
    makeEnemy('scarab', 21, 12, 'B'); makeEnemy('spider', 17, 11, 'B');
    makeEnemy('spider', 12, 6, 'C');
    makeEnemy('scarab', 23, 6, 'D'); makeEnemy('scarab', 25, 8, 'D'); makeEnemy('spider', 22, 4, 'D');
    makeEnemy('scarab', 33, 10, 'E');
    G.objective = 'Find Pvt. Vance in the Halvorsen office (north).';
  },
  counter() { return G.phase === 'hold' && G.hold > 0 ? 'DUSTOFF ' + G.hold : null; },
  target() { return G.phase === 'find' ? { x: 6, y: 4 } : (G.phase === 'toLZ' ? { x: 34, y: 4 } : null); },
  async intro() {
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
    showTip(COARSE ? 'Tap a soldier, tap a green tile to preview the move, then tap it again to go. One move + one action per turn. Drag to look around, pinch to zoom.' : 'Click a soldier, then a green tile to move. Each soldier gets one move and one action per turn. Shields on a tile show the cover you\'d get there.');
  },
  async onMove(u) {
    const v = byKey('vance');
    if (G.phase === 'find' && v.side === 'npc' && u.alive && los(u.x, u.y, v.x, v.y) && dist(u, v) <= 4.5) {
      G.phase = 'rescued';
      camTo(v.x * TS + 8, v.y * TS + 8); await sleep(0.4);
      setAnim(v, 'idle'); v.flip = u.x < v.x;
      Audio2.voice('alex', 'sel', true);
      await say('vance', 'Kestrel? Oh, thank god. I thought you were the bugs knocking.');
      await line(anyBut('reyes'), 'Vance. You hurt?');
      await say('vance', 'Just my pride. My radio has one fire mission left in it. Point me at something ugly.');
      v.side = 'player'; v.moved = true; v.acted = true;
      message('Pvt. Vance joins the squad.', C.green);
      Audio2.play('chime', 0.5);
      await line(others('vance'), 'Overwatch, Kestrel. We have Vance. Moving to the pad.');
      await say('overwatch', 'Good copy. Bad news: you made noise. Flyers inbound from the north. Get to that pad.');
      Audio2.play('warning', 0.5); Audio2.play('buzz', 0.4);
      spawnWave([['hornet', 30, 0], ['hornet', 37, 2], ['wasp', 26, 0], ['wasp', 39, 6]], 'R1');
      G.phase = 'toLZ';
      G.objective = 'Get the squad to the helipad in the northeast lot.';
      bannerShow('OBJECTIVE UPDATED', C.yellow, 'Reach the landing zone', true);
      showTip('Vance can call ARTILLERY once (ARTY button): 6 damage in a 3x3 area, landing at the start of your next turn. Mark where the bugs will be.');
      computeVis();
    }
    if (G.phase === 'toLZ' && soldiers().some(s => onTiles(s, 33, 3, 4, 4))) {
      G.phase = 'hold'; G.hold = 3;
      camTo(34.5 * TS, 4.5 * TS);
      const s = soldiers().find(s => onTiles(s, 33, 3, 4, 4));
      Audio2.voice(s ? s.voice : 'meghan', 'obj', true);
      await line(anyBut('reyes'), 'Overwatch, Kestrel is on the pad. Send the bird.');
      await say('overwatch', 'Bird\'s away. Three turns out. Hold that pad, Kestrel.');
      if (canSpeak('okafor') && canSpeak('lin')) {
        await say('okafor', 'Three turns. Easy.');
        await say('lin', 'You said that in Kessel.');
        await say('okafor', 'And we lived.');
      }
      G.objective = 'Hold the landing zone until the dropship arrives.';
      Music.play(this.music.battle);
      bannerShow('HOLD THE LZ', C.orange, 'Dustoff in 3 turns', true);
    }
  },
  async onPlayerTurnStart() {
    if (G.phase !== 'hold') return false;
    if (--G.hold <= 0) return dustoff(...padCenter(33, 3), 'Kestrel, bird is overhead. Stay low, we\'re coming down on the pad!');
    return false;
  },
  async onEnemyPhaseEnd() {
    if (G.phase !== 'hold') return;
    const h = ++G.holdWaves;
    if (h === 1) { Audio2.play('warning', 0.5); message('Movement on the east edge!', C.orange); spawnWave([['spider', 39, 13], ['spider', 39, 17], ['scarab', 39, 1]], 'H1'); }
    else if (h === 2) {
      await emergeBurrower('centipede', 37, 12);
      await line(anyBut('vance', 'haas'), 'Uh... guys? The ground is moving.');
      await line(anyBut('lin'), 'What... is that.');
      await say('overwatch', 'Kestrel, that is a Burrower. Do NOT try to kill it. Survive it.');
      await line(others('reyes', 'lin'), 'It\'ll plough straight through cover. Don\'t bunch up!');
      await line(anyBut('reyes'), 'You heard Overwatch. Nobody gets eaten. Hold the pad!');
      showTip('The Burrower has 22 HP and crushes any cover it crawls through. You don\'t have to kill it. Just survive until dustoff.');
      spawnWave([['wasp', 39, 20], ['wasp', 30, 0]], 'H2');
    } else if (h === 3) { message('More contacts inbound!', C.orange); Audio2.play('warning', 0.5); spawnWave([['hornet', 39, 8], ['spider', 39, 22], ['spider', 28, 0]], 'H3'); }
  },
  async debrief() {
    await line(anyBut('reyes'), 'Flag this for command. The swarm has something big living under the streets.');
    if (G.flags.bossKilled) { await line(anyBut('vance', 'haas'), 'Had. Past tense. We killed it.'); await say('overwatch', '...You were told not to engage. Drinks are on me.'); }
    else await say('overwatch', 'Already flagged. Get some sleep. Tomorrow you go back in.');
  },
  botGoal(s) { return G.phase === 'find' ? byKey('vance') : { x: 34, y: 4 }; },
};

// ============================================================
// MISSION 2: UNDER THE STREETS. Collapse three burrow holes, then run for the pad.
// ============================================================
const HOLES2 = [[17, 5], [25, 19], [35, 9]];
const M2 = {
  id: 2, key: 'm2', name: 'UNDER THE STREETS', seed: 21,
  blurb: 'The Burrower\'s tunnels surface in the old Kessler quarry. Plant charges in three burrow holes, then get back to the pad.',
  music: { explore: 'explore2', battle: 'battle2', boss: 'boss2' }, weather: 'dust', dark: 0.22,
  squad: { size: 4 },
  start: [[8, 10], [9, 11], [8, 12], [9, 9]],
  pad: [1, 19],
  medals: [
    { name: 'Under the Streets', desc: 'Complete the mission', test: w => w },
    { name: 'No One Left Behind', desc: 'Nobody killed in action', test: w => w && noKIA() },
    { name: 'Demolition Crew', desc: 'Collapse all three holes by turn 9', test: w => w && G.flags.holesTurn && G.flags.holesTurn <= 9 },
  ],
  build(B) {
    // quarry floor with dirt drifts; an old depot yard and road on the west side
    for (let y = 0; y < MH; y++) for (let x = 12; x < MW; x++) if (((x * 13 + y * 7) % 11) < 3) B.fill(T.DIRT, x, y, x, y);
    B.fill(T.PAVE, 0, 0, 10, 25);
    for (let y = 0; y < MH; y++) { const e = 11 + ((y * 5) % 3 === 0 ? 1 : 0); B.fill(T.DIRT, e, y, e, y); }
    B.vroad(5, 0, 25);
    B.building(0, 2, 4, 8, [[4, 5], [4, 6]]);
    B.building(7, 15, 10, 21, [[7, 18], [8, 21], [10, 17]]);
    B.pad(1, 19);
    // quarry barriers
    B.wall(20, 8, 20, 13); B.wall(28, 14, 32, 14); B.wall(13, 15, 16, 15); B.wall(30, 2, 30, 5); B.wall(23, 23, 27, 23);
    for (const [x, y] of HOLES2) B.crater(x - 1, y - 1, 3);
    for (const c of [[14, 20, 2], [31, 18, 1], [38, 2, 1], [22, 2, 2], [36, 16, 2], [12, 10, 1]]) B.crater(...c);
    const P = (t, x, y) => B.obj(t, x, y);
    for (const [x, y] of [[7, 3], [4, 11], [7, 13], [4, 24]]) P('lamp', x, y);
    P('carBVw', 5, 14); P('carRHw', 8, 6); P('crate', 2, 4); P('desk', 1, 6); P('junk', 8, 17); P('crate', 9, 19);
    P('rockW', 14, 8); P('rock1', 16, 2); P('rock2', 19, 6); P('barrel', 18, 3); P('barrel1', 15, 7);
    P('rock3', 23, 17); P('rockW', 26, 21); P('barrel', 27, 18); P('carBV', 21, 20); P('rock1', 24, 15);
    P('rock2', 33, 7); P('rockW', 37, 11); P('barrel', 36, 7); P('rock3', 32, 11); P('burntV', 34, 4);
    P('rock1', 13, 12); P('rock2', 17, 17); P('rockW', 22, 10); P('rock3', 27, 6); P('carRVw', 29, 9);
    P('rock1', 38, 20); P('rockW', 33, 22); P('rock2', 18, 23); P('spike', 25, 12); P('debris2', 12, 4); P('debris1', 30, 16);
    for (const [x, y] of [[2, 4], [22, 2], [38, 22]]) P('cache', x, y);
  },
  setup() {
    G.phase = 'demo';
    G.holes = HOLES2.map(([x, y], i) => ({ x, y, i, open: true, charged: false, active: false }));
    makeEnemy('spider', 14, 9, 'A'); makeEnemy('spider', 16, 11, 'A');
    makeEnemy('scarab', 22, 12, 'B'); makeEnemy('hornet', 24, 10, 'B');
    makeEnemy('scarab', 31, 20, 'C'); makeEnemy('spider', 28, 22, 'C');
    makeEnemy('scarab', 36, 5, 'D'); makeEnemy('wasp', 38, 12, 'D');
    G.objective = 'Plant charges in the three burrow holes (0/3).';
  },
  counter() { return G.phase === 'demo' ? 'HOLES ' + G.holes.filter(h => !h.open).length + '/3' : (G.phase === 'exfil' ? 'TO THE PAD' : null); },
  target() {
    if (G.phase === 'exfil') return { x: 2, y: 20 };
    const h = G.holes.filter(h => h.open && !h.charged).sort((a, b) => nearestSoldierDist(a) - nearestSoldierDist(b))[0];
    return h || null;
  },
  drawOverlay(sx, sy) {
    for (const h of G.holes) if (h.open && explored[h.y][h.x]) {
      pulseRing(h.x, h.y, sx, sy, h.i * 3);
      if (h.charged && Math.floor(gt * 4) % 2) spr(I.grenade, 0, 0, 8, 8, h.x * TS + 4 - sx, h.y * TS + 4 - sy);
    }
  },
  interact(s, x, y) {
    const h = G.holes.find(h => h.x === x && h.y === y && h.open && !h.charged);
    if (!h || cheb(s, h) > 1) return null;
    return { label: 'PLANT CHARGE', run: s => this.plant(s, h) };
  },
  async plant(s, h) {
    s.flip = h.x < s.x; setAnim(s, 'crawl');
    Audio2.play('equip', 0.5); Audio2.play('tap', 0.4, 0.8);
    bubble(s, ['Charge set!', 'Fire in the hole... next turn.', 'Planted. Stay clear.'][rint(0, 2)], 1.8);
    h.charged = true;
    // shaped charge: the blast goes down the tunnel, so it only hurts bugs
    G.artyQueue.push({ x: h.x, y: h.y, dmg: 5, src: s, charge: true, after: () => this.collapse(h) });
    if (!G.flags.plantTip) { G.flags.plantTip = true; showTip('Charges blow at the start of your next turn. The blast is shaped downward: it hurts bugs near the hole, not your squad.'); }
    await sleep(0.5); setAnim(s, 'idle');
  },
  async collapse(h) {
    h.open = false;
    Audio2.play('rumble', 0.7, 1.1); cam.shake = 4;
    for (let i = 0; i < 6; i++) fx('smoke', h.x * TS + 8 + rint(-12, 12), h.y * TS + 8 + rint(-10, 10), { scale: 2, delay: i * 0.05 });
    const done = G.holes.filter(x => !x.open).length;
    G.objective = done < 3 ? 'Plant charges in the three burrow holes (' + done + '/3).' : 'Get every standing soldier onto the pad (southwest).';
    if (done === 1) await say('overwatch', 'Hole one is down. Two to go, Kestrel.');
    else if (done === 2) { await say('overwatch', 'Two down. Seismic readings are climbing. Make the last one quick.'); await line(anyBut('haas'), 'Climbing how much?'); await say('overwatch', '...Just make it quick.'); }
    else {
      G.flags.holesTurn = G.turn; G.phase = 'exfil';
      await say('overwatch', 'That\'s all three. Wait. Seismic spike, right under you!');
      await emergeBurrower('centipede', 22, 12);
      await line(anyBut('okafor', 'haas'), 'Not this thing again.');
      if (canSpeak('mercer')) await say('mercer', 'Good. I saved a rocket for it.');
      await say('overwatch', 'The bird is waiting on the southwest pad. Every one of you, get on it. MOVE!');
      bannerShow('EXFIL', C.green, 'Everyone onto the pad', true);
      showTip('Get every soldier who can still stand onto the pad. Anyone who is down gets carried out with you.');
    }
  },
  async intro() {
    await say('overwatch', 'Kestrel, Overwatch. Seismic sensors traced last night\'s Burrower to the old Kessler quarry. Its tunnels surface right here.');
    camTo(25 * TS, 12 * TS); await pause(1.0);
    await say('overwatch', 'Three burrow holes, marked on your map. The swarm is crawling out of them. Plant a charge in each and collapse them.');
    camTo(9 * TS, 11 * TS); await pause(0.8);
    await line(anyBut('haas'), 'Finally, a job with explosives in it.');
    await say('overwatch', 'Anyone can plant. Get next to a hole, plant, and it blows at the start of your next turn.');
    if (canSpeak('mercer')) {
      await say('overwatch', 'You also have a loaner from Third Battalion. Corporal Mercer, anti-tank.');
      await say('mercer', 'Two rockets. Save me something big.');
    }
    await line(anyBut('lin', 'reyes'), 'And when the holes are gone?');
    await say('overwatch', 'Get back to the pad in the southwest. I\'ll have a bird waiting.');
    await line(anyBut('reyes'), 'You heard Overwatch. Kestrel, move.');
    showTip('Burrow holes keep spitting out bugs until you collapse them. Stand next to a hole, then tap it twice to plant a charge.');
  },
  async onMove() {
    if (G.phase === 'exfil') {
      const st = soldiers();
      if (st.length && st.every(s => onTiles(s, 1, 19, 4, 4))) return dustoff(...padCenter(1, 19), 'Everyone\'s on the pad. Bird coming down. Hold on to something!');
    }
  },
  async onEnemyPhaseEnd() {
    // open holes wake up once seen (or after turn 3) and spit out bugs
    const kinds = ['spider', 'wasp', 'spider', 'scarab'];
    for (const h of G.holes) {
      if (!h.open) continue;
      if (!h.active && (explored[h.y][h.x] || G.turn >= 3)) h.active = true;
      // holes take turns (every other enemy phase each) so the quarry never becomes a grind
      if (h.active && (G.turn + h.i) % 2 === 0 && enemies().length < 8) { const e = spawnEnemy(kinds[(G.turn + h.i) % 4], h.x, h.y, 'H' + h.i); if (e) { e.active = true; e.alertT = 1; } }
    }
    if (G.phase === 'exfil' && G.turn % 2 === 0) spawnWave([['spider', 39, 14], ['hornet', 39, 20]], 'X' + G.turn);
  },
  async debrief() {
    await say('overwatch', 'Kessler quarry is quiet for the first time in a week.');
    await line(anyBut('lin'), 'That thing came from somewhere bigger. Didn\'t it.');
    await say('overwatch', 'We think there\'s a queen. And we think we know where she\'s calling them from. Rest up. Tomorrow is the big one.');
  },
  botGoal(s) {
    if (G.phase === 'exfil') return { x: 2, y: 20 };
    const h = G.holes.filter(h => h.open && !h.charged).sort((a, b) => mdist(a, s) - mdist(b, s))[0];
    return h || { x: 2, y: 20 };
  },
};

// ============================================================
// MISSION 3: KILL SWITCH. Get Vance to the plaza relay and hold it for three turns.
// ============================================================
const CONSOLE3 = { x: 19, y: 12 };
const M3 = {
  id: 3, key: 'm3', name: 'KILL SWITCH', seed: 33, final: true, noFlag: true,
  blurb: 'The queen steers the swarm through the old broadcast relay in Meridian Plaza. Get Vance to the console and hold for three turns.',
  music: { explore: 'explore3', battle: 'battle3', boss: 'boss3' }, weather: 'storm', dark: 0.42,
  squad: { size: 4, required: ['vance'] },
  start: [[18, 23], [20, 23], [17, 24], [21, 24]],
  pad: [18, 11],
  medals: [
    { name: 'Kill Switch', desc: 'Complete the mission', test: w => w },
    { name: 'No One Left Behind', desc: 'Nobody killed in action', test: w => w && noKIA() },
    { name: 'Regicide', desc: 'Destroy the Burrower Queen', test: w => w && G.flags.queenKilled },
  ],
  build(B) {
    B.fill(T.PAVE, 0, 0, 39, 25);
    B.hroad(6, 0, 39); B.hroad(18, 0, 39); B.vroad(9, 0, 25); B.vroad(29, 0, 25);
    B.building(1, 0, 7, 4, [[4, 4], [7, 2]]);
    B.building(32, 0, 38, 4, [[35, 4], [32, 2]]);
    B.building(1, 9, 6, 15, [[6, 12], [3, 15], [6, 10]]);
    B.building(32, 9, 38, 16, [[32, 12], [35, 16], [32, 14]]);
    B.building(32, 21, 38, 25, [[32, 23], [35, 21]]);
    B.building(12, 0, 17, 4, [[14, 4], [17, 2]]);
    B.lot(1, 20, 7, 6);
    B.pad(18, 11);
    // plaza planters (low concrete walls) give cover around the relay
    B.wall(14, 9, 16, 9); B.wall(23, 9, 25, 9); B.wall(14, 16, 16, 16); B.wall(23, 16, 25, 16);
    B.wall(12, 11, 12, 13); B.wall(27, 11, 27, 13);
    const P = (t, x, y) => B.obj(t, x, y);
    P('cabinet', CONSOLE3.x, CONSOLE3.y);
    for (const [x, y] of [[12, 9], [26, 9], [12, 16], [26, 16], [8, 2], [28, 2], [8, 22], [28, 22], [20, 8], [20, 17]]) P('lamp', x, y);
    P('carRH', 2, 6); P('carBV', 9, 1); P('burntV', 30, 10); P('carRHw', 22, 18); P('carBH', 35, 7); P('carRV', 10, 20);
    P('carBVw', 29, 22); P('carRH', 14, 19); P('barrel', 16, 13); P('barrel', 23, 12); P('barrel1', 11, 7); P('barrel', 31, 17);
    P('junk', 15, 11); P('crate', 24, 14); P('debris2', 21, 10); P('debris1', 17, 15); P('spike', 26, 13);
    P('carBV', 3, 21); P('carRV', 5, 21); P('barrel', 7, 24);
    P('desk', 3, 11); P('shelf', 34, 11); P('crate', 36, 13); P('desk', 14, 2); P('cabinet', 34, 2); P('crate', 3, 2);
    P('rock2', 22, 21); P('rock1', 25, 24); P('rockW', 12, 23); P('debris3', 18, 20);
    for (const [x, y] of [[4, 13], [36, 23], [15, 2]]) P('cache', x, y);
  },
  setup() {
    G.phase = 'reach'; G.upload = 0; G.waves = 0;
    makeEnemy('scarab', 15, 13, 'A'); makeEnemy('spider', 23, 14, 'A');
    makeEnemy('hornet', 19, 4, 'B'); makeEnemy('spider', 21, 2, 'B');
    makeEnemy('scarab', 34, 12, 'C'); makeEnemy('spider', 30, 13, 'C');
    makeEnemy('spider', 4, 11, 'D'); makeEnemy('wasp', 7, 17, 'D');
    makeEnemy('scarab', 35, 19, 'E');
    G.objective = 'Get Pvt. Vance to the relay console in the plaza.';
  },
  counter() { return G.phase === 'upload' ? 'UPLINK ' + G.upload + '/3' : null; },
  target() { return G.phase === 'reach' ? CONSOLE3 : null; },
  failCheck() { const v = byKey('vance'); return v && !v.alive ? 'Vance is gone. Without him the kill switch is lost. Kestrel... fall back.' : null; },
  drawOverlay(sx, sy) { if (G.phase !== 'done') pulseRing(CONSOLE3.x, CONSOLE3.y, sx, sy); },
  vanceAtConsole() { const v = byKey('vance'); return v && v.alive && !v.downed && cheb(v, CONSOLE3) === 1; },
  async intro() {
    await say('overwatch', 'Kestrel, this is it. The swarm\'s signal is coming from the old broadcast relay in Meridian Plaza.');
    camTo(19.5 * TS, 12.5 * TS); await pause(1.0);
    await say('overwatch', 'The queen is using it to steer every bug in the city. Vance, your kill code is loaded.');
    await say('vance', 'Get me next to that console and keep them off me for three turns.');
    camTo(19 * TS, 22 * TS); await pause(0.8);
    if (canSpeak('okafor') && canSpeak('lin')) { await say('okafor', 'Storm\'s getting worse.'); await say('lin', 'Good. They can\'t see us either.'); }
    await line(anyBut('reyes'), 'You heard him. Kestrel, one more time.');
    showTip('Vance has to stand next to the console (the pulsing ring) for three of your turns. If he goes down, the uplink pauses. If he dies, the mission fails.');
  },
  async onMove() {
    if (G.phase === 'reach' && this.vanceAtConsole()) {
      G.phase = 'upload';
      const v = byKey('vance'); v.flip = CONSOLE3.x < v.x;
      Audio2.play('static', 0.5); Audio2.play('complete', 0.5);
      await say('vance', 'I\'m in. Uploading the kill switch. Three turns!');
      await say('overwatch', 'Uplink is live. Every bug in the city just turned toward you. Hold that plaza!');
      G.objective = 'Keep Vance at the console until the uplink finishes.';
      Music.play(this.music.battle);
      bannerShow('HOLD THE PLAZA', C.orange, 'Uplink 0/3', true);
    }
  },
  async onPlayerTurnStart() {
    if (G.phase !== 'upload') return false;
    if (!this.vanceAtConsole()) { message('Uplink paused: Vance must be at the console.', C.orange); return false; }
    G.upload++;
    message('Uplink ' + G.upload + '/3', C.green); Audio2.play('complete', 0.5);
    if (G.upload === 2) await say('overwatch', 'Two thirds there. Keep her off Vance!');
    if (G.upload >= 3) return this.shutdown();
    return false;
  },
  async onEnemyPhaseEnd() {
    if (G.phase !== 'upload') return;
    const w = ++G.waves;
    const edges = [['spider', 0, 7], ['spider', 39, 19], ['hornet', 20, 0], ['wasp', 39, 6], ['scarab', 0, 19], ['spider', 20, 25], ['hornet', 0, 0], ['wasp', 39, 25]];
    const pick = []; for (let i = 0; i < 3; i++) pick.push(edges[(w * 3 + i) % edges.length]);
    if (enemies().length < 12) spawnWave(pick, 'W' + w);
    if (w === 1) {
      const q = await emergeBurrower('queen', 20, 3);
      await say('overwatch', 'Kestrel... that\'s her. That\'s the queen.');
      await line(anyBut('haas', 'okafor'), 'She\'s bigger than the last one.');
      if (canSpeak('mercer')) await say('mercer', 'Good. Bigger target.');
      await line(anyBut('reyes'), 'Everything we\'ve got on the queen. Nobody touches Vance!');
      showTip('The queen has 34 HP and moves 5. You don\'t have to kill her: the kill switch takes her down too. But it would feel great.');
      void q;
    }
  },
  async onBossKilled() {
    G.flags.queenKilled = true;
    await line(anyBut('lin'), 'The queen is DOWN!');
    await say('overwatch', 'Confirmed! The swarm is losing coordination. Finish that upload!');
  },
  async shutdown() {
    G.phase = 'done'; G.flags.shutdown = true;
    G.state = 'cutscene';
    await say('vance', 'Kill switch is live. Sending... NOW!');
    Audio2.play('static', 0.8); Audio2.play('hydDn', 0.6); G.flash = 0.4; cam.shake = 5;
    await bannerShow('SIGNAL TERMINATED', C.mint, 'The swarm is powering down', false, 2.2);
    for (const e of enemies()) {
      if (e.visible) { camTo(e.x * TS + 8, e.y * TS + 8); await sleep(0.15); }
      await killUnit(e, null);
    }
    await sleep(0.6);
    return dustoff(...padCenter(18, 11), 'Kestrel, every bug in Meridian just dropped where it stood. Bird is coming down in the plaza!');
  },
  async debrief() {
    await say('overwatch', 'Command is calling it. The swarm is broken. Meridian is ours again.');
    await line(anyBut('vance'), 'Kill switch worked. Told you it would.');
    await line(anyBut('reyes'), 'Kestrel, stand down. We\'re going home.');
  },
  botGoal(s) {
    if (s.key === 'vance') return { x: CONSOLE3.x, y: CONSOLE3.y + 1 };
    return { x: CONSOLE3.x + rint(-3, 3), y: CONSOLE3.y + 3 };
  },
};

const MISSIONS = [M1, M2, M3];
