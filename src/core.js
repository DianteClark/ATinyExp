'use strict';
// ============================================================
// CORE: canvas, images, font, input, audio, music synth
// ============================================================
const TS = 16;                      // tile size
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
// The canvas runs at full device resolution. Two integer scales draw into it:
//   HS = device px per HUD pixel (the interface), WS = device px per world pixel (the map, zoomable).
let VW = 240, VH = 480;             // HUD size in HUD pixels
let WVW = 160, WVH = 320;           // map viewport size in world pixels
let HS = 3, WS = 4, DPR = 1, SCALE = 1; // SCALE = CSS px per HUD pixel (input mapping)
let ZMIN = 2, ZMAX = 12;
let TALL = true;                    // the game is portrait-only
let ROTATE = false;                 // phone held sideways -> show "turn your phone" screen
const COARSE = window.matchMedia && matchMedia('(pointer: coarse)').matches;
let zoomInit = false;
function resize() {
  DPR = window.devicePixelRatio || 1;
  const iw = window.innerWidth, ih = window.innerHeight;
  ROTATE = COARSE && iw > ih * 1.05;
  // portrait frame: full screen on phones, a phone-shaped column on desktop
  const fw = COARSE ? iw : Math.min(iw, Math.round(ih * 0.56)), fh = ih;
  const devW = Math.round(fw * DPR), devH = Math.round(fh * DPR);
  cv.width = devW; cv.height = devH;
  cv.style.width = fw + 'px'; cv.style.height = fh + 'px';
  const short = Math.min(devW, devH);
  HS = Math.max(1, Math.floor(short / 200));
  VW = Math.floor(devW / HS); VH = Math.floor(devH / HS);
  SCALE = HS / DPR;
  ZMIN = Math.max(1, HS - 1); ZMAX = HS * 3;
  if (!zoomInit) { WS = HS + 2; zoomInit = true; }
  WS = Math.max(ZMIN, Math.min(ZMAX, WS));
  WVW = devW / WS; WVH = devH / WS;
  ctx.imageSmoothingEnabled = false;
}
// zoom the map to integer scale z, keeping the world point under HUD point (hx,hy) fixed
function setZoom(z, hx = VW / 2, hy = VH / 2) {
  z = Math.max(ZMIN, Math.min(ZMAX, Math.round(z)));
  if (z === WS) return;
  const wx = hx * HS / WS + cam.x, wy = hy * HS / WS + cam.y;
  WS = z; WVW = cv.width / WS; WVH = cv.height / WS;
  cam.x = wx - hx * HS / WS; cam.y = wy - hy * HS / WS;
  cam.follow = null;
}
function hudToWorld(hx, hy) { return [hx * HS / WS + cam.x, hy * HS / WS + cam.y]; }
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200)); resize();

// ---------- images ----------
const I = {};
function loadImages() {
  return Promise.all(Object.entries(IMG).map(([k, src]) => new Promise(res => {
    const im = new Image(); im.onload = () => { I[k] = im; res(); }; im.src = src;
  })));
}
function spr(img, sx, sy, sw, sh, dx, dy, flip, alpha) {
  if (!img) return;
  dx = Math.round(dx); dy = Math.round(dy);
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save(); ctx.translate(dx + sw, dy); ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh); ctx.restore();
  } else ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
  if (alpha !== undefined) ctx.globalAlpha = 1;
}

// ---------- palette ----------
const C = {
  ink: '#0a0a14', navy0: '#131340', navy1: '#0e204d', navy2: '#06226d', teal0: '#1f6363',
  teal1: '#0f7881', teal2: '#0f8892', cyan: '#0b97aa', mint: '#15c6a6', white: '#f2f2f2',
  green: '#3ee03e', red: '#ff3b3b', orange: '#ff9a1a', yellow: '#ffd23f', blue: '#5a6cff',
  grey: '#8a93a8', purple: '#9b4dd8', panel: 'rgba(8,10,34,0.92)'
};

// ---------- bitmap font (6x11) ----------
const fontCache = {};
function fontFor(color) {
  if (fontCache[color]) return fontCache[color];
  const c = document.createElement('canvas'); c.width = I.font.width; c.height = I.font.height;
  const g = c.getContext('2d'); g.drawImage(I.font, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return fontCache[color] = c;
}
const FW = 6, FH = 11;
function text(s, x, y, color = C.white, shadow = true) {
  s = String(s); x = Math.round(x); y = Math.round(y);
  if (shadow) text(s, x + 1, y + 1, C.ink, false);
  const f = fontFor(color);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i) - 32;
    if (code <= 0 || code > 94) continue;
    ctx.drawImage(f, code * FW, 0, FW, FH, x + i * FW, y, FW, FH);
  }
}
function textW(s) { return String(s).length * FW; }
function textC(s, cx, y, color, shadow) { text(s, cx - textW(s) / 2, y, color, shadow); }
function wrap(s, maxChars) {
  const words = s.split(' '); const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + (cur ? ' ' : '') + w).length > maxChars) { lines.push(cur); cur = w; }
    else cur += (cur ? ' ' : '') + w;
  }
  if (cur) lines.push(cur); return lines;
}
// numbers.png digits: '1'..'9','0','+','-','%','/'  rows: 0 white 1 green 2 red 3 blue 4 orange
const NUMCH = '1234567890+-%/';
function num(s, x, y, row = 0) {
  s = String(s);
  for (let i = 0; i < s.length; i++) {
    const k = NUMCH.indexOf(s[i]); if (k < 0) continue;
    spr(I.numbers, k * 8, row * 8, 8, 8, x + i * 7, y);
  }
}

