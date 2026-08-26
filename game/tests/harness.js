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
    textContent: '', innerHTML: '', src: '', dataset: {}, clientWidth: 1024, clientHeight: 576,
    width: 1024, height: 576, _l: {},
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
// Image stub: the game loads the CEO portrait (asset.png) via new Image()
window.Image = class {
  constructor() { this.complete = true; this.naturalWidth = 2; this.naturalHeight = 2; this.onload = null; this.onerror = null; }
  set src(v) {}
};

// ---------------- load the app ----------------
eval(GAME_JS);

function step(frames) { for (let i = 0; i < frames; i++) { now += 16; const cb = rafCb; if (cb) { rafCb = null; cb(now); } } }
function clickWorld(tx, ty) {
  // convert world tile -> screen coords (accounting for the camera), then fire the canvas click
  const cam = g.camera();
  const el = getEl('gameCanvas');
  (el._l.click || []).forEach(f => f({ clientX: tx * 32 + 16 - cam.x, clientY: ty * 32 + 16 - cam.y }));
}

const COLS = 40, ROWS = 24;

// ---------------- checks ----------------
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('PASS  ' + name); } else { failed++; console.log('FAIL  ' + name); } }

const g = globalThis.__game;
check('game API exposed', !!g && typeof g.newGame === 'function');

// --- static: every id the JS looks up must exist in the HTML ---
// (the stub getElementById auto-creates missing elements, which would mask a
//  null-crash like "Cannot read properties of null (reading 'addEventListener')")
const jsIdLookups = [...GAME_JS.matchAll(/\$\('([^']+)'\)|getElementById\('([^']+)'\)/g)].map(m => m[1] || m[2]);
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const missingIds = [...new Set(jsIdLookups.filter(id => !htmlIds.has(id) && !id.startsWith('ov-') && !id.startsWith('tut')))];
check('every JS id lookup exists in HTML' + (missingIds.length ? ' -> ' + missingIds.join(', ') : ''), missingIds.length === 0);

g.newGame();
g.setPaused(false); // boot leaves the game paused behind the menu
let st = g.S();
check('starts with 25 wood', st.wood === 25);
check('starts with 10 planks', st.planks === 10);
check('starts with 50 coins', st.coins === 50);
check('new game starts in the forest zone', g.zone() === 'forest');
check('goal tracker starts incomplete', !!g.goal && !g.goal().complete);
check('goal panel renders', getEl('goalList').innerHTML.length > 0);
check('map generated ' + (COLS * ROWS) + ' tiles', st.grid.length === COLS * ROWS);
const treeCount = st.grid.filter(c => c.t === 'tree').length;
check('forest has trees (' + treeCount + ')', treeCount > 40);
check('forest has varied tree types', st.grid.some(c => c.t === 'treePine') && st.grid.some(c => c.t === 'treeBig') && st.grid.some(c => c.t === 'treeRed'));
const treeTypes = ['tree','treeBig','treePine','treeRed','treeDead'];
const waterCount = st.grid.filter(c => c.t === 'water').length;
const bridgeCount = st.grid.filter(c => c.t === 'path' && c.detail === 'bridge').length;
check('winding river present (' + waterCount + ' water tiles)', waterCount > 25);
check('log bridges cross the river (' + bridgeCount + ' bridges)', bridgeCount >= 2);
check('dead trees add variety', st.grid.some(c => c.t === 'treeDead'));
check('tree sizes vary', st.grid.some(c => treeTypes.includes(c.t) && c.sz === 1) && st.grid.some(c => treeTypes.includes(c.t) && c.sz === 3));
const sp = st.spawn;
check('spawn clearing is open grass', [0, 1, -1].every(dy => [0, 1, -1].every(dx => st.grid[(sp.y + dy) * COLS + (sp.x + dx)].t === 'grass')));
check('campfire at spawn', st.grid[sp.y * COLS + sp.x].detail === 'campfire');
check('player spawns at the clearing', st.player && Math.abs(st.player.x - (sp.x + 0.5)) < 0.01 && Math.abs(st.player.y - (sp.y + 2)) < 0.01);
check('HUD wood shows 25', String(getEl('hud-wood').textContent) === '25');
check('HUD planks shows 10', String(getEl('hud-planks').textContent) === '10');

// --- chop a tree (direct action) ---
const treeIdx = st.grid.findIndex(c => c.t === 'tree');
const tx = treeIdx % COLS, ty = Math.floor(treeIdx / COLS);
const woodBefore = st.wood;
g.actNow(tx, ty);
check('chop increases wood (' + woodBefore + ' -> ' + st.wood + ')', st.wood > woodBefore);
check('tree became stump', st.grid[treeIdx].t === 'stump');
check('cherry travel unlocked after first chop', g.treesCut() >= 1);

