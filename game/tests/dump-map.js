// ASCII dump of the generated world (for layout sanity checks)
'use strict';
const fs = require('fs');
const html = fs.readFileSync('C:/Users/Student/Desktop/instabuilt/game/index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
const GAME_JS = m[1].replace("'use strict';", '');

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
const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const requestAnimationFrame = () => 0;
const performance = { now() { return 1000; } };
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

eval(GAME_JS);
globalThis.__game.newGame();
const S = globalThis.__game.S();
const sym = { 'grass': '.', 'water': '~', 'tree': 'T', 'treePine': 'P', 'treeBig': 'B', 'treeRed': 'R', 'treeDead': 'D', 'sapling': 's', 'stump': 'u', 'path': '-' };
for (let y = 0; y < 24; y++) {
  let row = '';
  for (let x = 0; x < 40; x++) {
    const c = S.grid[y * 40 + x];
    let ch = sym[c.t] || '?';
    if (c.t === 'path' && c.detail === 'bridge') ch = '=';
    if (c.detail === 'campfire') ch = '*';
    if (c.detail === 'fence') ch = '#';
    row += ch;
  }
  console.log(row);
}
const stats = {};
for (const c of S.grid) stats[c.t] = (stats[c.t] || 0) + 1;
console.log(JSON.stringify(stats));
console.log('bridges:', S.grid.filter(c => c.t === 'path' && c.detail === 'bridge').length);
