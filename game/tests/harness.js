// Headless verification for InstaBuilt Timber Village game
// Usage: node harness.js C:\Users\Student\Desktop\instabuilt\game\index.html
'use strict';

const fs = require('fs');
const htmlPath = process.argv[2];
if (!htmlPath) { console.error('usage: node harness.js <index.html>'); process.exit(2); }
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('no <script> block found'); process.exit(2); }
const GAME_JS = m[1].replace("'use strict';", '');

// ---------------- stubs ----------------
const elements = {};
function makeCtx() {
  return new Proxy({}, {
    get(t, p) { return (p in t) ? t[p] : (function () {}); },
    set(t, p, v) { t[p] = v; return true; }
  });
}
function makeClassList() {
  const s = new Set();
  return {
    add(...c) { c.forEach(x => s.add(x)); },
    remove(...c) { c.forEach(x => s.delete(x)); },
    contains(c) { return s.has(c); },
    toggle(c, force) { const on = force === undefined ? !s.has(c) : !!force; if (on) s.add(c); else s.delete(c); return on; }
  };
}
function makeEl(id) {
  return {
    id, style: { setProperty() {} }, classList: makeClassList(),
    textContent: '', innerHTML: '', src: '', dataset: {}, clientWidth: 768, clientHeight: 512,
    width: 768, height: 512, _l: {},
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
    appendChild() {}, focus() {},
    getContext() { return makeCtx(); }
  };
}
function getEl(id) { if (!elements[id]) elements[id] = makeEl(id); return elements[id]; }

const ls = {};
const localStorage = { getItem(k) { return (k in ls) ? ls[k] : null; }, setItem(k, v) { ls[k] = String(v); }, removeItem(k) { delete ls[k]; } };

let rafCb = null;
const requestAnimationFrame = (cb) => { rafCb = cb; return 0; };
let now = 1000;
const performance = { now() { return now; } };

const document = {
  getElementById: getEl,
  querySelectorAll() { return []; },
  createElement(tag) { return makeEl(tag); },
  addEventListener() {},
  hidden: false
};

const window = globalThis;
window.addEventListener = function () {};
window.innerWidth = 1280; window.innerHeight = 800;
window.AudioContext = undefined; window.webkitAudioContext = undefined;
window.confirm = () => true;

// ---------------- load the app ----------------
eval(GAME_JS);

function step(frames) { for (let i = 0; i < frames; i++) { now += 16; const cb = rafCb; if (cb) { rafCb = null; cb(now); } } }
function clickCanvas(tx, ty) {
  const el = getEl('gameCanvas');
  (el._l.click || []).forEach(f => f({ clientX: tx * 32 + 16, clientY: ty * 32 + 16 }));
}

// ---------------- checks ----------------
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('PASS  ' + name); } else { failed++; console.log('FAIL  ' + name); } }

const g = globalThis.__game;
check('game API exposed', !!g && typeof g.newGame === 'function');

g.newGame();
let st = g.S();
check('starts with 25 wood', st.wood === 25);
check('starts with 50 coins', st.coins === 50);
check('map generated 384 tiles', st.grid.length === 384);
const treeCount = st.grid.filter(c => c.t === 'tree').length;
check('forest has trees (' + treeCount + ')', treeCount > 40);
check('HUD wood shows 25', String(getEl('hud-wood').textContent) === '25');

// --- chop a tree ---
const treeIdx = st.grid.findIndex(c => c.t === 'tree');
const tx = treeIdx % 24, ty = Math.floor(treeIdx / 24);
const woodBefore = st.wood;
g.clickTileAt(tx, ty);
check('chop increases wood (' + woodBefore + ' -> ' + st.wood + ')', st.wood > woodBefore);
check('tree became stump', st.grid[treeIdx].t === 'stump');

// --- plant a sapling ---
g.setTool('plant');
const grassIdx = st.grid.findIndex(c => c.t === 'grass');
const gx = grassIdx % 24, gy = Math.floor(grassIdx / 24);
g.clickTileAt(gx, gy);
check('planted sapling', st.grid[grassIdx].t === 'sapling');

// --- place a cabin blueprint ---
g.selectBP('cabin');
let hx = -1, hy = -1;
outer: for (let y = 1; y < 14; y++) for (let x = 0; x < 23; x++) {
  const i = y * 24 + x;
  if ([st.grid[i], st.grid[i + 1], st.grid[i + 24], st.grid[i + 25]].every(c => c.t === 'grass')) { hx = x; hy = y; break outer; }
}
check('found 2x2 build spot', hx >= 0);
const w0 = st.wood;
g.clickTileAt(hx, hy);
check('blueprint costs 25 wood (' + w0 + ' -> ' + st.wood + ')', st.wood === w0 - 25);
check('house placed', st.houses.length === 1 && st.houses[0].progress === 0 && st.houses[0].bp === 'cabin');
check('house tiles occupied', st.grid[hy * 24 + hx].t === 'house');