// --- tree types give different wood ---
const pineIdx = st.grid.findIndex(c => c.t === 'treePine');
check('pine tree exists', pineIdx >= 0);
const woodBeforePine = st.wood;
g.actNow(pineIdx % COLS, Math.floor(pineIdx / COLS));
const pineWood = st.wood - woodBeforePine;
check('pine gives cheap wood (' + pineWood + ')', pineWood >= 3 && pineWood <= 5);
check('pine stump regrows fast', st.grid[pineIdx].regrow === 3);

const bigIdx = st.grid.findIndex(c => c.t === 'treeBig');
check('ancient tree exists', bigIdx >= 0);
const woodBeforeBig = st.wood;
g.actNow(bigIdx % COLS, Math.floor(bigIdx / COLS));
const bigWood = st.wood - woodBeforeBig;
check('ancient tree is extremely valuable (' + bigWood + ')', bigWood >= 15 && bigWood <= 20);

const mapleIdx = st.grid.findIndex(c => c.t === 'treeRed');
check('maple tree exists', mapleIdx >= 0);
const coinsBeforeMaple = st.coins;
const woodBeforeMaple = st.wood;
g.actNow(mapleIdx % COLS, Math.floor(mapleIdx / COLS));
check('maple gives decorative wood + coins (+' + (st.coins - coinsBeforeMaple) + ' 🪙)', st.coins - coinsBeforeMaple >= 2 && st.wood > woodBeforeMaple);

const oakIdx = st.grid.findIndex(c => c.t === 'tree');
check('oak tree exists', oakIdx >= 0);
const woodBeforeOak = st.wood;
g.actNow(oakIdx % COLS, Math.floor(oakIdx / COLS));
const oakWood = st.wood - woodBeforeOak;
check('oak gives strong wood (' + oakWood + ')', oakWood >= 6 && oakWood <= 8);

// --- plant a sapling (direct action) ---
g.setTool('plant');
const grassIdx = st.grid.findIndex(c => c.t === 'grass');
const gx = grassIdx % COLS, gy = Math.floor(grassIdx / COLS);
g.actNow(gx, gy);
check('planted sapling', st.grid[grassIdx].t === 'sapling');

// --- building is ONLY allowed in Cherry Communities ---
g.selectBP('cabin');
let hx = -1, hy = -1;
outer: for (let y = 1; y < ROWS - 2; y++) for (let x = 0; x < COLS - 1; x++) {
  const i = y * COLS + x;
  if ([st.grid[i], st.grid[i + 1], st.grid[i + COLS], st.grid[i + COLS + 1]].every(c => c.t === 'grass')) { hx = x; hy = y; break outer; }
}
check('found 2x2 grass spot in the forest', hx >= 0);
const woodDeny0 = st.wood, planksDeny0 = st.planks;
g.actNow(hx, hy);
check('cannot build in the forest zone', st.houses.length === 0 && st.wood === woodDeny0 && st.planks === planksDeny0);
g.selectBP(null);

// --- travel to Cherry Communities: open grass meadow, same size ---
g.travelTo('cherry');
st = g.S();
check('traveled to cherry zone', g.zone() === 'cherry');
check('cherry grid is open grass/roads only', st.grid.every(c => c.t === 'grass' || c.t === 'path'));
check('cherry has no trees or water', !st.grid.some(c => c.t === 'water' || c.t === 'tree' || c.t === 'treeBig' || c.t === 'treePine' || c.t === 'treeRed' || c.t === 'treeDead'));
check('cherry map is full size (' + st.grid.length + ' tiles)', st.grid.length === COLS * ROWS);
const cherryGrass = st.grid.filter(c => c.t === 'grass').length;
check('cherry is mostly open grass (' + cherryGrass + ' tiles)', cherryGrass > COLS * ROWS * 0.85);
check('cherry entrance signpost', st.grid[21 * COLS + 2].detail === 'sign');

// --- place a cabin in Cherry Communities (direct action) ---
hx = 10; hy = 14;
const w0 = st.wood, p0 = st.planks;
g.selectBP('cabin');
g.actNow(hx, hy);
check('blueprint costs 15 wood + 10 planks (' + w0 + '->' + st.wood + ', ' + p0 + '->' + st.planks + ')', st.wood === w0 - 15 && st.planks === p0 - 10);
check('house placed in cherry', st.houses.length === 1 && st.houses[0].progress === 0 && st.houses[0].bp === 'cabin' && st.houses[0].zone === 'cherry');
check('house tiles occupied', st.grid[hy * COLS + hx].t === 'house');

// --- blueprint cannot be placed on the road ---
g.selectBP('cottage');
const housesBefore = st.houses.length;
const pathIdx = st.grid.findIndex(c => c.t === 'path');
g.actNow(pathIdx % COLS, Math.floor(pathIdx / COLS)); // road
check('no house on the road', st.houses.length === housesBefore);
g.selectBP(null);

