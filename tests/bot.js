// test-only autoplay bot, injected via page.evaluate. Plays the current mission using each mission's botGoal().
window.__bot = async function (maxTurns) {
  setInterval(() => { if (G.dialog) { advanceDialog(); advanceDialog(); } }, 40);
  const log = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const idle = async () => { for (let i = 0; i < 4000; i++) { if ((G.state === 'player' && !G.busy && !G.dialog) || G.state === 'win' || G.state === 'lose') return; await wait(25); } throw new Error('stuck state=' + G.state + ' busy=' + G.busy); };
  const tryInteract = async (s, goal) => {
    const ia = goal && G.mission.interact && hasActions(s) && G.mission.interact(s, goal.x, goal.y);
    if (ia) { await playerInteract(s, ia); log.push(`T${G.turn} ${s.key} ${ia.label}`); return true; }
    return false;
  };
  while (G.turn <= maxTurns) {
    await idle();
    if (G.state === 'win' || G.state === 'lose') break;
    for (const s of soldiers()) {
      if (!hasActions(s)) continue;
      await idle(); if (G.state !== 'player') break;
      selectUnit(s, true);
      const goal = G.mission.botGoal(s);
      if (await tryInteract(s, goal)) continue;
      // revive anyone down next to us
      const down = downedList().find(d => mdist(d, s) === 1);
      if (down) { await playerRevive(s, down); log.push(`T${G.turn} ${s.key} revive ${down.key}`); continue; }
      const tg = enemies().filter(e => e.visible && canTarget(s, e)).sort((a, b) => hitChance(s, b).chance - hitChance(s, a).chance)[0];
      const busyGoal = (G.mission.id === 3 && s.key === 'vance') || (G.mission.id === 2 && (G.phase === 'exfil' || ['haas', 'reyes'].includes(s.key)));
      if (tg && !s.moved && !busyGoal && hitChance(s, tg).chance >= 40) { await playerAttack(s, tg); log.push(`T${G.turn} ${s.key} fire ${tg.key}`); continue; }
      if (s.rockets > 0 && G.boss && G.boss.alive) { G.mode = 'rocket'; const h = G.boss.segs[0]; if (abilityValid(s, h.x, h.y)) { await playerAbility(s, h.x, h.y); log.push('rocket'); continue; } G.mode = 'move'; }
      if (s.arty > 0 && G.boss && G.boss.alive) { G.mode = 'arty'; const c = G.boss.segs[0]; if (G.vis[c.y][c.x]) { await playerAbility(s, c.x, c.y); log.push('arty'); continue; } G.mode = 'move'; }
      if (!s.moved && G.reachMap && goal) {
        let best = null, bd = 1e9;
        for (const [, n] of G.reachMap) { if (n.occupied) continue; const d = Math.abs(n.x - goal.x) + Math.abs(n.y - goal.y) - coverDirs(n.x, n.y).length * 0.3 + Math.random() * 0.5; if (d < bd) { bd = d; best = n; } }
        if (best && best.d > 0) { await playerMove(s, best); log.push(`T${G.turn} ${s.key} move ${best.x},${best.y}`); }
      }
      await idle(); if (G.state !== 'player') break;
      if (s.alive && hasActions(s)) {
        if (await tryInteract(s, G.mission.botGoal(s))) continue;
        const tg2 = enemies().find(e => e.visible && canTarget(s, e));
        if (tg2) await playerAttack(s, tg2); else setOverwatch(s);
      }
    }
    await idle();
    if (G.state === 'player') await endPlayerTurn();
  }
  return { log: log.slice(-40), state: G.state, phase: G.phase, turn: G.turn, kills: G.stats.kills,
    squad: units.filter(u => SQUAD_DEFS[u.key] && u.side !== 'npc').map(u => `${u.key}:${u.hp}${u.alive ? '' : 'X'}${u.downed ? 'D' : ''}${u.extracted ? 'E' : ''}`).join(' ') };
};