function panel(x, y, w, h, border = C.cyan, fill = C.panel) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = border;
  ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
  ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
}
function bar(x, y, w, h, frac, col = C.green, back = '#3a0d14') {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = C.ink; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
}
// pip health bar like Into-the-Breach
function pips(x, y, hp, max, col = C.green) {
  const w = max * 3 + 1;
  x = Math.round(x - w / 2); y = Math.round(y);
  ctx.fillStyle = C.ink; ctx.fillRect(x - 1, y - 1, w + 2, 5);
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = i < hp ? col : '#4a1020';
    ctx.fillRect(x + 1 + i * 3, y, 2, 3);
  }
}

// ---------- input ----------
const mouse = { x: 0, y: 0, down: false, rdown: false, moved: false, inside: false, dragX: 0, dragY: 0, dragging: false };
const keys = {};
const clicks = [];
cv.addEventListener('contextmenu', e => e.preventDefault());
function toLogical(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / SCALE, (e.clientY - r.top) / SCALE]; }
window.addEventListener('gesturestart', e => e.preventDefault());
const touches = new Map();          // active touch pointers for pinch zoom
let pinch = null;
cv.addEventListener('pointerdown', e => {
  const [x, y] = toLogical(e); mouse.x = x; mouse.y = y; mouse.inside = true;
  if (e.pointerType !== 'mouse') {
    touches.set(e.pointerId, { x, y });
    if (touches.size === 2) {
      const [p, q] = [...touches.values()];
      pinch = { d0: Math.hypot(p.x - q.x, p.y - q.y) || 1, z0: WS };
      mouse.down = false; mouse.dragging = true;     // a pinch is never a tap
      return;
    }
  }
  if (e.button === 2 || e.button === 1) { mouse.rdown = true; mouse.dragX = x; mouse.dragY = y; mouse.dragDist = 0; }
  else { mouse.down = true; mouse.dragX = x; mouse.dragY = y; mouse.dragDist = 0; mouse.touch = e.pointerType !== 'mouse'; mouse.dragging = false; }
  Audio2.unlock();
});
window.addEventListener('pointermove', e => {
  const [x, y] = toLogical(e);
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x, y });
  if (pinch && touches.size >= 2) {
    const [p, q] = [...touches.values()];
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    setZoom(pinch.z0 * d / pinch.d0, (p.x + q.x) / 2, (p.y + q.y) / 2);
    mouse.x = x; mouse.y = y; return;
  }
  const dx = x - mouse.x, dy = y - mouse.y;
  mouse.x = x; mouse.y = y; mouse.inside = true;
  if (mouse.rdown || (mouse.down && mouse.touch)) {
    mouse.dragDist += Math.abs(dx) + Math.abs(dy);
    if (mouse.dragDist > (mouse.touch ? 8 : 6)) {
      const k = HS / WS; cam.x -= dx * k; cam.y -= dy * k; cam.follow = null; mouse.dragging = true;
    }
  }
});
const endTouch = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
window.addEventListener('pointercancel', e => { endTouch(e); mouse.down = false; mouse.dragging = false; });
window.addEventListener('pointerup', e => {
  Audio2.unlock();
  const [x, y] = toLogical(e);
  const wasPinch = touches.size >= 2 || pinch;
  endTouch(e);
  if (e.button === 2 || e.button === 1) { if (!mouse.dragging) clicks.push({ x, y, right: true }); mouse.rdown = false; }
  else if (mouse.down) { if (!mouse.dragging && !wasPinch) clicks.push({ x, y, right: false, touch: e.pointerType !== 'mouse' }); mouse.down = false; }
  if (touches.size === 0) mouse.dragging = false;
});
cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = toLogical(e); setZoom(WS + (e.deltaY < 0 ? 1 : -1), x, y); }, { passive: false });
cv.addEventListener('pointerleave', () => { mouse.inside = false; });
window.addEventListener('keydown', e => {
  if (!keys[e.code]) keys['_' + e.code] = true;
  keys[e.code] = true; Audio2.unlock();
  if (e.code === 'Equal' || e.code === 'NumpadAdd') setZoom(WS + 1);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') setZoom(WS - 1);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
function pressed(code) { if (keys['_' + code]) { keys['_' + code] = false; return true; } return false; }
function clearPressed() { for (const k in keys) if (k[0] === '_') keys[k] = false; }

// ---------- camera ----------
const cam = { x: 0, y: 0, follow: null, shake: 0, sx: 0, sy: 0 };
function camTo(px, py, instant) { cam.follow = { x: px, y: py }; if (instant) { cam.x = px - WVW / 2; cam.y = py - WVH / 2; } }

// ---------- audio ----------
const Audio2 = {
  ctx: null, buf: {}, sfxGain: null, musGain: null, voxGain: null, ready: false, muteMusic: false, muteAll: false,
  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    try { const b = this.ctx.createBuffer(1, 1, 22050), src = this.ctx.createBufferSource(); src.buffer = b; src.connect(this.ctx.destination); src.start(0); this.ctx.resume(); } catch (e) {}
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.7; this.sfxGain.connect(this.master);
    this.voxGain = this.ctx.createGain(); this.voxGain.gain.value = 1.0; this.voxGain.connect(this.master);
    this.musGain = this.ctx.createGain(); this.musGain.gain.value = 0.22; this.musGain.connect(this.master);
    const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    this.musGain.disconnect(); this.musGain.connect(comp); comp.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    let pending = 0;
    for (const [k, b64] of Object.entries(AUD)) {
      const bin = atob(b64); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      pending++;
      this.ctx.decodeAudioData(arr.buffer).then(b => { this.buf[k] = b; }).catch(() => {}).finally(() => { if (--pending === 0) this.ready = true; });
    }
  },
  play(k, vol = 1, rate = 1, bus) {
    if (!this.ctx || !this.buf[k] || this.muteAll) return null;
    const s = this.ctx.createBufferSource(); s.buffer = this.buf[k]; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(bus || this.sfxGain); s.start();
    return { s, g };
  },
  loop(k, vol) {
    if (!this.ctx || !this.buf[k]) return null;
    const s = this.ctx.createBufferSource(); s.buffer = this.buf[k]; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.sfxGain); s.start(); return { s, g };
  },
  voiceBusy: 0,
  voice(actor, line, force) {
    if (!this.ctx || this.muteAll) return;
    const now = this.ctx.currentTime;
    if (!force && now < this.voiceBusy) return;
    const list = (VOICE[actor] || {})[line]; if (!list) return;
    const k = list[Math.floor(Math.random() * list.length)];
    const h = this.play(k, 0.9, 1, this.voxGain);
    if (h) this.voiceBusy = now + h.s.buffer.duration + 0.15;
  },
  // synthesized gunshot layer (crisper than the muffled sample)
  gun(kind = 'rifle', vol = 1) {
    if (!this.ctx || this.muteAll) return;
    const t = this.ctx.currentTime, a = this.ctx;
    const n = a.createBufferSource(); n.buffer = this.noise; n.playbackRate.value = kind === 'sniper' ? 0.6 : 1;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'sniper' ? 900 : kind === 'mg' ? 1800 : 1400; f.Q.value = 0.7;
    const g = a.createGain(); const dur = kind === 'sniper' ? 0.35 : kind === 'mg' ? 0.08 : 0.14;
    g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start(t, Math.random() * 0.5, dur + 0.05);
    const o = a.createOscillator(); o.type = 'square'; const og = a.createGain();
    o.frequency.setValueAtTime(kind === 'sniper' ? 160 : 220, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    og.gain.setValueAtTime(0.35 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og); og.connect(this.sfxGain); o.start(t); o.stop(t + 0.1);
  },
  plasma(vol = 1) {
    if (!this.ctx || this.muteAll) return;
    const t = this.ctx.currentTime, a = this.ctx;
    const o = a.createOscillator(); o.type = 'sawtooth'; const g = a.createGain();
    o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.22);
    g.gain.setValueAtTime(0.18 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    o.connect(f); f.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.26);
  },
  blip(pitch) { // dialogue typewriter blip
    if (!this.ctx || this.muteAll) return;
    const t = this.ctx.currentTime, a = this.ctx;
    const o = a.createOscillator(); o.type = 'square'; const g = a.createGain();
    o.frequency.value = pitch * (0.92 + Math.random() * 0.16);
    g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.06);
  }
};