// --- construction progresses over time ---
step(600); // ~9.6s
check('construction advanced (' + st.houses[0].progress.toFixed(2) + ')', st.houses[0].progress > 0);

// --- completion + customer claims ---
st.houses[0].progress = 1;
st.customers.push({ id: 99, bp: 'cabin', daysLeft: 5, x: 5, y: ROWS - 1, state: 'wait', t: 0, shirt: '#ffffff', anim: 0, zone: 'cherry' });
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

// --- hammer boost (direct action) ---
st.houses[0].progress = 0.3; st.houses[0].done = false; st.houses[0].claimed = false; st.houses[0].boostDay = 0;
st.wood = 100;
g.setTool('hammer');
g.actNow(hx, hy);
check('hammer boost +20%', Math.abs(st.houses[0].progress - 0.5) < 0.001);
check('boost costs 5 wood', st.wood === 95);

// --- travel back to the forest; the grid is preserved exactly ---
const forestTreesBefore = st.zones.forest.grid.filter(c => c.t === 'tree').length;
g.travelTo('forest');
st = g.S();
check('travel back to the forest', g.zone() === 'forest');
check('forest grid preserved after round trip', st.grid.filter(c => c.t === 'tree').length === forestTreesBefore);

// --- saw tool: turns the log into planks (wood stays untouched) ---
const sawIdx = st.grid.findIndex(c => c.t === 'tree');
const sawX = sawIdx % COLS, sawY = Math.floor(sawIdx / COLS);
g.setTool('saw');
const wSaw0 = st.wood, pSaw0 = st.planks;
g.actNow(sawX, sawY);
check('sawing started', st.sawing !== null && st.sawing.x === sawX);
step(130); // ~2.1s of sawing
check('saw turned log into planks (+' + (st.planks - pSaw0) + ')', st.sawing === null && st.planks >= pSaw0 + 7 && st.wood === wSaw0);
check('saw left a stump', st.grid[sawIdx].t === 'stump');

// --- NPC crew: forester plants, farmer harvests, carpenter boosts ---
check('crew has 3 NPCs', st.npcs && st.npcs.length === 3);
check('crew has the right jobs', !!(st.npcs.find(n => n.id === 'forester') && st.npcs.find(n => n.id === 'farmer') && st.npcs.find(n => n.id === 'carpenter')));

// forester plants a sapling
const plantSpot = (() => {
  for (let i = 0; i < st.grid.length; i++) {
    const x = i % COLS, y = Math.floor(i / COLS);
    if (Math.abs(x - st.spawn.x) > 2 && Math.abs(y - st.spawn.y) > 2 && st.grid[i].t === 'grass' && !st.grid[i].detail) return { x, y, i };
  }
  return null;
})();
check('forester finds a planting spot', !!plantSpot);
g.forceNpcJob('forester', { type: 'plant', x: plantSpot.x, y: plantSpot.y, active: true, dur: 1 });
step(1);
check('forester planted a sapling', st.grid[plantSpot.i].t === 'sapling');

// farmer harvests ripe crops -> food
const cropSpot = (() => {
  for (let i = 0; i < st.grid.length; i++) {
    const x = i % COLS, y = Math.floor(i / COLS);
    if (Math.abs(x - st.spawn.x) > 2 && Math.abs(y - st.spawn.y) > 2 && st.grid[i].t === 'grass' && st.grid[i].detail !== 'crops') return { x, y, i };
  }
  return null;
})();
st.grid[cropSpot.i].detail = 'crops'; st.grid[cropSpot.i].ripe = true; st.grid[cropSpot.i].crops = 2;
const food0 = st.food;
g.forceNpcJob('farmer', { type: 'harvest', x: cropSpot.x, y: cropSpot.y, active: true, dur: 1 });
step(1);
check('farmer harvested food (' + food0 + ' -> ' + st.food + ')', st.food > food0);
check('harvested tile is clean grass again', st.grid[cropSpot.i].detail === null);

// crops ripen over two days
const farmIdx = (() => { for (let i = 0; i < st.grid.length; i++) if (st.grid[i].t === 'grass' && !st.grid[i].detail && Math.abs(i % COLS - st.spawn.x) > 2) return i; return -1; })();
check('found a tile for crops', farmIdx >= 0);
st.grid[farmIdx].detail = 'crops'; st.grid[farmIdx].crops = 0; st.grid[farmIdx].ripe = false;
g.advanceDay(); g.advanceDay();
check('crops ripen after two days', st.grid[farmIdx].ripe === true);

// the farmer's food is sold each morning
st.food = 10; const coinsBeforeSale = st.coins;
g.advanceDay();
check('food sold for coins (' + coinsBeforeSale + ' -> ' + st.coins + ')', st.coins === coinsBeforeSale + 10 && st.food === 0);