// --- blueprint cannot be placed on forest ---
g.selectBP('cottage');
const housesBefore = st.houses.length;
g.clickTileAt(tx, ty); // stump tile
g.clickTileAt(tx + 2, ty + 2); // somewhere with a tree, if any
check('no house on non-grass', st.houses.length === housesBefore);
g.selectBP(null);

// --- construction progresses over time ---
step(600); // ~9.6s
check('construction advanced (' + st.houses[0].progress.toFixed(2) + ')', st.houses[0].progress > 0);

// --- completion + customer claims ---
st.houses[0].progress = 1;
st.customers.push({ id: 99, bp: 'cabin', daysLeft: 5, x: 5, y: 15, state: 'wait', t: 0, shirt: '#ffffff', anim: 0 });
const rep0 = st.rep, coins0 = st.coins;
step(2);
check('house completed & claimed', st.houses[0].done === true && st.houses[0].claimed === true);
check('customer state = claim', st.customers[0].state === 'claim');
check('rep increased (' + rep0 + ' -> ' + st.rep + ')', st.rep > rep0);
check('coins increased (' + coins0 + ' -> ' + st.coins + ')', st.coins > coins0);

// --- day advance ---
const d0 = st.day;
g.advanceDay();
check('day advanced to ' + g.S().day, g.S().day === d0 + 1);
check('weather is valid', ['sunny', 'cloudy', 'rain', 'storm'].includes(st.weather));
check('save persisted', ls['instabuilt-timber-v1'] !== undefined);

// --- hammer boost ---
st.houses[0].progress = 0.3; st.houses[0].done = false; st.houses[0].claimed = false; st.houses[0].boostDay = 0;
st.wood = 100;
g.setTool('hammer');
g.clickTileAt(hx, hy);
check('hammer boost +20%', Math.abs(st.houses[0].progress - 0.5) < 0.001);
check('boost costs 5 wood', st.wood === 95);

// --- canvas click handler works end-to-end ---
g.setTool('axe');
const stumpIdx2 = st.grid.findIndex(c => c.t === 'stump');
if (stumpIdx2 >= 0) {
  const wBefore2 = st.wood;
  clickCanvas(stumpIdx2 % 24, Math.floor(stumpIdx2 / 24));
  check('canvas click routed', st.wood === wBefore2); // stump -> no wood gained
} else check('stump present for click test', false);

// --- level 5 / win at 1000+ rep, driven by a real claim ---
g.setState(Object.assign({}, st, { rep: 800 }));
st = g.S(); // re-grab: setState replaced the state object
st.wood = 500;
// place a lodge as a nearly-finished house (completes during the next update)
st.houses.push({ id: 999, bp: 'lodge', x: 10, y: 6, progress: 0.99, roof: 'red', done: false, claimed: false, boostDay: 0 });
st.customers.push({ id: 100, bp: 'lodge', daysLeft: 5, x: 8, y: 15, state: 'wait', t: 0, shirt: '#ff0000', anim: 0 });
getEl('ov-win').classList.add('hidden'); // ensure overlay starts hidden
step(260); // ~4.2s of build time -> lodge completes, customer claims
check('lodge claim at high rep -> level 5 win', st.rep >= 1000 && st.houses.find(h => h.id === 999).claimed === true);
check('win overlay shown', !getEl('ov-win').classList.contains('hidden'));

// --- intro demo: foreman chops a tree, builds a cabin, customer moves in ---
g.startGame();
check('start drops you straight into the forest (no auto demo)', g.demo() === null);
const treeCountAtStart = g.S().grid.filter(c => c.t === 'tree').length;
g.runDemo();
check('demo runs when requested', !!g.demo() && g.demo().step === 0);
step(3000); // ~48s of demo time — enough to finish the whole sequence
check('demo finished', g.demo() === null);
const treeCountAfter = g.S().grid.filter(c => c.t === 'tree').length;
check('demo chopped exactly one tree', treeCountAtStart - treeCountAfter === 1);
check('demo built & claimed a cabin', g.S().houses.some(h => h.bp === 'cabin' && h.done && h.claimed));
check('demo earned reputation', g.S().rep > 0);
check('day did not advance during demo', g.S().day === 1);
// start again: still straight into the forest, no demo
g.startGame();
check('start after demo also goes straight to forest', g.demo() === null);

console.log('\nRESULT: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
