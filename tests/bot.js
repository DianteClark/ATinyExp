// test-only autoplay bot, injected via page.evaluate
window.__bot = async function(maxTurns) {
  setInterval(() => { if (G.dialog) { advanceDialog(); advanceDialog(); } }, 40);
  const log = [];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const idle = async () => { for (let i = 0; i < 4000; i++) { if (G.dialog) { advanceDialog(); advanceDialog(); } if ((G.state === 'player' && !G.busy && !G.dialog) || G.state === 'win' || G.state === 'lose') return; await wait(25); } throw new Error('stuck state=' + G.state + ' busy=' + G.busy); };
  while (G.turn <= maxTurns) {
    await idle();
    if (G.state === 'win' || G.state === 'lose') break;
    const goal = G.phase === 'find' ? byKey('vance') : { x: 34, y: 4 };
    for (const s of soldiers()) {
      if (!hasActions(s)) continue;
      await idle(); if (G.state !== 'player') break;
      selectUnit(s, true);
      // shoot if possible
      const tg = enemies().filter(e => e.visible && canTarget(s, e)).sort((a, b) => hitChance(s, b).chance - hitChance(s, a).chance)[0];
      if (tg && !s.moved && G.phase !== 'extract') { await playerAttack(s, tg); log.push(`T${G.turn} ${s.key} fire ${tg.key}`); continue; }
      if (s.grenades > 0) { const e = enemies().find(e => e.visible && Math.hypot(e.x - s.x, e.y - s.y) <= 5 && los(s.x, s.y, e.x, e.y)); if (e) { G.mode = 'grenade'; await playerAbility(s, e.x, e.y); log.push(`T${G.turn} ${s.key} grenade`); continue; } }
      if (s.arty > 0 && G.centipede && G.centipede.alive) { G.mode = 'arty'; const c = G.centipede.segs[0]; if (G.vis[c.y][c.x]) { await playerAbility(s, c.x, c.y); log.push('arty'); continue; } G.mode='move'; }
      if (!s.moved && G.reachMap) {
        let best = null, bd = 1e9;
        for (const [, n] of G.reachMap) { if (n.occupied) continue; const d = Math.abs(n.x - goal.x) + Math.abs(n.y - goal.y) - coverDirs(n.x, n.y).length * 0.3; if (d < bd) { bd = d; best = n; } }
        if (best && best.d > 0) { await playerMove(s, best); log.push(`T${G.turn} ${s.key} move ${best.x},${best.y}`); }
      }
      await idle(); if (G.state !== 'player') break;
      if (s.alive && hasActions(s)) { const tg2 = enemies().find(e => e.visible && canTarget(s, e)); if (tg2) await playerAttack(s, tg2); else setOverwatch(s); }
    }
    await idle();
    if (G.state === 'player') { await endPlayerTurn(); }
  }
  return { log: log.slice(-60), state: G.state, phase: G.phase, turn: G.turn, kills: G.stats.kills,
    squad: units.filter(u => SQUAD_DEFS[u.key]).map(u => `${u.key}:${u.hp}${u.alive ? '' : 'X'}${u.extracted ? 'E' : ''}`).join(' ') };
};