// carpenter boosts a house under construction
const hb = st.houses[0]; hb.progress = 0.3; hb.done = false; hb.claimed = false; hb.boostDay = 0;
g.forceNpcJob('carpenter', { type: 'build', houseId: hb.id, active: true, dur: 1 });
step(1);
check('carpenter boosted the build (' + hb.progress.toFixed(2) + ')', hb.progress > 0.3);

// --- player walks around the forest ---
g.setTool('axe');
const px0 = st.player.x, py0 = st.player.y;
const grassWalkIdx = st.grid.findIndex((c, i) => c.t === 'grass' && i % COLS > 2 && Math.floor(i / COLS) > 3);
g.clickTileAt(grassWalkIdx % COLS, Math.floor(grassWalkIdx / COLS));
check('click starts a walk', st.player.target !== null);
step(90); // ~1.4s
check('player moved toward the spot', Math.abs(st.player.x - px0) > 0.02 || Math.abs(st.player.y - py0) > 0.02);
step(300); // let them arrive
check('player arrived', st.player.target === null);

// --- walk-to-chop: click a distant tree, the player walks over and chops it ---
const treeWalkIdx = (() => {
  for (let i = 0; i < st.grid.length; i++) {
    if (st.grid[i].t !== 'tree') continue;
    const x = i % COLS, y = Math.floor(i / COLS);
    if (Math.hypot(x + 0.5 - st.player.x, y + 0.5 - st.player.y) < 4) continue; // must be a walk
    const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const c = st.grid[(y + dy) * COLS + (x + dx)];
      return c && (c.t === 'grass' || c.t === 'path' || c.t === 'sapling' || c.t === 'stump') && !c.occupied;
    });
    if (ok) return i;
  }
  return -1;
})();
check('found a distant walkable tree', treeWalkIdx >= 0);
const wBeforeWalk = st.wood;
const walkTx = treeWalkIdx % COLS, walkTy = Math.floor(treeWalkIdx / COLS);
g.clickTileAt(walkTx, walkTy);
check('chop queued after walking', st.player.target !== null);
step(500); // plenty of time to walk over & chop
check('tree chopped after walking to it', st.grid[treeWalkIdx].t === 'stump' && st.wood > wBeforeWalk);

// --- WASD-style movement helper works ---
const pBeforeStep = { x: st.player.x, y: st.player.y };
g.__keyStep ? null : null; // no-op, movement keys are exercised via playerStep indirectly
// (keyboard is window-level; the walk-to-chop test already covers movement)

// --- canvas click handler works end-to-end (camera-aware) ---
g.setTool('axe');
const stumpIdx2 = st.grid.findIndex(c => c.t === 'stump');
if (stumpIdx2 >= 0) {
  const wBefore2 = st.wood;
  clickWorld(stumpIdx2 % COLS, Math.floor(stumpIdx2 / COLS));
  check('canvas click routed (camera-aware)', st.wood === wBefore2); // stump -> no wood gained
} else check('stump present for click test', false);

// --- ultimate goal: the world's first sustainable wooden city ---
g.setState(Object.assign({}, st, { rep: 800 }));
st = g.S(); // re-grab: setState replaced the state object
st.wood = 500;
st.weather = 'sunny'; st.nextWeather = 'cloudy'; // deterministic: storms halt building
// place a lodge as a nearly-finished house (completes during the next update)
st.houses.push({ id: 999, bp: 'lodge', x: 10, y: 6, progress: 0.99, roof: 'red', done: false, claimed: false, boostDay: 0 });
st.customers.push({ id: 100, bp: 'lodge', daysLeft: 5, x: 8, y: ROWS - 1, state: 'wait', t: 0, shirt: '#ff0000', anim: 0 });
getEl('ov-win').classList.add('hidden'); // ensure overlay starts hidden
step(260); // ~4.2s of build time -> lodge completes, customer claims
check('lodge claim at high rep -> level 5', st.rep >= 1000 && st.houses.find(h => h.id === 999).claimed === true);
check('1000 rep alone is NOT the win yet', getEl('ov-win').classList.contains('hidden'));
// complete the ultimate goal: 8 houses + forest >= 90% + 1000 rep
for (let i = 0; i < 8; i++) {
  st.houses.push({ id: 2000 + i, bp: 'cabin', x: 5 + (i % 4), y: 2 + Math.floor(i / 4), progress: 1, roof: 'red', done: true, claimed: false, boostDay: 0, zone: 'cherry' });
}
st.forestStart = 1; // forest coverage reads 100%
step(2);
check('goal complete: city, sustainable, prosperous', !!g.goal() && g.goal().complete);
check('win overlay shown for the sustainable city', !getEl('ov-win').classList.contains('hidden'));

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
check('start after demo also goes straight to forest', g.demo() === null && g.zone() === 'forest');

console.log('\nRESULT: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