// ---------- MIDI chiptune player ----------
const Music = {
  cur: null, startT: 0, idx: 0, loopN: 0, timer: null, gain: null, wave: null,
  play(name, fade = 1.0) {
    if (!Audio2.ctx) { this.pending = name; return; }
    if (this.cur === name) return;
    this.stop(fade);
    const a = Audio2.ctx;
    if (!this.wave) {
      const re = new Float32Array(32), im = new Float32Array(32);
      for (let n = 1; n < 32; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25); // 25% pulse
      this.wave = a.createPeriodicWave(re, im);
    }
    this.cur = name; this.data = MUSIC[name];
    this.gain = a.createGain(); this.gain.gain.setValueAtTime(0, a.currentTime);
    this.gain.gain.linearRampToValueAtTime(1, a.currentTime + 0.6); this.gain.connect(Audio2.musGain);
    this.startT = a.currentTime + 0.1; this.idx = 0; this.loopN = 0;
    clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 100);
  },
  stop(fade = 0.8) {
    clearInterval(this.timer); this.timer = null;
    if (this.gain && Audio2.ctx) {
      const g = this.gain, t = Audio2.ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => g.disconnect(), fade * 1000 + 100);
    }
    this.cur = null; this.gain = null;
  },
  tick() {
    if (!this.data || !this.gain) return;
    const a = Audio2.ctx, n = this.data.n, ahead = a.currentTime + 0.4;
    if (Audio2.muteMusic || Audio2.muteAll) {   // keep the clock moving silently
      while (true) { const i = this.idx * 5; if (i >= n.length) { this.loopN++; this.idx = 0; continue; }
        if (this.startT + this.loopN * this.data.len + n[i] > ahead) break; this.idx++; }
      return;
    }
    while (true) {
      const i = this.idx * 5;
      if (i >= n.length) { this.loopN++; this.idx = 0; continue; }
      const t = this.startT + this.loopN * this.data.len + n[i];
      if (t > ahead) break;
      if (t >= a.currentTime - 0.05) this.note(t, n[i + 1], n[i + 2], n[i + 3], n[i + 4]);
      this.idx++;
    }
  },
  note(t, dur, note, vel, cls) {
    const a = Audio2.ctx, out = this.gain, v = vel / 127;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    if (cls === 0) return this.drum(t, note, v);
    const o = a.createOscillator(), g = a.createGain();
    let atk = 0.005, rel = 0.08, peak = 0.12 * v, sus = peak, filt = null;
    if (cls === 1) { o.type = 'triangle'; peak = 0.32 * v; sus = peak * 0.8; rel = 0.05; }
    else if (cls === 2) { o.type = 'sawtooth'; atk = 0.06; rel = 0.25; peak = 0.05 * v; sus = peak; filt = 1400; }
    else if (cls === 3) { o.setPeriodicWave(this.wave); peak = 0.09 * v; sus = peak * 0.7; filt = 3000; }
    else if (cls === 4) { o.type = 'triangle'; peak = 0.16 * v; sus = 0.0001; rel = 0.05; dur = Math.min(dur, 0.6); }
    else if (cls === 5) { o.type = 'sine'; peak = 0.35 * v; sus = 0.0001; dur = 0.35;
      o.frequency.setValueAtTime(freq * 1.5, t); o.frequency.exponentialRampToValueAtTime(freq, t + 0.08); }
    if (cls !== 5) o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + atk);
    if (cls === 4 || cls === 5) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    else { g.gain.linearRampToValueAtTime(sus, t + Math.min(dur, atk + 0.08)); g.gain.setValueAtTime(sus, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + rel); }
    let node = o;
    if (filt) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt; o.connect(f); node = f; }
    node.connect(g); g.connect(out); o.start(t); o.stop(t + dur + rel + 0.05);
  },
  drum(t, note, v) {
    const a = Audio2.ctx, out = this.gain;
    if (note === 35 || note === 36) {
      const o = a.createOscillator(), g = a.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.6 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2); return;
    }
    if (note >= 41 && note <= 50 && note !== 42 && note !== 44 && note !== 46 && note !== 49) {
      const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle';
      const f0 = 80 + (note - 41) * 18;
      o.frequency.setValueAtTime(f0 * 2, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.1);
      g.gain.setValueAtTime(0.35 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25); return;
    }
    const n = a.createBufferSource(); n.buffer = Audio2.noise;
    const f = a.createBiquadFilter(), g = a.createGain();
    let dur = 0.05, vol = 0.12 * v;
    if (note === 38 || note === 40 || note === 37 || note === 39) { f.type = 'bandpass'; f.frequency.value = 1800; dur = 0.14; vol = 0.4 * v; }
    else if (note === 49 || note === 57 || note === 52 || note === 55) { f.type = 'highpass'; f.frequency.value = 5000; dur = 0.9; vol = 0.14 * v; }
    else if (note === 46) { f.type = 'highpass'; f.frequency.value = 7000; dur = 0.2; }
    else { f.type = 'highpass'; f.frequency.value = 8000; }
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(out); n.start(t, Math.random() * 0.8, dur + 0.02);
  }
};
