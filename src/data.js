'use strict';
// ============================================================
// DATA: squad + enemy stats, upgrades, save file
// ============================================================
// Soldier sheets (16x16): rows idle, walk, crawl, fire, hit, death, throw  -> [row, frames, fps]
// Robot sheets (16x16):   rows idle, walk, fire, melee, destroyed

const SOLDIER_ROWS = { idle: [0, 2, 3], walk: [1, 2, 9], crawl: [2, 2, 4], fire: [3, 2, 12], hit: [4, 3, 10], death: [5, 5, 9], throw: [6, 3, 10] };

const ROBOT_ROWS = { idle: [0, 2, 3], walk: [1, 4, 10], fire: [2, 2, 10], melee: [3, 5, 12], dead: [4, 1, 1] };

const SQUAD_DEFS = {
  reyes:  { name: 'Sgt. Reyes',  short: 'REYES',  img: 'leader',    hp: 7, mv: 5, aim: 72, dmg: [2, 3], range: 7,  shots: 1, gun: 'rifle',  voice: 'meghan', shape: 4, rank: 2, color: '#ffd23f', role: 'Squad Leader', perk: 'Leadership: allies within 4 tiles get +10 aim.' },
  okafor: { name: 'Cpl. Okafor', short: 'OKAFOR', img: 'gunner',    hp: 8, mv: 4, aim: 60, dmg: [1, 1], range: 6,  shots: 4, gun: 'mg',     voice: 'ian',    shape: 0, rank: 1, color: '#ff9a1a', role: 'Machine Gunner', perk: 'Burst: fires several 1-damage rounds. Damage upgrades add rounds.' },
  haas:   { name: 'Pvt. Haas',   short: 'HAAS',   img: 'grenadier', hp: 7, mv: 4, aim: 65, dmg: [2, 3], range: 6,  shots: 1, gun: 'rifle',  voice: 'sean',   shape: 2, rank: 1, color: '#3ee03e', role: 'Grenadier', perk: 'Grenades: 3 damage in a 3x3 area. Wrecks cover.', grenades: 2 },
  lin:    { name: 'Spc. Lin',    short: 'LIN',    img: 'sniper',    hp: 5, mv: 4, aim: 88, dmg: [4, 5], range: 12, shots: 1, gun: 'sniper', voice: 'karen',  shape: 3, rank: 1, color: '#5ad8ff', role: 'Sniper', perk: 'Steady: -25 aim if she moved this turn.' },
  vance:  { name: 'Pvt. Vance',  short: 'VANCE',  img: 'radio',     hp: 6, mv: 5, aim: 68, dmg: [1, 2], range: 5,  shots: 2, gun: 'mg',     voice: 'alex',   shape: 1, rank: 0, color: '#c58bff', role: 'Radio Operator', perk: 'Artillery: 6 damage in 3x3, lands next turn.', arty: 1 },
  mercer: { name: 'Cpl. Mercer', short: 'MERCER', img: 'antitank',  hp: 7, mv: 4, aim: 66, dmg: [2, 3], range: 6,  shots: 1, gun: 'rifle',  voice: 'sean',   voiceRate: 0.86, shape: 2, rank: 4, color: '#9be15d', role: 'Anti-Tank', perk: 'Rockets: 5 damage to the target, 2 around it. Wrecks cover.', rockets: 2 },
};

const ENEMY_DEFS = {
  spider:    { name: 'Spider',  img: 'spider', hp: 4, mv: 5, aim: 72, dmg: [2, 3], range: 1, melee: true, desc: 'Fast. Claws at close range.' },
  scarab:    { name: 'Scarab',  img: 'scarab', hp: 6, mv: 3, aim: 60, dmg: [2, 2], range: 6, desc: 'Armoured plasma gunner.' },
  hornet:    { name: 'Hornet',  img: 'hornet', hp: 4, mv: 6, aim: 55, dmg: [2, 2], range: 5, fly: true, big: false, desc: 'Flies over obstacles.' },
  wasp:      { name: 'Wasp',    img: 'wasp',   hp: 1, mv: 7, aim: 75, dmg: [1, 1], range: 1, melee: true, fly: true, desc: 'Tiny, fast, fragile.' },
  centipede: { name: 'Burrower', img: 'centipede', hp: 22, mv: 4, aim: 90, dmg: [4, 4], range: 1, melee: true, desc: 'Crushes cover in its path.', boss: true, segs: 6 },
  queen:     { name: 'Burrower Queen', img: 'centipede', hp: 34, mv: 5, aim: 90, dmg: [5, 5], range: 1, melee: true, desc: 'Bigger, faster, angrier. Crushes cover.', boss: true, segs: 10 },
};

const UPGRADES = [
  { id: 'hp', label: 'HEALTH', max: 3, cost: [15, 30, 50] },
  { id: 'dmg', label: 'DAMAGE', max: 3, cost: [20, 40, 65] },
  { id: 'mv', label: 'MOVE', max: 2, cost: [25, 50] },
  { id: 'aim', label: 'AIM', max: 3, cost: [15, 30, 50] },
];

const Save = {
  data: null,
  blank() { const up = {}; for (const k of Object.keys(SQUAD_DEFS)) up[k] = { hp: 0, dmg: 0, mv: 0, aim: 0 }; return { v: 2, scrap: 0, runs: 0, wins: 0, up, cleared: {}, medals: {}, squad: null }; },
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem('robotwarfare.save') || 'null'); } catch (e) {}
    this.data = this.blank();
    if (d && d.up) {
      this.data.scrap = d.scrap | 0; this.data.runs = d.runs | 0; this.data.wins = d.wins | 0;
      for (const k in this.data.up) Object.assign(this.data.up[k], d.up[k] || {});
      Object.assign(this.data.cleared, d.cleared || {}); Object.assign(this.data.medals, d.medals || {});
      if (d.v < 2 && d.wins > 0) this.data.cleared.m1 = true;   // saves from before the campaign existed
      this.data.squad = d.squad || null;
    }
  },
  write() { try { localStorage.setItem('robotwarfare.save', JSON.stringify(this.data)); } catch (e) {} },
  reset() { this.data = this.blank(); this.write(); },
};
Save.load();
// a soldier's stats with upgrades applied. Gunners (multi-round weapons) get extra rounds instead of damage.

function statsFor(id) {
  const d = SQUAD_DEFS[id], L = Save.data.up[id];
  const s = { ...d, dmg: d.dmg.slice() };
  s.hp = d.hp + L.hp; s.mv = d.mv + L.mv; s.aim = d.aim + L.aim * 5;
  if (d.shots >= 4) s.shots = d.shots + L.dmg; else { s.dmg[0] += L.dmg; s.dmg[1] += L.dmg; }
  return s;
}

function statText(s, id) {
  if (id === 'hp') return String(s.hp);
  if (id === 'mv') return String(s.mv);
  if (id === 'aim') return String(s.aim);
  return s.shots >= 4 ? s.shots + 'x' + s.dmg[0] : s.dmg[0] + (s.dmg[1] > s.dmg[0] ? '-' + s.dmg[1] : '') + (s.shots > 1 ? ' x' + s.shots : '');
}

// scrap paid out for each kill
const SCRAP_FOR = { spider: 5, scarab: 8, hornet: 6, wasp: 2, centipede: 50, queen: 80 };
// who joins the roster when (mission keys from missions.js)
function rosterUnlocked(k) {
  if (k === 'vance') return !!Save.data.cleared.m1;
  if (k === 'mercer') return !!Save.data.cleared.m1;
  return true;
}
