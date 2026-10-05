/* =====================================================================
   BETWEEN BLOOM AND DECAY
   A tiny pixel-art ecosystem about emergence from simple local rules.

   You are a small forest spirit in a misty morning clearing. Moving
   awakens life; lingering consumes it; a pulse from the spirit makes the
   ground briefly more fertile. Grass thickens, blossoms open, moths
   follow the flowers and scatter seeds, and everything eventually fades
   back into soil that can wake again.

   File layout
     1. Tunable parameters (CONFIG) and colours (PALETTE)
     2. World state + composed world generation (clearing, paths, groves)
     3. The ecosystem rules (one "tick" of the simulation)
     4. The spirit (player), moths (creatures), fertility pulse, particles
     5. Sprites (all pixel art is generated in code at startup)
     6. Rendering: ground, patches, trees, light, mist, frame, title
     7. p5 entry points: setup / draw / input
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. TUNABLE PARAMETERS
   All times are in simulation ticks unless noted. One tick happens
   every CONFIG.SIM_EVERY frames (6 frames ≈ 10 ticks per second).
   --------------------------------------------------------------------- */
const CONFIG = {
  // --- world size ----------------------------------------------------
  COLS: 40,               // tiles across
  ROWS: 25,               // tiles down
  TILE: 8,                // pixels per tile (internal resolution)
  MAX_SCALE: 6,           // largest integer upscale on big screens
  SIM_EVERY: 6,           // frames between ecosystem ticks

  // --- rule 1: movement awakens life ---------------------------------
  AWAKEN_RADIUS: 2.2,     // tiles around the moving spirit
  AWAKEN_CHANCE: 0.03,    // per frame, per bare tile in that radius

  // --- natural growth ------------------------------------------------
  SPREAD_RATE: 0.0016,    // grass creeping into soil, per living neighbour
  SOIL_REST: 45,          // soil must rest this long after decay before regrowing
  GROWTH_RATE: 0.03,      // grass -> thick undergrowth when supported
  GROWTH_NEIGHBOURS: 4,   // living neighbours needed to thicken
  ISOLATION_DEATH: 0.006, // lone grass with no living neighbours may wither

  // --- rule 3: dense life creates blossoms ---------------------------
  FLOWER_CHANCE: 0.006,   // undergrowth -> blossom per tick when dense
  FLOWER_NEIGHBOURS: 5,   // dense neighbours (undergrowth/blossom) required

  // --- decay ---------------------------------------------------------
  BLOOM_LIFESPAN: 170,    // ticks a blossom lives (plus up to +80 random)
  SEED_FALL: 0.3,         // when a blossom dies, chance per bare neighbour to sprout
  MATURE_AGE: 140,        // undergrowth older than this can catch decay
  DECAY_SPREAD: 0.014,    // per withered neighbour, on mature undergrowth
  SENESCENCE: 0.0004,     // old undergrowth occasionally withers on its own

  // --- rule 6: decay enables renewal ---------------------------------
  WITHER_TIME: 90,        // minimum ticks a tile stays withered
  RENEW_CHANCE: 0.03,     // per tick after that, withered -> soil

  // --- rule 2: presence consumes life --------------------------------
  PRESENCE_RADIUS: 1.7,   // tiles the spirit "weighs on"
  PRESENCE_GAIN: 0.02,    // heat added per frame
  HEAT_DECAY: 0.985,      // heat multiplier per tick (memory of presence)
  CONSUME_THRESHOLD: 3.0, // heat above which life starts to be consumed
  CONSUME_RATE: 0.07,     // chance per tick to step a tile down toward decay

  // --- the spirit ----------------------------------------------------
  PLAYER_SPEED: 0.8,      // pixels per frame

  // --- fertility pulse (click) ----------------------------------------
  // The pulse never creates plants. It leaves "fertility" on the ground,
  // which multiplies the chances of the natural rules for a while.
  PULSE_RADIUS: 4.5,      // tiles: final radius of the pulse
  PULSE_DURATION: 60,     // frames the ring takes to expand
  PULSE_COOLDOWN: 90,     // frames between pulses
  FERTILITY_DECAY: 0.988, // fertility multiplier per tick (~6 s half-life)
  FERTILE_BOOST: 3,       // at full fertility, regrowth/growth chances x(1+3)
  FERTILE_SPROUT: 0.004,  // tiny chance for fertile soil to sprout on its own

  // --- rules 4 & 5: creatures ----------------------------------------
  CREATURE_COUNT: 16,
  CREATURE_SPEED: 0.5,    // pixels per frame
  SENSE_RADIUS: 12,       // tiles: how far a moth can sense blossoms
  SEED_CHANCE: 0.007,     // per frame over rested soil: drop a seed
  POLLINATE_CHANCE: 0.006,// per frame while resting: wake a nearby blossom

  // --- scene composition (visual layout of each new world) -----------
  CLEARING_RX: 9,         // tiles: half-width of the open, sunlit clearing
  CLEARING_RY: 6,         // tiles: half-height of the clearing
  GROVES: 3,              // clusters of trees around the clearing
  TREES_PER_GROVE: 4,     // up to this many trees per grove
  LONE_TREES: 2,          // single young trees at the clearing's edge
  ROCKS: 3,
  STUMPS: 2,
  PATH_WIDTH: 3.6,        // pixels: half-width of the worn footpaths

  // --- trampling (visual only) ----------------------------------------
  TRAMPLE_GAIN: 0.006,    // wear added per frame the spirit moves over a tile
  TRAMPLE_DECAY: 0.9992,  // wear multiplier per tick

  // --- light & atmosphere --------------------------------------------
  AMBIENT: 0.6,           // base light level of the forest (0..1)
  EDGE_SHADE: 0.2,        // extra shade toward the edges of the map
  GROVE_SHADE: 0.22,      // extra shade beneath tree crowns
  CLEARING_SUN: 0.18,     // extra light in the clearing
  PLAYER_LIGHT: 40,       // radius of the spirit's glow in pixels
  BLOOM_LIGHT: 10,        // radius of each blossom's glow
  MOTH_LIGHT: 8,          // radius of each moth's glow
  SHADE_ALPHAS: [86, 60, 38, 18, 0], // blue-green shade per light step (shaded -> lit)
  MIST_ALPHAS: [0, 16, 30],          // morning mist steps (strongest at the forest edge)
  SUN_ALPHAS: [0, 14, 26],           // warm sun-dapples drifting over the clearing
  MIST_SCALE: 0.07,       // size of mist banks (smaller = bigger banks)
  MIST_SPEED: 0.0025,     // how fast the mist drifts
  WIND_SPEED: 0.03,       // speed of the gusts that sway grass and crowns
  GUST: 0.55,             // higher = calmer (fewer plants leaning at once)
  DRIFT_EVERY: 14,        // frames between drifting fluff motes
  LEAF_EVERY: 70,         // frames between falling leaves
};

/* Misty early-morning palette. Warm soil and cooler shaded soil, moss
   and sage greens, blue-green shade, pale beige decay, and cream / pink /
   soft-gold blossoms. All sprites are built from these colours. */
const PALETTE = {
  void:        '#22363a',   // page background / letterbox
  shadow:      '#2e5052',   // colour of shade in the lighting pass (blue-green)
  mist:        '#e1ebe3',   // morning mist
  sun:         '#fff2cc',   // warm sun-dapples
  fadeIn:      '#d9e4db',   // the world fades in from mist

  // ground: warm base soil, cooler shaded soil, lighter worn soil
  soil:        '#7a5a3e',
  soilDark:    '#6a4d35',
  soilLight:   '#876649',
  coolSoil:    '#68584a',
  coolSoilDark:'#5b4c41',
  coolSoilLight:'#756455',
  wornSoil:    '#97764f',
  wornDark:    '#8a6a47',
  wornLight:   '#a98760',
  pebble:      '#a09079',
  pebbleLight: '#c3b59b',
  pebbleShadow:'#574536',
  twig:        '#4f3a28',
  twigLight:   '#7a5c40',
  root:        '#4a3727',
  rootLight:   '#6e5640',
  leafRust:    '#b36c3c',
  leafOchre:   '#cf9d50',
  leafDark:    '#8e5532',
  leafGold:    '#dcbc62',
  needle:      '#5f4632',
  shadeMoss:   '#6d7a52',

  // stage 2 — grass (sage tufts on soil)
  grassDark:   '#5f7a4c',
  grass:       '#86a067',
  grassLight:  '#a9bf84',
  seedHead:    '#d6cb98',
  daisy:       '#fbf6e6',

  // stage 3 — lush (a raised moss cushion with ferns and tall grass)
  moss:        '#5a754e',
  mossLight:   '#68845a',
  lushDark:    '#4a6545',
  mossLip:     '#3f5a40',   // shadowed lower edge of a patch
  mossRim:     '#7d9a68',   // sunlit upper edge of a patch
  lush:        '#6c8b5c',
  lushLight:   '#8aa872',
  clover:      '#7fa66a',
  teal:        '#5f8f7f',

  // stage 4 — blossom
  bloomA:      '#f5eed6',   // cream bells
  bloomADim:   '#d8cfb1',
  bloomB:      '#efb8c3',   // soft pink
  bloomBDark:  '#d993a4',
  bloomC:      '#eccb7a',   // soft gold
  bloomCore:   '#fffbef',

  // stage 5 — pale decay (faded beige litter)
  drySoil:     '#b39c7a',
  drySoilDark: '#a28b6a',
  drySoilLight:'#c4af8d',
  litterLip:   '#8f7a5c',
  witherDark:  '#8d7859',
  wither:      '#c5b08c',
  witherLight: '#ddd0b1',
  mushroom:    '#efe6d6',
  mushroomTop: '#fbf6ec',
  mushroomStem:'#c9bba3',

  // trees and props
  bark:        '#5a4636',
  barkLight:   '#715a46',
  barkHi:      '#86705a',
  barkDark:    '#443428',
  barkOutline: '#33281f',
  barkMoss:    '#7d9668',
  birch:       '#e4ddcc',
  birchShade:  '#bdb3a0',
  birchMark:   '#5c544a',
  oak:   { outline: '#2d4842', deep: '#3b5c51', mid: '#4d7361', light: '#628a6c', hi: '#82a77d' },
  fir:   { outline: '#233b3d', deep: '#2d4b4b', mid: '#3a605c', light: '#4c776c', hi: '#669480' },
  aspen: { outline: '#4b6844', deep: '#5d7f50', mid: '#759a5e', light: '#92b370', hi: '#b3cc89' },
  frame: { outline: '#1f3436', deep: '#28403f', mid: '#32504b', light: '#3f6156', hi: '#4f7462' },
  frameGrass:  '#2b4540',
  frameGrassLight: '#3d5f50',
  rock:        '#868b84',
  rockLight:   '#a6aba0',
  rockDark:    '#666b67',
  rockOutline: '#4b4f4c',
  stumpTop:    '#b8916a',
  stumpRing:   '#9a7652',

  // the spirit: ivory / green-white, shifting to amber as it lingers
  spiritCore:  ['#fdfaee', '#fbefcf', '#f6deac', '#efc785', '#e5aa5e'],
  spiritGlow:  ['#dcefd8', '#e6e6bd', '#ead49b', '#e4b877', '#d39750'],
  spiritDim:   '#b2d4bd',
  spiritShadow:'#4f3c2b',
  presence:    '#e3a75a',   // amber marks around a lingering spirit

  // moths
  mothA:       '#fff5d2',
  mothAWing:   '#e8cf8f',
  mothB:       '#eef8ff',
  mothBWing:   '#b6d6e5',

  // fertility pulse and lingering dew
  pulse:       '#f4f8e8',
  pulseMid:    '#d3e8d2',
  pulseDim:    '#a8ccb8',
  dew:         '#eaf6ef',
  dewDim:      '#bfdccf',

  // ambient life
  fluff:       '#f7f3e3',
  fluffDim:    '#dfe6da',

  seed:        '#a17f4f',
  title:       '#fbf7e8',
  titleShadow: '#3e5b55',
  hint:        '#eef3e6',
};

// Tile states
const SOIL = 0, GRASS = 1, LUSH = 2, BLOOM = 3, WITHERED = 4, ROOT = 5;
// Tree kinds
const OAK = 0, FIR = 1, ASPEN = 2;

// Derived sizes
const T = CONFIG.TILE;
const W = CONFIG.COLS * T;          // internal width  (320 px)
const H = CONFIG.ROWS * T;          // internal height (200 px)
const N = CONFIG.COLS * CONFIG.ROWS;
const LCELL = 4;                    // lighting is computed on 4x4 pixel cells
const LW = W / LCELL, LH = H / LCELL;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5;   // -0.5..0.5


/* ---------------------------------------------------------------------
   2. WORLD STATE
   --------------------------------------------------------------------- */
let state, nextState;   // tile states
let age;                // ticks since a tile last changed state
let heat;               // how much the spirit has "weighed" on each tile
let variant;            // which of 4 sprite variants a tile uses
let phase;              // per-tile animation offset so plants sway out of sync
let lifespan;           // per-tile jitter for blossom lifespans
let fert;               // temporary fertility left by the spirit's pulse (0..1)
let worn;               // trampling from the spirit's walks (visual only)

let trees = [];
let props = [];         // rocks and stumps
let creatures = [];
let pulses = [];
let particles = [];
let player;

let clearing;           // the open, sunlit heart of the map {x, y, rx, ry} in pixels
let paths = [];         // worn footpaths (lists of points)
let wornField;          // per-pixel path wear, baked into the ground
let baseLight;          // per-cell ambient light: shady groves, sunlit clearing

let sprites;            // generated pixel-art images
let groundImg, shadowImg;
let lightImg, light;    // lighting overlay image and its float buffer
let mistImg;            // drifting mist + sun-dapple overlay
let frameTop, frameBottom;

let pulseCooldown = 0;
let hasMoved = false;   // the title fades once the spirit first moves
let titleFade = 0;
let fadeIn = 0;         // stepped fade-in from mist after (re)generation
let tickCount = 0;

const idx = (x, y) => y * CONFIG.COLS + x;
const inGrid = (x, y) => x >= 0 && y >= 0 && x < CONFIG.COLS && y < CONFIG.ROWS;
const isLiving = (s) => s === GRASS || s === LUSH || s === BLOOM;

/* Small seeded random generator so each world is reproducible. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Smooth value noise (used for soil mottling, mist and patch edges). */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/* Change a tile's state and restart its age. */
function setTile(i, s) {
  if (state[i] === s) return;
  state[i] = s;
  nextState[i] = s;
  age[i] = 0;
}

/* 1 at the clearing's centre, falling to 0 at its rim. */
function clearingFactor(px, py) {
  const dx = (px - clearing.x) / clearing.rx, dy = (py - clearing.y) / clearing.ry;
  return Math.max(0, 1 - Math.hypot(dx, dy));
}

/* A footpath: a Catmull-Rom curve through a few control points. */
function makePath(ctrl, width) {
  const pts = [];
  for (let s = 0; s < ctrl.length - 1; s++) {
    const p0 = ctrl[Math.max(0, s - 1)], p1 = ctrl[s], p2 = ctrl[s + 1], p3 = ctrl[Math.min(ctrl.length - 1, s + 2)];
    const len = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    for (let k = 0; k < len; k++) {
      const t = k / len, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return { pts, width };
}

function stampPaths() {
  wornField = new Float32Array(W * H);
  for (const p of paths) {
    p.pts.forEach(([x, y], k) => {
      const w = p.width * (0.8 + 0.4 * valueNoise(k * 0.04, p.width * 10));  // width breathes along the path
      for (let yy = Math.floor(y - w); yy <= Math.ceil(y + w); yy++) {
        for (let xx = Math.floor(x - w); xx <= Math.ceil(x + w); xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const v = 1 - Math.hypot(xx - x, yy - y) / w;
          const j = yy * W + xx;
          if (v > wornField[j]) wornField[j] = v;
        }
      }
    });
  }
}
const wornAt = (px, py) => {
  const x = Math.max(0, Math.min(W - 1, Math.floor(px))), y = Math.max(0, Math.min(H - 1, Math.floor(py)));
  return wornField[y * W + x];
};

/* Can a tree / prop with a footprint of `wTiles` stand at (tx, ty)? */
function canPlace(tx, ty, wTiles, minDist, allowTop) {
  if (tx < 0 || tx + wTiles > CONFIG.COLS || ty < (allowTop ? 1 : 3) || ty > CONFIG.ROWS - 2) return false;
  for (let k = 0; k < wTiles; k++) {
    const x = tx + k, px = x * T + 4, py = ty * T + 4;
    if (state[idx(x, ty)] === ROOT) return false;
    if (clearingFactor(px, py) > 0) return false;
    for (const [ox, oy] of [[0, 0], [-5, 0], [5, 0], [0, -5], [0, 5]]) if (wornAt(px + ox, py + oy) > 0.05) return false;
  }
  for (const o of trees.concat(props)) if (Math.hypot(o.tx - tx, o.ty - ty) < minDist) return false;
  return true;
}

function generateWorld(seed) {
  const rnd = mulberry32(seed);
  const C = CONFIG;

  state = new Uint8Array(N);
  nextState = new Uint8Array(N);
  age = new Uint16Array(N);
  heat = new Float32Array(N);
  variant = new Uint8Array(N);
  phase = new Uint8Array(N);
  lifespan = new Uint8Array(N);
  fert = new Float32Array(N);
  worn = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    variant[i] = Math.floor(rnd() * 4);
    phase[i] = Math.floor(rnd() * 56);
    lifespan[i] = Math.floor(rnd() * 80);
    age[i] = C.SOIL_REST + Math.floor(rnd() * 200); // soil starts rested
  }

  // --- the clearing: an open, sunlit space near the middle ----------------
  clearing = {
    x: W / 2 + (rnd() - 0.5) * 40, y: H / 2 + (rnd() - 0.5) * 16 + 4,
    rx: C.CLEARING_RX * T, ry: C.CLEARING_RY * T,
  };

  // --- footpaths: a main route crossing the clearing and one branch -------
  const cl = clearing, side = rnd() < 0.5 ? -1 : 1;
  paths = [makePath([
    [-8, cl.y + (rnd() - 0.5) * 70],
    [cl.x - cl.rx * 0.95, cl.y + (rnd() - 0.2) * 22],
    [cl.x + cl.rx * 0.15, cl.y + cl.ry * 0.35 + (rnd() - 0.5) * 10],
    [cl.x + cl.rx * 1.1, cl.y + (rnd() - 0.5) * 26],
    [W + 8, cl.y + (rnd() - 0.5) * 70],
  ], C.PATH_WIDTH)];
  const bx = cl.x + (rnd() - 0.5) * cl.rx * 0.8;
  paths.push(makePath([
    [bx, cl.y + cl.ry * 0.2],
    [bx + (rnd() - 0.5) * 40, cl.y + side * cl.ry * 1.1],
    [bx + (rnd() - 0.5) * 70, side < 0 ? -8 : H + 8],
  ], C.PATH_WIDTH * 0.75));
  stampPaths();

  // --- groves: clusters of trees around the clearing ---------------------
  trees = []; props = [];
  const spots = [[4, 4], [C.COLS - 6, 4], [4, C.ROWS - 4], [C.COLS - 6, C.ROWS - 4],
                 [C.COLS / 2, 3], [C.COLS / 2, C.ROWS - 3], [3, C.ROWS / 2], [C.COLS - 5, C.ROWS / 2]];
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  const groves = [];
  for (const [gx, gy] of spots) {
    if (groves.length >= C.GROVES) break;
    if (groves.some(g => Math.hypot(g.x - gx, g.y - gy) < 12)) continue;
    groves.push({ x: gx, y: gy, kind: [OAK, FIR, OAK, FIR, ASPEN][Math.floor(rnd() * 5)] });
  }
  for (const g of groves) {
    let placed = 0;
    for (let tries = 0; tries < 60 && placed < C.TREES_PER_GROVE; tries++) {
      const kind = rnd() < 0.7 ? g.kind : [OAK, FIR, ASPEN][Math.floor(rnd() * 3)];
      const tx = Math.round(g.x + (rnd() - 0.5) * 10), ty = Math.round(g.y + (rnd() - 0.5) * 7);
      if (addTree(kind, tx, ty, rnd, true)) placed++;
    }
  }
  // a couple of young trees standing alone at the clearing's edge
  for (let k = 0, tries = 0; k < C.LONE_TREES && tries < 80; tries++) {
    const a = rnd() * Math.PI * 2;
    const tx = Math.round((cl.x + Math.cos(a) * cl.rx * 1.15) / T), ty = Math.round((cl.y + Math.sin(a) * cl.ry * 1.2) / T);
    if (addTree(rnd() < 0.7 ? ASPEN : OAK, tx, ty, rnd, false)) k++;
  }

  // --- rocks beside the paths, stumps near the groves ---------------------
  for (let k = 0, tries = 0; k < C.ROCKS && tries < 120; tries++) {
    const p = paths[Math.floor(rnd() * paths.length)], q = p.pts[Math.floor(rnd() * p.pts.length)];
    const off = (rnd() < 0.5 ? -1 : 1) * (p.width + 5 + rnd() * 6);
    const tx = Math.floor((q[0] + off) / T), ty = Math.floor((q[1] + off * 0.6) / T);
    if (canPlace(tx, ty, 1, 3, false)) { props.push({ kind: 'rock', tx, ty, x: tx * T + 4, y: ty * T + T }); state[idx(tx, ty)] = ROOT; k++; }
  }
  for (let k = 0, tries = 0; k < C.STUMPS && tries < 120; tries++) {
    const g = groves[Math.floor(rnd() * groves.length)];
    const tx = Math.round(g.x + (rnd() - 0.5) * 12), ty = Math.round(g.y + (rnd() - 0.5) * 9);
    if (canPlace(tx, ty, 1, 3, false)) { props.push({ kind: 'stump', tx, ty, x: tx * T + 4, y: ty * T + T }); state[idx(tx, ty)] = ROOT; k++; }
  }

  // --- vegetation: understory spilling from each grove toward the light,
  //     plus a little along the paths. The clearing itself stays open. ----
  const patches = [];
  for (const g of groves) {
    const a = Math.atan2(cl.y / T - g.y, cl.x / T - g.x);
    patches.push({ px: g.x + Math.cos(a) * 3, py: g.y + Math.sin(a) * 2.5, r: 3 + rnd() * 1.6 });
  }
  for (let k = 0; k < 2; k++) {
    const p = paths[0], q = p.pts[Math.floor((0.15 + rnd() * 0.7) * p.pts.length)];
    const off = rnd() < 0.5 ? -14 : 14;
    patches.push({ px: q[0] / T, py: (q[1] + off) / T, r: 1.8 + rnd() * 1.2 });
  }
  const nOff = rnd() * 100;
  for (const p of patches) {
    for (let y = Math.floor(p.py - p.r - 2); y <= p.py + p.r + 2; y++) {
      for (let x = Math.floor(p.px - p.r - 2); x <= p.px + p.r + 2; x++) {
        if (!inGrid(x, y)) continue;
        const i = idx(x, y);
        if (state[i] !== SOIL) continue;
        if (clearingFactor(x * T + 4, y * T + 4) > 0.35) continue;
        // a noisy distance gives each patch an irregular, natural silhouette
        const d = Math.hypot(x - p.px, (y - p.py) * 1.2) + (valueNoise(x * 0.5 + nOff, y * 0.5) - 0.5) * 2.2;
        if (d < p.r * 0.45) state[i] = rnd() < 0.3 ? BLOOM : LUSH;
        else if (d < p.r * 0.8) state[i] = rnd() < 0.7 ? LUSH : GRASS;
        else if (d < p.r) state[i] = rnd() < 0.8 ? GRASS : SOIL;
        else if (d < p.r + 0.9 && rnd() < 0.18) state[i] = WITHERED;
        if (state[i] !== SOIL) age[i] = Math.floor(rnd() * 60);
      }
    }
  }
  // a few stray tufts of grass out in the open
  for (let k = 0; k < 8; k++) {
    const i = Math.floor(rnd() * N);
    if (state[i] === SOIL) { state[i] = GRASS; age[i] = Math.floor(rnd() * 80); }
  }
  nextState.set(state);

  // --- the spirit starts in the clearing --------------------------------
  player = new Spirit(cl.x, cl.y);

  // --- moths start near the living patches -------------------------------
  creatures = [];
  for (let c = 0; c < C.CREATURE_COUNT; c++) {
    const p = patches[c % patches.length];
    creatures.push(new Moth(p.px * T + rnd() * 24 - 12, p.py * T + rnd() * 24 - 12, rnd));
  }

  // --- bake the static ground, shadows and ambient light ------------------
  bakeGround(rnd);
  bakeShadows();
  bakeAmbientLight();

  pulses = [];
  particles = [];
  hasMoved = false;
  titleFade = 0;
  fadeIn = 0;
}

/* Trees: OAK = broad rounded crown (2-tile trunk), FIR = tall tiered
   conifer, ASPEN = small airy pale-barked tree. */
const TREE_INFO = {
  [OAK]:   { foot: 2, minDist: 5,   crownR: 15, shadowRx: 14 },
  [FIR]:   { foot: 1, minDist: 4,   crownR: 11, shadowRx: 10 },
  [ASPEN]: { foot: 1, minDist: 3.5, crownR: 9,  shadowRx: 7 },
};
function addTree(kind, tx, ty, rnd, allowTop) {
  const info = TREE_INFO[kind];
  if (!canPlace(tx, ty, info.foot, info.minDist, allowTop)) return false;
  const seed = Math.floor(rnd() * 1e9);
  const t = {
    kind, tx, ty, foot: info.foot, crownR: info.crownR, shadowRx: info.shadowRx,
    x: tx * T + info.foot * T / 2, y: ty * T + T,
    frames: [0, 1].map(f => makeTreeSprite(kind, mulberry32(seed), f)),
  };
  t.h = t.frames[0].height;
  trees.push(t);
  for (let k = 0; k < info.foot; k++) state[idx(tx + k, ty)] = ROOT;
  return true;
}

/* ---------------------------------------------------------------------
   3. THE ECOSYSTEM RULES
   Every tick each tile looks only at its 8 neighbours (and at the
   spirit's lingering "heat"). Nothing here knows about patches, waves
   or trails — those emerge.
   --------------------------------------------------------------------- */
function simulateTick() {
  const C = CONFIG;
  nextState.set(state);

  for (let y = 0; y < C.ROWS; y++) {
    for (let x = 0; x < C.COLS; x++) {
      const i = idx(x, y);
      const s = state[i];
      if (s === ROOT) continue;

      // Count the neighbourhood.
      let living = 0, dense = 0, withered = 0, blooms = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (!inGrid(nx, ny)) continue;
          const n = state[idx(nx, ny)];
          if (isLiving(n)) living++;
          if (n === LUSH || n === BLOOM) dense++;
          if (n === BLOOM) blooms++;
          if (n === WITHERED) withered++;
        }
      }
      const a = age[i];
      const r = Math.random();
      // Fertility from the spirit's pulse only multiplies natural chances.
      const f = fert[i];
      const boost = 1 + C.FERTILE_BOOST * f;

      switch (s) {
        case SOIL: {
          // Grass slowly creeps into rested soil next to living tiles.
          // Fertile soil rests less and can occasionally sprout by itself.
          const rest = C.SOIL_REST * (1 - 0.6 * f);
          if (a > rest && r < C.SPREAD_RATE * living * boost + C.FERTILE_SPROUT * f) nextState[i] = GRASS;
          break;
        }

        case GRASS:
          // Supported grass thickens; isolated grass struggles.
          if (living >= C.GROWTH_NEIGHBOURS && a > 20 && r < C.GROWTH_RATE * boost) nextState[i] = LUSH;
          else if (living === 0 && r < C.ISOLATION_DEATH * (1 - f)) nextState[i] = WITHERED;
          break;

        case LUSH:
          // RULE 3 — dense life creates blossoms.
          if (dense >= C.FLOWER_NEIGHBOURS && r < C.FLOWER_CHANCE) nextState[i] = BLOOM;
          // Decay is contagious for mature undergrowth (creates waves).
          else if (a > C.MATURE_AGE && r < C.DECAY_SPREAD * withered + C.SENESCENCE) nextState[i] = WITHERED;
          break;

        case BLOOM: {
          // Crowded blossoms burn out faster.
          const limit = C.BLOOM_LIFESPAN + lifespan[i] - (blooms >= 5 ? 60 : 0);
          if (a > limit) {
            nextState[i] = WITHERED;
            // The dying blossom scatters seed onto rested soil.
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (!inGrid(nx, ny)) continue;
              const j = idx(nx, ny);
              if (state[j] === SOIL && age[j] > C.SOIL_REST && Math.random() < C.SEED_FALL) nextState[j] = GRASS;
            }
            if (Math.random() < 0.5) spawnDecayMote(x * T + 4, y * T + 3);
          }
          break;
        }

        case WITHERED:
          // RULE 6 — decay returns to soil, which can wake again later.
          if (a > C.WITHER_TIME * (1 - 0.5 * f) && r < C.RENEW_CHANCE * boost) nextState[i] = SOIL;
          break;
      }

      // RULE 2 — lingering presence consumes life, one step at a time.
      if (heat[i] > C.CONSUME_THRESHOLD && isLiving(s) && Math.random() < C.CONSUME_RATE * (heat[i] / C.CONSUME_THRESHOLD)) {
        nextState[i] = s === BLOOM ? LUSH : s === LUSH ? GRASS : WITHERED;
        if (Math.random() < 0.6) spawnDecayMote(x * T + 2 + Math.random() * 4, y * T + 4);
      }
      heat[i] *= C.HEAT_DECAY;
      fert[i] *= C.FERTILITY_DECAY;
    }
  }

  // Commit the new generation; age every tile.
  for (let i = 0; i < N; i++) {
    if (nextState[i] !== state[i]) {
      if (nextState[i] === BLOOM && Math.random() < 0.5) {
        const x = i % CONFIG.COLS, y = Math.floor(i / CONFIG.COLS);
        spawnSpore(x * T + 4, y * T + 3);
      }
      state[i] = nextState[i];
      age[i] = 0;
    } else if (age[i] < 65000) {
      age[i]++;
    }
  }
  tickCount++;
}


/* ---------------------------------------------------------------------
   4a. THE SPIRIT
   --------------------------------------------------------------------- */
class Spirit {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.moving = false;
    this.hunger = 0;    // 0..1, eases toward how heavily it weighs on this spot
  }

  update() {
    let dx = 0, dy = 0;
    if (keyIsDown(65) || keyIsDown(LEFT_ARROW)) dx -= 1;
    if (keyIsDown(68) || keyIsDown(RIGHT_ARROW)) dx += 1;
    if (keyIsDown(87) || keyIsDown(UP_ARROW)) dy -= 1;
    if (keyIsDown(83) || keyIsDown(DOWN_ARROW)) dy += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

    const sp = CONFIG.PLAYER_SPEED;
    const ox = this.x, oy = this.y;
    if (this.canStand(this.x + dx * sp, this.y)) this.x += dx * sp;
    if (this.canStand(this.x, this.y + dy * sp)) this.y += dy * sp;
    this.moving = this.x !== ox || this.y !== oy;
    if (this.moving && !hasMoved) hasMoved = true;

    const tx = this.x / T, ty = this.y / T;

    // RULE 2 (input side) — presence adds heat to nearby tiles.
    this.forTilesNear(tx, ty, CONFIG.PRESENCE_RADIUS, (i, d) => {
      heat[i] += CONFIG.PRESENCE_GAIN * (1 - d / (CONFIG.PRESENCE_RADIUS + 0.5));
    });

    // RULE 1 — movement awakens bare, rested soil.
    if (this.moving) {
      // (visual only) the spirit slowly wears a trail into the earth
      const here = idx(Math.floor(tx), Math.floor(ty));
      worn[here] = Math.min(1, worn[here] + CONFIG.TRAMPLE_GAIN);
      this.forTilesNear(tx, ty, CONFIG.AWAKEN_RADIUS, (i) => {
        if (state[i] === SOIL && age[i] > CONFIG.SOIL_REST / 2 &&
            heat[i] < CONFIG.CONSUME_THRESHOLD * 0.6 && Math.random() < CONFIG.AWAKEN_CHANCE) {
          setTile(i, GRASS);
          const x = i % CONFIG.COLS, y = Math.floor(i / CONFIG.COLS);
          spawnSparkle(x * T + 1 + Math.random() * 6, y * T + 2 + Math.random() * 4);
        }
      });
      // subtle luminous motes left behind as it drifts
      if (frameCount % 3 === 0) {
        addParticle(new Particle(this.x + Math.random() * 4 - 2, this.y - 3 - Math.random() * 3,
          (Math.random() - 0.5) * 0.06, -0.03 - Math.random() * 0.03, 46,
          [this.glowColor(), PALETTE.spiritDim, PALETTE.spiritDim, PALETTE.lushLight]));
      }
    }

    // Hunger eases toward the heat on this spot, so the colour shifts gradually.
    const h = heat[idx(Math.floor(tx), Math.floor(ty))] || 0;
    const target = constrain(h / CONFIG.CONSUME_THRESHOLD, 0, 1);
    this.hunger += (target - this.hunger) * 0.04;

    // While consuming, faint amber motes are drawn in toward the spirit.
    if (this.hunger > 0.6 && frameCount % 6 === 0) {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 4;
      addParticle(new Particle(this.x + Math.cos(a) * r, this.y - 3 + Math.sin(a) * r * 0.7,
        -Math.cos(a) * 0.18, -Math.sin(a) * 0.13, 50, [PALETTE.witherLight, PALETTE.presence, PALETTE.presence]));
    }
  }

  canStand(x, y) {
    if (x < 4 || x > W - 4 || y < 10 || y > H - 3) return false;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    return !(inGrid(tx, ty) && state[idx(tx, ty)] === ROOT);
  }

  forTilesNear(tx, ty, r, fn) {
    const r0 = Math.ceil(r);
    for (let y = Math.floor(ty) - r0; y <= Math.floor(ty) + r0; y++) {
      for (let x = Math.floor(tx) - r0; x <= Math.floor(tx) + r0; x++) {
        if (!inGrid(x, y)) continue;
        const d = Math.hypot(x + 0.5 - tx, y + 0.5 - ty);
        if (d <= r) fn(idx(x, y), d);
      }
    }
  }

  // Five colour steps from ivory (calm) to amber (consuming).
  hungerStep() { return Math.min(4, Math.floor(this.hunger * 5)); }
  coreColor() { return PALETTE.spiritCore[this.hungerStep()]; }
  glowColor() { return PALETTE.spiritGlow[this.hungerStep()]; }

  /* Amber marks on the ground show the area being consumed. */
  drawPresence() {
    if (this.hunger < 0.3) return;
    const r = CONFIG.PRESENCE_RADIUS * T;
    const n = Math.floor(6 + this.hunger * 18);
    const spin = Math.floor(frameCount / 10) * 0.08;
    fill(PALETTE.presence);
    for (let k = 0; k < n; k++) {
      const a = spin + (k / n) * Math.PI * 2;
      rect(Math.round(this.x + Math.cos(a) * r), Math.round(this.y - 1 + Math.sin(a) * r * 0.6), 1, 1);
    }
  }

  draw() {
    // A small, faceless wisp: a soft diamond of light that hovers and shimmers.
    const bob = [0, -1, -1, 0][Math.floor(frameCount / 16) % 4];
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const core = this.coreColor(), glow = this.glowColor();

    fill(PALETTE.spiritShadow);            // tiny ground shadow
    rect(x - 1, y, 3, 1);

    const top = y - 8 + bob;
    const shimmer = Math.floor(frameCount / 11) % 3;
    const shape = ['..a..', '.aca.', 'acsca', '.aca.', '..a..'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const ch = shape[r][c];
      if (ch === '.') continue;
      // 's' is the inner spark; it briefly dims, so the spirit seems to breathe
      fill(ch === 'a' ? glow : (ch === 's' && shimmer === 0) ? glow : core);
      rect(x - 2 + c, top + r, 1, 1);
    }
    // a wisp that flickers above and below
    const flick = [0, 1, 0, -1][Math.floor(frameCount / 8) % 4];
    fill(glow);
    if (shimmer !== 1) rect(x + flick, top - 1, 1, 1);
    fill(PALETTE.spiritDim);
    rect(x - flick, top + 5 + (shimmer === 2 ? 1 : 0), 1, 1);
  }
}


/* ---------------------------------------------------------------------
   4b. LANTERN-MOTHS — rule 4 (seek blossoms) and rule 5 (spread seeds)
   --------------------------------------------------------------------- */
class Moth {
  constructor(x, y, rnd) {
    this.x = constrain(x, 4, W - 4);
    this.y = constrain(y, 12, H - 6);
    this.vx = 0; this.vy = 0;
    this.tx = this.x; this.ty = this.y;
    this.targetTile = -1;     // the blossom it is heading to (or -1 = wandering)
    this.rest = 0;            // frames left resting on a blossom
    this.retarget = 0;
    this.phase = Math.floor(rnd() * 100);
    this.warm = rnd() < 0.62; // two kinds: warm gold and pale blue
  }

  findTarget() {
    // Look for blossoms within sensing range; prefer near ones, with a
    // little randomness so the moths don't all pick the same flower.
    const cx = Math.floor(this.x / T), cy = Math.floor(this.y / T);
    const R = CONFIG.SENSE_RADIUS;
    let best = -1, bestScore = Infinity;
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (!inGrid(x, y)) continue;
        const i = idx(x, y);
        if (state[i] !== BLOOM) continue;
        const score = Math.hypot(x - cx, y - cy) + Math.random() * 5;
        if (score < bestScore) { bestScore = score; best = i; }
      }
    }
    if (best >= 0) {
      this.targetTile = best;
      this.tx = (best % CONFIG.COLS) * T + 2 + Math.random() * 4;
      this.ty = Math.floor(best / CONFIG.COLS) * T + 2 + Math.random() * 3;
    } else {
      // Nothing in bloom nearby: drift off somewhere else.
      this.targetTile = -1;
      this.tx = constrain(this.x + (Math.random() - 0.5) * 140, 6, W - 6);
      this.ty = constrain(this.y + (Math.random() - 0.5) * 90, 14, H - 8);
    }
    this.retarget = 90 + Math.floor(Math.random() * 120);
  }

  update() {
    const targetGone = this.targetTile >= 0 && state[this.targetTile] !== BLOOM;

    if (this.rest > 0 && !targetGone) {
      // Resting on a blossom: hover in place and sometimes pollinate.
      this.rest--;
      if (frameCount % 8 === 0) {
        this.x = this.tx + Math.round(Math.random() * 2 - 1);
        this.y = this.ty + Math.round(Math.random() * 2 - 1);
      }
      if (Math.random() < CONFIG.POLLINATE_CHANCE) this.pollinate();
      if (this.rest === 0) this.retarget = 0;
      return;
    }
    this.rest = 0;

    if (--this.retarget <= 0 || targetGone) this.findTarget();

    // Steer toward the target with a fluttering wobble.
    let dx = this.tx - this.x, dy = this.ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    let ax = (dx / d) * CONFIG.CREATURE_SPEED, ay = (dy / d) * CONFIG.CREATURE_SPEED;

    // Moths shy away from the spirit if it comes too close.
    const pdx = this.x - player.x, pdy = this.y - (player.y - 5);
    const pd = Math.hypot(pdx, pdy);
    if (pd < 16) { ax += (pdx / (pd || 1)) * 0.9; ay += (pdy / (pd || 1)) * 0.9; }

    const t = (frameCount + this.phase) * 0.13;
    ax += Math.sin(t) * 0.35;
    ay += Math.cos(t * 1.3) * 0.25;

    this.vx += (ax - this.vx) * 0.08;
    this.vy += (ay - this.vy) * 0.08;
    this.x = constrain(this.x + this.vx, 3, W - 3);
    this.y = constrain(this.y + this.vy, 12, H - 5);

    if (d < 3) {
      if (this.targetTile >= 0) this.rest = 60 + Math.floor(Math.random() * 160);
      else this.retarget = 0;
    }

    // RULE 5 — seeds fall from the moths as they cross rested soil.
    const gx = Math.floor(this.x / T), gy = Math.floor((this.y + 3) / T);
    if (inGrid(gx, gy)) {
      const i = idx(gx, gy);
      if (state[i] === SOIL && age[i] > CONFIG.SOIL_REST && Math.random() < CONFIG.SEED_CHANCE) {
        setTile(i, GRASS);
        addParticle(new Particle(this.x, this.y + 1, 0, 0.12, 18, [PALETTE.seed, PALETTE.twig]));
      }
    }
  }

  pollinate() {
    const x0 = this.targetTile % CONFIG.COLS, y0 = Math.floor(this.targetTile / CONFIG.COLS);
    const x = x0 + Math.floor(Math.random() * 3) - 1, y = y0 + Math.floor(Math.random() * 3) - 1;
    if (!inGrid(x, y)) return;
    const i = idx(x, y);
    if (state[i] === LUSH) { setTile(i, BLOOM); spawnSpore(x * T + 4, y * T + 3); }
  }

  draw() {
    const x = Math.floor(this.x), y = Math.floor(this.y);
    const speed = this.rest > 0 ? 14 : 5;
    const open = Math.floor((frameCount + this.phase) / speed) % 2 === 0;
    fill(this.warm ? PALETTE.mothAWing : PALETTE.mothBWing);
    if (open) { rect(x - 1, y - 1, 1, 1); rect(x + 1, y - 1, 1, 1); }
    else { rect(x - 1, y, 1, 1); rect(x + 1, y, 1, 1); }
    fill(this.warm ? PALETTE.mothA : PALETTE.mothB);
    rect(x, y, 1, 1);
  }
}


/* ---------------------------------------------------------------------
   4c. FERTILITY PULSE — a ring released from the spirit on click.
   It never places plants. It only leaves fertility on the ground,
   which raises the odds of the natural rules for a little while.
   --------------------------------------------------------------------- */
class Pulse {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.t = 0;
    this.prevR = 0;
  }

  get radius() {
    // eases out: fast at first, then gently settling
    const k = this.t / CONFIG.PULSE_DURATION;
    return (1 - (1 - k) * (1 - k)) * CONFIG.PULSE_RADIUS * T;
  }

  update() {
    this.t++;
    const r = this.radius, maxR = CONFIG.PULSE_RADIUS * T;
    // Leave fertility on the band of tiles the ring passed this frame
    // (strongest near the spirit, weaker at the edge).
    const tx = this.x / T, ty = this.y / T, rr = Math.ceil(r / T) + 1;
    for (let y = Math.floor(ty) - rr; y <= Math.floor(ty) + rr; y++) {
      for (let x = Math.floor(tx) - rr; x <= Math.floor(tx) + rr; x++) {
        if (!inGrid(x, y)) continue;
        const d = Math.hypot(x * T + 4 - this.x, y * T + 4 - this.y);
        if (d < this.prevR || d >= r) continue;
        const i = idx(x, y);
        fert[i] = Math.max(fert[i], 1 - 0.5 * (d / maxR));
      }
    }
    this.prevR = r;
    return this.t < CONFIG.PULSE_DURATION;
  }

  draw() {
    const k = this.t / CONFIG.PULSE_DURATION;
    const col = k < 0.4 ? PALETTE.pulse : k < 0.75 ? PALETTE.pulseMid : PALETTE.pulseDim;
    const r = this.radius;
    fill(col);
    // crisp pixel ring, flattened for a ground-plane feel
    const steps = Math.max(12, Math.floor(r * 4));
    for (let s = 0; s < steps; s++) {
      if ((s + Math.floor(this.t / 3)) % 4 === 0) continue;  // broken, shimmering ring
      const a = (s / steps) * Math.PI * 2;
      rect(Math.round(this.x + Math.cos(a) * r), Math.round(this.y + Math.sin(a) * r * 0.7), 1, 1);
    }
  }
}


/* ---------------------------------------------------------------------
   4d. PARTICLES — single pixels that step through a short colour list
   (pollen, decay dust, the spirit's motes, fluff and falling leaves)
   --------------------------------------------------------------------- */
class Particle {
  constructor(x, y, vx, vy, life, colors) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.max = life; this.colors = colors;
    this.wob = 0;                      // sideways flutter (drifting fluff, falling leaves)
    this.seed = Math.random() * 100;
  }
  update() {
    this.x += this.vx + Math.sin((this.max - this.life + this.seed) * 0.06) * this.wob;
    this.y += this.vy;
    return --this.life > 0;
  }
  draw() {
    const k = Math.floor((1 - this.life / this.max) * this.colors.length);
    fill(this.colors[Math.min(k, this.colors.length - 1)]);
    rect(Math.floor(this.x), Math.floor(this.y), 1, 1);
  }
}

function addParticle(p) { if (particles.length < 320) particles.push(p); }
function spawnSparkle(x, y) {        // soil awakening under the spirit
  addParticle(new Particle(x, y, 0, -0.08, 26, [PALETTE.spiritCore[0], PALETTE.spiritGlow[0], PALETTE.grassLight]));
}
function spawnSpore(x, y) {          // pollen drifting from blossoms
  addParticle(new Particle(x, y, (Math.random() - 0.5) * 0.08, -0.06 - Math.random() * 0.05, 90,
    [PALETTE.bloomCore, PALETTE.bloomA, PALETTE.bloomADim]));
}
function spawnDecayMote(x, y) {      // pale dust rising from withering plants
  addParticle(new Particle(x, y, (Math.random() - 0.5) * 0.06, -0.05, 70,
    [PALETTE.witherLight, PALETTE.wither, PALETTE.drySoilLight]));
}


/* ---------------------------------------------------------------------
   5. SPRITES — every image is generated pixel-by-pixel at startup
   --------------------------------------------------------------------- */
const rgbCache = {};
function hexToRgb(h) {
  if (!rgbCache[h]) {
    const n = parseInt(h.slice(1), 16);
    rgbCache[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return rgbCache[h];
}

/* Create a w×h image and hand the painter a put(x, y, colour[, alpha]) function. */
function makeSprite(w, h, painter) {
  const img = createImage(w, h);
  img.loadPixels();
  const put = (x, y, hex, a = 255) => {
    if (!hex || x < 0 || y < 0 || x >= w || y >= h) return;
    const c = hexToRgb(hex), k = (y * w + x) * 4;
    img.pixels[k] = c[0]; img.pixels[k + 1] = c[1]; img.pixels[k + 2] = c[2]; img.pixels[k + 3] = a;
  };
  painter(put);
  img.updatePixels();
  return img;
}

/* --- small stamps used across sprites -------------------------------- */
function stampTuft(put, x, y, dark, mid, light, sway) {
  // a little grass tuft:   l . l      (tips lean with the wind)
  //                        . m .
  //                        . d .
  put(x, y, dark); put(x, y - 1, mid);
  put(x - 1 + sway, y - 2, light); put(x + 1 + sway, y - 2, light);
  put(x - 1, y, mid);
}
function stampPebble(put, x, y, big) {
  const P = PALETTE;
  put(x, y, P.pebbleLight); put(x, y + 1, P.pebbleShadow);
  if (big) { put(x + 1, y, P.pebble); put(x + 1, y + 1, P.pebbleShadow); put(x - 1, y + 1, P.pebble); }
}

/* --- patch cushions ----------------------------------------------------
   Moss (lush/blossom) and leaf litter (decay) are drawn as 12×12 cushions
   that know which of their four neighbours belong to the same patch
   (mask bits N=1 E=2 S=4 W=8). Closed sides merge seamlessly; open sides
   get a ragged silhouette, a shadowed lower lip, a sunlit top rim and
   little tufts of overgrowth spilling past the boundary. */
const MOSS_PAL = () => ({
  fill: [PALETTE.lushDark, PALETTE.moss, PALETTE.mossLight], lip: PALETTE.mossLip, rim: PALETTE.mossRim,
  tuft: [PALETTE.grassDark, PALETTE.grass, PALETTE.grassLight],
});
const LITTER_PAL = () => ({
  fill: [PALETTE.drySoilDark, PALETTE.drySoil, PALETTE.drySoilLight], lip: PALETTE.litterLip, rim: PALETTE.witherLight,
  tuft: [PALETTE.witherDark, PALETTE.wither, PALETTE.witherLight],
});

function paintCushion(put, R, mask, pal, tufts) {
  const closed = (bit) => (mask & bit) !== 0;
  const m = new Uint8Array(144);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const sx = x < 2 ? 8 : x > 9 ? 2 : 0, sy = y < 2 ? 1 : y > 9 ? 4 : 0;   // which side we spill over
    const dx = x < 2 ? 2 - x : x > 9 ? x - 9 : 0, dy = y < 2 ? 2 - y : y > 9 ? y - 9 : 0;
    let p;
    if (!sx && !sy) {
      const rimOpen = (x === 2 && !closed(8)) || (x === 9 && !closed(2)) || (y === 2 && !closed(1)) || (y === 9 && !closed(4));
      p = rimOpen ? 0.8 : 1;
    } else if (sx && sy) {
      p = closed(sx) && closed(sy) ? 1 : (closed(sx) || closed(sy)) ? (dx + dy <= 2 ? 0.35 : 0.08) : (dx + dy <= 2 ? 0.1 : 0);
    } else {
      p = closed(sx || sy) ? 1 : (dx + dy === 1 ? 0.42 : 0.1);
    }
    if (R() < p) m[y * 12 + x] = 1;
  }
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    if (!m[y * 12 + x]) continue;
    const r = R();
    let c = r < 0.1 ? pal.fill[0] : r < 0.92 ? pal.fill[1] : pal.fill[2];
    const below = y < 11 && m[(y + 1) * 12 + x], above = y > 0 && m[(y - 1) * 12 + x];
    if (!below && y >= 8 && !closed(4)) c = pal.lip;        // shadowed lower lip -> cushion depth
    else if (!above && y <= 3 && !closed(1)) c = pal.rim;   // light catching the upper edge
    put(x, y, c);
  }
  if (!tufts) return;
  // overgrowth: tufts poking out across open edges
  const [d, md, l] = pal.tuft;
  if (!closed(1)) for (let k = 0; k < 2; k++) stampTuft(put, 3 + Math.floor(R() * 6), 3, d, md, l, 0);
  if (!closed(4)) for (let k = 0; k < 2; k++) stampTuft(put, 3 + Math.floor(R() * 6), 11, d, md, l, 0);
  if (!closed(2) && R() < 0.8) stampTuft(put, 10, 4 + Math.floor(R() * 6), d, md, l, 0);
  if (!closed(8) && R() < 0.8) stampTuft(put, 1, 4 + Math.floor(R() * 6), d, md, l, 0);
}

/* --- stage 2: grass — a few sage tufts, sometimes a tiny daisy --------- */
function paintGrass(put, R, v, frame) {
  const P = PALETTE;
  const n = 2 + (v % 2);
  for (let k = 0; k < n; k++) {
    const x = 3 + Math.floor(R() * 6), y = 5 + Math.floor(R() * 5);
    stampTuft(put, x, y, P.grassDark, P.grass, P.grassLight, frame ? (k % 2 ? 1 : 0) : 0);
  }
  for (let k = 0; k < 3; k++) put(2 + Math.floor(R() * 8), 3 + Math.floor(R() * 7), P.grassDark);   // sprouts
  if (v === 3) { const x = 3 + Math.floor(R() * 6), y = 4 + Math.floor(R() * 5); put(x, y, P.daisy); put(x, y + 1, P.grassDark); }
}

/* --- stage 3: lush — ferns, clover and tall seeding grass on the moss --- */
function paintLushDetail(put, R, v, frame) {
  const P = PALETTE;
  for (let k = 0; k < 4; k++) {                       // clover / leaf glints
    const x = 2 + Math.floor(R() * 8), y = 2 + Math.floor(R() * 8);
    put(x, y, P.clover); if (R() < 0.5) put(x + 1, y, P.lushLight);
  }
  const ferns = v === 2 ? 2 : 1;
  for (let k = 0; k < ferns; k++) {                   // a small fern frond
    const cx = 3 + Math.floor(R() * 6), cy = 5 + Math.floor(R() * 4), s = frame ? 1 : 0;
    put(cx, cy, P.lushDark); put(cx, cy - 1, P.lush); put(cx - 1, cy - 1, P.lush); put(cx + 1, cy - 1, P.lush);
    put(cx - 1 + s, cy - 2, P.lushLight); put(cx + 1 + s, cy - 2, P.lushLight); put(cx + s, cy - 3, k ? P.teal : P.lushLight);
    put(cx - 2, cy, P.lush); put(cx + 2, cy, P.lush);
  }
  if (v === 1 || v === 3) {                           // tall seeding grass
    const x = 3 + Math.floor(R() * 6), y = 6 + Math.floor(R() * 3), s = frame ? 1 : 0;
    put(x, y, P.grassDark); put(x, y - 1, P.grass); put(x + s, y - 2, P.grassLight); put(x + s, y - 3, P.seedHead);
    put(x + 2, y, P.grassDark); put(x + 2, y - 1, P.grass); put(x + 2 + s, y - 2, P.seedHead);
  }
}

/* --- stage 4: blossom — designed flowers on top of the lush detail ------ */
function paintFlowers(put, R, v, frame) {
  const P = PALETTE;
  const pos = () => [3 + Math.floor(R() * 6), 3 + Math.floor(R() * 5)];
  const flower = (x, y, petal, centre) => {           // five-point flower
    put(x, y + 1, P.lushDark);
    put(x, y - 1, petal); put(x - 1, y, petal); put(x + 1, y, petal); put(x, y + 1, petal);
    put(x, y, frame ? P.bloomCore : centre);
  };
  const bell = (x, y) => {                            // nodding cream bell on a stalk
    put(x, y + 1, P.lushDark); put(x, y + 2, P.lushDark);
    put(x, y, frame ? P.bloomCore : P.bloomA); put(x - 1, y + 1, P.bloomADim); put(x + 1, y + 1, P.bloomADim);
  };
  const spire = (x, y) => {                           // tall pink spire
    for (let k = 0; k < 5; k++) put(x, y + k, k < 3 ? (k % 2 ? P.bloomB : P.bloomBDark) : P.lushDark);
    put(x - 1, y + 1, P.bloomB); put(x + 1, y + 2, P.bloomB); put(x, y - 1, frame ? P.bloomCore : P.bloomB);
  };
  if (v === 0)      { flower(...pos(), P.bloomB, P.bloomC); flower(...pos(), P.bloomB, P.bloomC); bell(...pos()); }
  else if (v === 1) { flower(...pos(), P.bloomA, P.bloomC); flower(...pos(), P.bloomA, P.bloomC); }
  else if (v === 2) {
    for (let k = 0; k < 4; k++) { const [x, y] = pos(); put(x, y, k === 0 && frame ? P.bloomCore : P.bloomC); put(x + 1, y, P.bloomC); }
    flower(...pos(), P.bloomB, P.bloomC);
  } else { spire(3 + Math.floor(R() * 6), 2 + Math.floor(R() * 3)); bell(...pos()); }
}

/* --- stage 5: decay — fallen leaves, bent stalks, pale mushrooms -------- */
function paintWitherDetail(put, R, v) {
  const P = PALETTE;
  for (let k = 0; k < 4; k++) {                        // fallen leaves
    const x = 2 + Math.floor(R() * 8), y = 2 + Math.floor(R() * 8);
    const c = [P.leafRust, P.leafOchre, P.leafDark, P.wither][Math.floor(R() * 4)];
    put(x, y, c); if (R() < 0.5) put(x + 1, y, c);
  }
  for (let k = 0; k < 3; k++) {                        // bent dry stalks
    const x = 2 + Math.floor(R() * 8), y = 5 + Math.floor(R() * 5), lean = R() < 0.5 ? -1 : 1;
    put(x, y, P.witherDark); put(x, y - 1, P.wither); put(x + lean, y - 2, P.witherLight);
  }
  if (v === 3) {
    for (let k = 0; k < 2; k++) {
      const x = 3 + Math.floor(R() * 5), y = 4 + Math.floor(R() * 5);
      put(x, y, P.mushroomTop); put(x + 1, y, P.mushroom); put(x, y + 1, P.mushroomStem); put(x + 1, y + 1, P.litterLip);
    }
  }
}

/* --- trampled soil: lighter, pressed earth where the spirit walks ------- */
function paintTrample(put, R, level) {
  const P = PALETTE;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const edge = x === 0 || y === 0 || x === 7 || y === 7;
    if (R() < (level ? 0.55 : 0.28) * (edge ? 0.5 : 1)) put(x, y, R() < 0.3 ? P.wornLight : P.wornSoil);
  }
  if (level && R() < 0.6) stampPebble(put, 2 + Math.floor(R() * 4), 2 + Math.floor(R() * 4), false);
}

/* --- foliage shading shared by trees and the frame ----------------------
   owner[i] = which leaf clump covers a pixel (later clumps are in front),
   lit[i]   = -1 (facing the morning light, top-left) .. +1 (shaded).
   Adds a dark outline on the shadow side, a cast shadow where a clump
   sits behind another, a lit rim on front clumps, and leafy highlights. */
function shadeFoliage(put, w, h, owner, lit, pal, R) {
  const O = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? -1 : owner[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = O(x, y);
    if (k < 0) continue;
    const L = lit[y * w + x] + bayer(x, y) * 0.3;
    let c = L < -0.6 ? pal.hi : L < -0.15 ? pal.light : L < 0.45 ? pal.mid : pal.deep;
    const up = O(x, y - 1), dn = O(x, y + 1), lf = O(x - 1, y), rt = O(x + 1, y);
    if (dn > k) c = pal.deep;                         // just above a clump that sits in front
    if (up > k) c = pal.outline;                      // under an overhanging clump
    else if (up >= 0 && up < k && L < 0.3) c = pal.hi;// lit top rim of a front clump
    if (dn < 0 || rt < 0) c = pal.outline;            // silhouette outline on the shadow side
    else if ((up < 0 || lf < 0) && L > 0.1) c = pal.deep;
    put(x, y, c);
  }
  // leafy sparkle: a few two-pixel highlights on the lit side
  for (let n = 0; n < w * h * 0.02; n++) {
    const x = Math.floor(R() * w), y = Math.floor(R() * h);
    if (O(x, y) >= 0 && O(x + 1, y) >= 0 && O(x, y - 1) >= 0 && lit[y * w + x] < -0.1) { put(x, y, pal.hi); put(x + 1, y, pal.light); }
  }
}

function clumpsToOwner(w, h, clumps, R, holes) {
  const owner = new Int8Array(w * h).fill(-1), lit = new Float32Array(w * h);
  clumps.forEach(([cx, cy, r], k) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy * 1.1);
      if (d > r + (R() - 0.5) * 1.3) continue;
      if (holes && d < r - 1.5 && R() < holes) continue;
      owner[y * w + x] = k; lit[y * w + x] = (dx * 0.75 + dy) / r;
    }
  });
  return { owner, lit };
}

/* A tapered trunk: shaded left-light / right-dark, with flaring roots. */
function paintTrunk(put, R, cx, top, bottom, half, pale) {
  const P = PALETTE;
  for (let y = top; y <= bottom; y++) {
    const flare = Math.max(0, y - (bottom - 3));
    const x0 = cx - half - flare, x1 = cx + half - 1 + flare;
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / Math.max(1, x1 - x0);
      let c;
      if (pale) c = u < 0.5 ? P.birch : P.birchShade;
      else c = u < 0.2 ? P.barkHi : u < 0.45 ? P.barkLight : u < 0.8 ? P.bark : P.barkDark;
      if (x === x0 || x === x1) c = pale ? P.birchShade : P.barkOutline;
      if (pale && R() < 0.12) c = P.birchMark;
      else if (!pale && u > 0.2 && u < 0.8 && R() < 0.07) c = P.barkDark;
      if (!pale && y > bottom - 5 && x === x0 + 1 && R() < 0.6) c = P.barkMoss;
      put(x, y, c);
    }
  }
  // root toes reaching out along the ground
  put(cx - half - 4, bottom, pale ? P.birchShade : P.barkDark); put(cx + half + 3, bottom, pale ? P.birchShade : P.barkDark);
}

function makeTreeSprite(kind, R, frame) {
  const P = PALETTE;
  if (kind === OAK) {
    const w = 34, h = 46;
    return makeSprite(w, h, put => {
      paintTrunk(put, R, 17, 22, h - 1, 3, false);
      const s = frame;                      // the top of the crown leans in gusts
      const clumps = [[17 + s, 7, 7.5], [9 + s, 11, 6.5], [25 + s, 11, 6.5], [17, 14, 7.5],
                      [10, 19, 6.5], [24, 19, 6.5], [17, 22, 6]];
      const jit = clumps.map(([x, y, r]) => [x + Math.floor(R() * 3) - 1, y + Math.floor(R() * 3) - 1, r + R() * 0.8]);
      const { owner, lit } = clumpsToOwner(w, 30, jit, R, 0);
      shadeFoliage(put, w, 30, owner, lit, P.oak, R);
    });
  }
  if (kind === FIR) {
    const w = 26, h = 50, cx = 12.5;
    return makeSprite(w, h, put => {
      paintTrunk(put, R, 13, 38, h - 1, 1, false);
      // tiers drawn bottom-up, so each higher tier overhangs the one below
      const tiers = [[28, 15, 12], [20, 14, 10], [12, 13, 8], [4, 11, 6]];
      const owner = new Int8Array(w * 44).fill(-1), lit = new Float32Array(w * 44);
      tiers.forEach(([y0, th, hw], k) => {
        const sway = (k === 3 && frame) ? 1 : 0;
        for (let y = y0; y <= y0 + th; y++) for (let x = 0; x < w; x++) {
          const t = (y - y0) / th, half = hw * Math.pow(t, 0.85) + 0.6;
          const dx = x - cx - sway;
          if (Math.abs(dx) > half) continue;
          if (y >= y0 + th - 1 && (x + k) % 3 === 0) continue;           // saw-toothed hem
          owner[y * w + x] = k; lit[y * w + x] = dx / (hw * 0.75) + (t - 0.7) * 0.5;
        }
      });
      shadeFoliage(put, w, 44, owner, lit, P.fir, R);
      put(13 + frame, 3, P.fir.light);                                    // leading tip
    });
  }
  // ASPEN: small, airy, pale-barked
  const w = 22, h = 36;
  return makeSprite(w, h, put => {
    paintTrunk(put, R, 11, 14, h - 1, 1, true);
    put(9, 17, P.twig); put(8, 16, P.twig); put(13, 19, P.twig);
    const s = frame;
    const clumps = [[11 + s, 6, 5], [6 + s, 10, 4.5], [16, 10, 4.5], [8, 14, 4.5], [14, 15, 4]];
    const { owner, lit } = clumpsToOwner(w, 21, clumps, R, 0.06);
    shadeFoliage(put, w, 21, owner, lit, P.aspen, R);
  });
}

function makeRockSprite(R) {
  const P = PALETTE;
  return makeSprite(12, 9, put => {
    for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) {
      const dx = (x - 5.5) / 5.5, dy = (y - 5) / 3.8, d = Math.hypot(dx, dy);
      if (d > 1 + (R() - 0.5) * 0.15) continue;
      const L = dx * 0.6 + dy + bayer(x, y) * 0.3;
      let c = L < -0.5 ? P.rockLight : L < 0.35 ? P.rock : P.rockDark;
      if (d > 0.85 && dy > -0.2) c = P.rockOutline;
      if (y <= 2 && R() < 0.55) c = R() < 0.5 ? P.mossRim : P.moss;      // moss cap
      put(x, y, c);
    }
  });
}

function makeStumpSprite(R) {
  const P = PALETTE;
  return makeSprite(14, 10, put => {
    for (let y = 2; y < 10; y++) for (let x = 3; x <= 10; x++) {          // sides
      const u = (x - 3) / 7;
      put(x, y, x === 3 || x === 10 ? P.barkOutline : u < 0.3 ? P.barkLight : u < 0.75 ? P.bark : P.barkDark);
    }
    put(1, 9, P.barkDark); put(2, 9, P.bark); put(11, 9, P.bark); put(12, 9, P.barkDark);   // roots
    for (let y = 0; y < 4; y++) for (let x = 3; x <= 10; x++) {           // cut top with rings
      const d = Math.hypot((x - 6.5) / 4, (y - 1.8) / 1.8);
      if (d > 1) continue;
      put(x, y, d > 0.8 ? P.barkLight : d > 0.45 ? P.stumpTop : (d > 0.25 ? P.stumpRing : P.stumpTop));
    }
    put(4, 6, P.barkMoss); put(4, 7, P.barkMoss); put(5, 8, P.barkMoss);
  });
}

/* Foreground framing: overhanging leaves along the top, dark grasses and
   ferns along the bottom. These sit "closer to the camera" than the world. */
function makeFrameTop(frame) {
  const R = mulberry32(91), w = W, h = 26;
  return makeSprite(w, h, put => {
    const clumps = [];
    for (let x = -4; x < w + 8; x += 6 + Math.floor(R() * 10)) {
      const edge = Math.min(x, w - x);                 // distance from the nearest side
      const corner = edge < 46;
      if (!corner && R() < 0.45) continue;             // gaps let the scene breathe
      const r = corner ? 7 + R() * 7 + (46 - edge) * 0.08 : 3 + R() * 4;
      clumps.push([x + (frame && R() < 0.5 ? 1 : 0), corner ? 2 + R() * 8 - edge * 0.05 : -3 + R() * 3, r]);
    }
    const { owner, lit } = clumpsToOwner(w, h, clumps, R, 0);
    shadeFoliage(put, w, h, owner, lit, PALETTE.frame, R);
  });
}
function makeFrameBottom(frame) {
  const R = mulberry32(92), w = W, h = 16;
  const P = PALETTE;
  return makeSprite(w, h, put => {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, w - x), corner = edge < 60;
      const base = corner ? Math.max(1, 6 - Math.floor(edge / 12)) : (R() < 0.3 ? 1 : 0);
      for (let y = h - base; y < h; y++) put(x, y, P.frameGrass);
      if (R() < (corner ? 0.45 - edge * 0.005 : 0.04)) {                    // blades and fern tips
        const len = 2 + Math.floor(R() * (corner ? 12 - edge / 8 : 4));
        const lean = frame ? 1 : 0;
        for (let k = 0; k < len; k++) {
          const xx = x + (k > len * 0.6 ? lean : 0);
          put(xx, h - base - k, k === len - 1 ? P.frameGrassLight : P.frameGrass);
        }
      }
    }
  });
}

function buildSprites() {
  const R = mulberry32(777);
  const P = PALETTE;
  sprites = { moss: [], litter: [], grass: [], lush: [], bloom: [], wither: [], trample: [[], []] };
  for (let mask = 0; mask < 16; mask++) {
    sprites.moss.push([0, 1].map(() => makeSprite(12, 12, put => paintCushion(put, R, mask, MOSS_PAL(), true))));
    sprites.litter.push([0, 1].map(() => makeSprite(12, 12, put => paintCushion(put, R, mask, LITTER_PAL(), false))));
  }
  for (let v = 0; v < 4; v++) {
    // Two frames each; the same seed per frame so only the swaying
    // pixels differ between frames.
    sprites.grass.push([0, 1].map(f => makeSprite(12, 12, put => paintGrass(put, mulberry32(10 + v), v, f))));
    sprites.lush.push([0, 1].map(f => makeSprite(12, 12, put => paintLushDetail(put, mulberry32(100 + v), v, f))));
    sprites.bloom.push([0, 1].map(f => makeSprite(12, 12, put => {
      paintLushDetail(put, mulberry32(200 + v), (v + 1) % 4, f);
      paintFlowers(put, mulberry32(300 + v), v, f);
    })));
    sprites.wither.push(makeSprite(12, 12, put => paintWitherDetail(put, R, v)));
    sprites.trample[0].push(makeSprite(8, 8, put => paintTrample(put, R, 0)));
    sprites.trample[1].push(makeSprite(8, 8, put => paintTrample(put, R, 1)));
  }
  sprites.rock = makeRockSprite(mulberry32(5));
  sprites.stump = makeStumpSprite(mulberry32(6));
  frameTop = [0, 1].map(makeFrameTop);
  frameBottom = [0, 1].map(makeFrameBottom);
}


/* --- baked world layers (rebuilt with each new world) ---------------------- */

/* The ground: one hand-painted-looking layer, computed per pixel.
   Three related soils blend with ordered dithering:
     cool shaded soil beneath tree crowns and toward the map edge,
     lighter worn soil on the footpaths and in the clearing,
     warm base soil everywhere else,
   then pebbles, twigs, roots and fallen leaves are scattered on top. */
function bakeGround(rnd) {
  const P = PALETTE;
  const pals = {
    base: [P.soilDark, P.soil, P.soilLight],
    cool: [P.coolSoilDark, P.coolSoil, P.coolSoilLight],
    worn: [P.wornDark, P.wornSoil, P.wornLight],
  };
  const shadeAt = (x, y) => {
    let s = 0;
    for (const t of trees) {
      const d = Math.hypot((x - t.x - 3) / (t.crownR * 1.25), (y - t.y + 6) / (t.crownR * 0.85));
      if (d < 1) s += (1 - d) * 1.1;
    }
    const e = Math.min(x, W - 1 - x, y, H - 1 - y);
    if (e < 16) s += (16 - e) / 16 * 0.55;
    return s + (valueNoise(x * 0.05, y * 0.05 + 50) - 0.5) * 0.45;
  };
  groundImg = makeSprite(W, H, put => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const b = bayer(x, y);
      const wear = wornField[y * W + x] + clearingFactor(x, y) * 0.35 + (valueNoise(x * 0.09 + 20, y * 0.09) - 0.5) * 0.3;
      const shade = shadeAt(x, y);
      const pal = wear + b * 0.35 > 0.5 ? pals.worn : shade + b * 0.35 > 0.5 ? pals.cool : pals.base;
      const m = valueNoise(x * 0.11, y * 0.11) + b * 0.08;              // soft, sparse mottling
      let tone = m > 0.76 ? 2 : m < 0.14 ? 0 : 1;
      const r = rnd();
      if (r < 0.035) tone = 0; else if (r > 0.98) tone = 2;
      if (pal === pals.cool && r > 0.93 && r < 0.95) { put(x, y, P.shadeMoss); continue; }
      put(x, y, pal[tone]);
    }
    // pebbles: lining the paths, and a few scattered
    for (const p of paths) {
      for (let k = 0; k < p.pts.length; k += 7) {
        if (rnd() > 0.45) continue;
        const [x, y] = p.pts[k], a = rnd() * Math.PI * 2, r = p.width * (0.9 + rnd() * 0.6);
        stampPebble(put, Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.8), rnd() < 0.3);
      }
    }
    for (let k = 0; k < 40; k++) stampPebble(put, Math.floor(rnd() * W), Math.floor(rnd() * H), rnd() < 0.25);
    // twigs
    for (let k = 0; k < 16; k++) {
      let x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
      const dir = rnd() < 0.5 ? -1 : 1, len = 3 + Math.floor(rnd() * 3);
      for (let s = 0; s < len; s++) { put(x, y, s === 0 ? P.twigLight : P.twig); x++; if (s % 2) y += dir; }
    }
    // roots and fallen leaves around each tree
    for (const t of trees) {
      if (t.kind !== ASPEN) {
        for (let k = 0; k < 4; k++) {
          const dir = k % 2 ? 1 : -1;
          let x = t.x + dir * (t.kind === OAK ? 4 : 2), y = t.y - 1 - Math.floor(rnd() * 2);
          const len = 3 + Math.floor(rnd() * 5);
          for (let s = 0; s < len; s++) {
            put(x, y, P.root); put(x, y - 1, P.rootLight);
            x += dir; if (rnd() < 0.4) y += 1;
          }
        }
      }
      const n = t.kind === OAK ? 34 : t.kind === ASPEN ? 18 : 14;
      const cols = t.kind === OAK ? [P.leafRust, P.leafOchre, P.leafDark] :
                   t.kind === ASPEN ? [P.leafGold, P.leafOchre, P.leafGold] : [P.needle, P.needle, P.leafDark];
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * t.crownR * 1.2;
        const x = Math.round(t.x + Math.cos(a) * r), y = Math.round(t.y - 4 + Math.sin(a) * r * 0.6);
        const c = cols[Math.floor(rnd() * 3)];
        put(x, y, c); if (rnd() < 0.35) put(x + 1, y, c);
      }
    }
  });
}

/* Soft, dithered contact shadows under trees and props (morning light
   comes from the upper left, so shadows fall a little to the right). */
function bakeShadows() {
  const sh = hexToRgb(PALETTE.shadow);
  shadowImg = createImage(W, H);
  shadowImg.loadPixels();
  const px = shadowImg.pixels;
  const blobs = trees.map(t => [t.x + 3, t.y - 1, t.shadowRx, t.shadowRx * 0.4])
    .concat(props.map(p => [p.x + 1, p.y - 1, 5, 2]));
  for (const [cx, cy, rx, ry] of blobs) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const v = 1 - Math.hypot((x - cx) / rx, (y - cy) / ry) + bayer(x, y) * 0.35;
      if (v < 0.12) continue;
      const k = (y * W + x) * 4, a = v > 0.55 ? 96 : 58;
      if (a > px[k + 3]) { px[k] = sh[0]; px[k + 1] = sh[1]; px[k + 2] = sh[2]; px[k + 3] = a; }
    }
  }
  shadowImg.updatePixels();
}

/* Ambient light per 4×4 cell: dimmer under crowns and at the edges,
   brighter in the clearing. Dynamic lights are added on top each frame. */
function bakeAmbientLight() {
  const C = CONFIG;
  baseLight = new Float32Array(LW * LH);
  for (let cy = 0; cy < LH; cy++) for (let cx = 0; cx < LW; cx++) {
    const px = cx * LCELL + 2, py = cy * LCELL + 2;
    let v = C.AMBIENT;
    const e = Math.min(cx, LW - 1 - cx, cy, LH - 1 - cy);
    if (e < 5) v -= C.EDGE_SHADE * (5 - e) / 5;
    for (const t of trees) {
      const d = Math.hypot(px - t.x, (py - (t.y - t.h * 0.55)) * 1.2) / (t.crownR * 1.5);
      if (d < 1) v -= C.GROVE_SHADE * (1 - d);
    }
    v += C.CLEARING_SUN * clearingFactor(px, py);
    baseLight[cy * LW + cx] = v;
  }
}

/* ---------------------------------------------------------------------
   6. RENDERING
   --------------------------------------------------------------------- */

/* Gentle wind: slow gust waves travelling across the map. Plants and
   crowns use the lean frame while a gust passes over them. */
function windAt(x, y) {
  const t = frameCount * CONFIG.WIND_SPEED;
  return Math.sin(x * 0.045 + y * 0.02 - t) + 0.5 * Math.sin(x * 0.013 - t * 0.37 + 1.7);
}

/* Which of a tile's four neighbours belong to the same patch (N=1 E=2 S=4 W=8).
   The map border counts as "same", so patches run off the edge cleanly. */
function patchMask(x, y, same) {
  let m = 0;
  if (y === 0 || same(state[idx(x, y - 1)])) m |= 1;
  if (x === CONFIG.COLS - 1 || same(state[idx(x + 1, y)])) m |= 2;
  if (y === CONFIG.ROWS - 1 || same(state[idx(x, y + 1)])) m |= 4;
  if (x === 0 || same(state[idx(x - 1, y)])) m |= 8;
  return m;
}
const isGreen = (s) => s === LUSH || s === BLOOM;
const isLitter = (s) => s === WITHERED;

function drawGround() {
  const C = CONFIG;
  // 1. the painted ground (soils, paths, pebbles, roots, leaves)
  image(groundImg, 0, 0);

  // 2. trampled earth where the spirit often walks
  for (let i = 0; i < N; i++) {
    const w = worn[i];
    if (w < 0.3 || (state[i] !== SOIL && state[i] !== GRASS)) continue;
    image(sprites.trample[w > 0.65 ? 1 : 0][variant[i]], (i % C.COLS) * T, Math.floor(i / C.COLS) * T);
  }

  // 3. moss and litter cushions, shaped by their neighbours
  for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) {
    const i = idx(x, y), s = state[i], v = variant[i] & 1;
    if (isGreen(s)) image(sprites.moss[patchMask(x, y, isGreen)][v], x * T - 2, y * T - 2);
    else if (isLitter(s)) image(sprites.litter[patchMask(x, y, isLitter)][v], x * T - 2, y * T - 2);
  }

  // 4. plant details (tufts, ferns, flowers, fallen leaves), swaying in gusts
  for (let y = 0; y < C.ROWS; y++) for (let x = 0; x < C.COLS; x++) {
    const i = idx(x, y), s = state[i], v = variant[i];
    const f = windAt(x * T, y * T) + (phase[i] / 56 - 0.5) * 0.5 > C.GUST ? 1 : 0;
    let img = null;
    if (s === GRASS) img = sprites.grass[v][f];
    else if (s === LUSH) img = sprites.lush[v][f];
    else if (s === BLOOM) img = sprites.bloom[v][f];
    else if (s === WITHERED) img = sprites.wither[v];
    if (img) image(img, x * T - 2, y * T - 2);
  }

  // 5. dew glints where the spirit's pulse left the ground fertile
  for (let i = 0; i < N; i++) {
    const f = fert[i];
    if (f < 0.12) continue;
    const x = (i % C.COLS) * T, y = Math.floor(i / C.COLS) * T;
    const n = f > 0.66 ? 3 : f > 0.33 ? 2 : 1;
    const twinkle = Math.floor((frameCount + phase[i] * 5) / 20) % 3;
    for (let k = 0; k < n; k++) {
      const [dx, dy] = DEW_SPOTS[(variant[i] * 3 + k) % DEW_SPOTS.length];
      fill(k === twinkle ? PALETTE.dew : PALETTE.dewDim);
      rect(x + dx, y + dy, 1, 1);
    }
  }

  // 6. soft contact shadows of trees and props, over ground and plants
  image(shadowImg, 0, 0);
}
const DEW_SPOTS = [[1, 2], [5, 1], [3, 5], [6, 6], [2, 7], [6, 3], [0, 5], [4, 3], [7, 0], [1, 0], [4, 7], [7, 5]];

/* Trees, props and the spirit are drawn sorted by where they touch the
   ground, so the spirit can pass behind or in front of a trunk. */
function drawActors() {
  player.drawPresence();
  const list = [];
  for (const t of trees) {
    const f = windAt(t.x, t.y - 20) > 0.9 ? 1 : 0;
    const img = t.frames[f];
    const ax = t.kind === OAK ? 17 : t.kind === FIR ? 13 : 11;
    list.push({ y: t.y, draw: () => image(img, t.x - ax, t.y - img.height) });
  }
  for (const p of props) {
    const img = p.kind === 'rock' ? sprites.rock : sprites.stump;
    list.push({ y: p.y, draw: () => image(img, p.x - Math.floor(img.width / 2), p.y - img.height) });
  }
  list.push({ y: player.y, draw: () => player.draw() });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();
}

/* Lighting: light is accumulated on a coarse 4×4-pixel grid, quantised
   into a few steps with an ordered (Bayer) dither, then drawn as a soft,
   blocky blue-green shade overlay. Groves are shadier and the clearing
   is sunlit (baked once per world); the spirit, blossoms and moths add a
   little light around themselves. No gradients — just stepped light. */
function addLight(px, py, r, intensity) {
  const c0 = Math.max(0, Math.floor((px - r) / LCELL)), c1 = Math.min(LW - 1, Math.floor((px + r) / LCELL));
  const r0 = Math.max(0, Math.floor((py - r) / LCELL)), r1 = Math.min(LH - 1, Math.floor((py + r) / LCELL));
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const d = Math.hypot(cx * LCELL + 2 - px, cy * LCELL + 2 - py) / r;
    if (d < 1) light[cy * LW + cx] += intensity * (1 - d);
  }
}

function drawLighting() {
  light.set(baseLight);
  const flick = Math.floor(frameCount / 9) % 3;      // stepped flicker

  addLight(player.x, player.y - 4, CONFIG.PLAYER_LIGHT + flick * 2 - player.hunger * 8, 0.9);
  for (let i = 0; i < N; i++) {
    if (state[i] === BLOOM) {
      const glow = (Math.floor((frameCount + phase[i] * 3) / 40) % 2) ? 0.3 : 0.22;
      addLight((i % CONFIG.COLS) * T + 4, Math.floor(i / CONFIG.COLS) * T + 4, CONFIG.BLOOM_LIGHT, glow);
    }
  }
  for (const c of creatures) addLight(c.x, c.y, CONFIG.MOTH_LIGHT, 0.25);
  for (const p of pulses) addLight(p.x, p.y, p.radius + 6, 0.25);

  const shade = hexToRgb(PALETTE.shadow), A = CONFIG.SHADE_ALPHAS, steps = A.length - 1;
  const px = lightImg.pixels;
  for (let cy = 0; cy < LH; cy++) for (let cx = 0; cx < LW; cx++) {
    const v = light[cy * LW + cx] * steps + bayer(cx, cy) * 0.9;
    const lvl = Math.max(0, Math.min(steps, Math.floor(v)));
    const k = (cy * LW + cx) * 4;
    px[k] = shade[0]; px[k + 1] = shade[1]; px[k + 2] = shade[2]; px[k + 3] = A[lvl];
  }
  lightImg.updatePixels();
  image(lightImg, 0, 0, W, H);   // scaled with nearest-neighbour (noSmooth)
}

/* Morning mist gathers toward the forest edge; warm sun-dapples drift
   across the clearing. Both are slow value-noise fields quantised into
   two flat steps (no gradients). */
function drawMist() {
  if (frameCount % 4 === 0 || frameCount < 3) {   // these move slowly; update every 4 frames
    const C = CONFIG, P = PALETTE;
    const mc = hexToRgb(P.mist), sc = hexToRgb(P.sun);
    const t = frameCount * C.MIST_SPEED, s = C.MIST_SCALE;
    const px = mistImg.pixels;
    for (let cy = 0; cy < LH; cy++) for (let cx = 0; cx < LW; cx++) {
      const x = cx * LCELL + 2, y = cy * LCELL + 2;
      const cf = clearingFactor(x, y), e = Math.min(cx, LW - 1 - cx, cy, LH - 1 - cy);
      const b = bayer(cx, cy) * 0.35;
      const n = valueNoise(cx * s + t, cy * s * 1.6) * 0.65 + valueNoise(cx * s * 2.3 - t * 1.7, cy * s * 3 + 9) * 0.35;
      const mist = (n - 0.48 + (e < 8 ? (8 - e) * 0.03 : 0) - cf * 0.3) * 4 + b;
      const sun = (valueNoise(cx * 0.12 + t * 0.5, cy * 0.12 - t * 0.3 + 40) - 0.35) * cf * 5 + b;
      const k = (cy * LW + cx) * 4;
      const ml = Math.max(0, Math.min(2, Math.floor(mist))), sl = Math.max(0, Math.min(2, Math.floor(sun)));
      const c = ml ? mc : sc, a = ml ? C.MIST_ALPHAS[ml] : C.SUN_ALPHAS[sl];
      px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; px[k + 3] = a;
    }
    mistImg.updatePixels();
  }
  image(mistImg, 0, 0, W, H);
}

/* Ambient life: fluff drifting on the breeze and leaves falling from crowns. */
function spawnAmbient() {
  const C = CONFIG, P = PALETTE;
  if (frameCount % C.DRIFT_EVERY === 0 && particles.length < 260) {
    const p = new Particle(Math.random() < 0.5 ? -2 : Math.random() * W, 14 + Math.random() * (H - 30),
      0.07 + Math.random() * 0.09, (Math.random() - 0.5) * 0.02, 420 + Math.floor(Math.random() * 200),
      [P.fluff, P.fluff, P.fluff, P.fluffDim]);
    p.wob = 0.12;
    addParticle(p);
  }
  if (frameCount % C.LEAF_EVERY === 0 && trees.length) {
    const t = trees[Math.floor(Math.random() * trees.length)];
    if (t.kind === FIR) return;
    const cols = t.kind === OAK ? [P.leafOchre, P.leafRust, P.leafRust, P.leafDark] : [P.leafGold, P.leafGold, P.leafOchre];
    const p = new Particle(t.x + (Math.random() - 0.5) * t.crownR * 1.4, t.y - t.h + 10 + Math.random() * 12,
      0.05 + Math.random() * 0.05, 0.11 + Math.random() * 0.05, 150 + Math.floor(Math.random() * 60), cols);
    p.wob = 0.35;
    addParticle(p);
  }
}

/* --- a tiny 3×5 pixel font for the title (no anti-aliased text) ----- */
// Each glyph is five rows of three pixels, top to bottom.
const FONT = {
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.', E: '### #.. ##. #.. ###', G: '.## #.. #.# #.# .##',
  I: '### .#. .#. .#. ###', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..', U: '#.# #.# #.# #.# ###',
  R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', Y: '#.# #.# .#. .#. .#.',
  ' ': '... ... ... ... ...',
};
function glyph(ch) {
  return (FONT[ch] || FONT[' ']).replace(/ /g, '');
}
function drawText(str, cx, y, s, col) {
  const w = str.length * 4 * s - s;
  let x = Math.floor(cx - w / 2);
  for (const ch of str) {
    const g = glyph(ch);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r * 3 + c] === '#') { fill(col); rect(x + c * s, y + r * s, s, s); }
    }
    x += 4 * s;
  }
}

function drawTitle() {
  if (hasMoved) titleFade++;
  // stepped fade: full, two-thirds, one-third, gone
  const alpha = [255, 170, 85, 0][Math.min(3, Math.floor(titleFade / 20))];
  if (alpha === 0) return;
  const shade = color(PALETTE.titleShadow); shade.setAlpha(alpha);
  const tcol = color(PALETTE.title); tcol.setAlpha(alpha);
  const hcol = color(PALETTE.hint); hcol.setAlpha(alpha);
  drawText('BETWEEN BLOOM AND DECAY', W / 2 + 1, 57, 2, shade);
  drawText('BETWEEN BLOOM AND DECAY', W / 2, 56, 2, tcol);
  drawText('WASD  MOVE     CLICK  PULSE     R  RENEW', W / 2 + 1, 155, 1, shade);
  drawText('WASD  MOVE     CLICK  PULSE     R  RENEW', W / 2, 154, 1, hcol);
}

function drawFadeIn() {
  if (fadeIn > 48) return;
  const a = [255, 190, 125, 60][Math.floor(fadeIn / 12)];
  const c = color(PALETTE.fadeIn); c.setAlpha(a);
  fill(c); rect(0, 0, W, H);
  fadeIn++;
}


/* ---------------------------------------------------------------------
   7. P5 ENTRY POINTS
   --------------------------------------------------------------------- */
function setup() {
  const cnv = createCanvas(W, H);
  cnv.parent('stage');
  pixelDensity(1);
  noSmooth();
  noStroke();
  frameRate(60);

  buildSprites();
  lightImg = createImage(LW, LH);
  lightImg.loadPixels();
  light = new Float32Array(LW * LH);
  mistImg = createImage(LW, LH);
  mistImg.loadPixels();

  generateWorld(Math.floor(Math.random() * 1e9));
  windowResized();
}

function draw() {
  // --- update ---
  player.update();
  if (frameCount % CONFIG.SIM_EVERY === 0) {
    simulateTick();
    for (let i = 0; i < N; i++) worn[i] *= CONFIG.TRAMPLE_DECAY;   // trampled earth slowly recovers
  }
  for (const c of creatures) c.update();
  pulses = pulses.filter(p => p.update());
  particles = particles.filter(p => p.update());
  if (pulseCooldown > 0) pulseCooldown--;

  // pollen drifting up from blossoms, fluff on the breeze, falling leaves
  if (frameCount % 5 === 0) {
    const i = Math.floor(Math.random() * N);
    if (state[i] === BLOOM) spawnSpore((i % CONFIG.COLS) * T + 4, Math.floor(i / CONFIG.COLS) * T + 2);
  }
  spawnAmbient();

  // --- render (back to front) ---
  background(PALETTE.void);
  drawGround();
  drawActors();
  drawLighting();
  drawMist();
  // luminous things are drawn over the shade and mist
  for (const c of creatures) c.draw();
  for (const p of pulses) p.draw();
  for (const p of particles) p.draw();
  const gust = windAt(W / 2, 0) > 0.9 ? 1 : 0;
  image(frameTop[gust], 0, 0);
  image(frameBottom[gust], 0, H - frameBottom[0].height);
  drawTitle();
  drawFadeIn();
}

/* Scale the tiny canvas up by a whole number so pixels stay square. */
function windowResized() {
  const s = Math.max(1, Math.min(CONFIG.MAX_SCALE, Math.floor(Math.min(windowWidth / W, windowHeight / H))));
  const el = document.querySelector('canvas');
  el.style.width = W * s + 'px';
  el.style.height = H * s + 'px';
}

/* Clicking releases a fertility pulse centred on the spirit itself.
   (Where you click does not matter: all influence comes from the spirit.) */
function mousePressed() {
  if (pulseCooldown > 0) return;
  pulses.push(new Pulse(player.x, player.y - 1));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    addParticle(new Particle(player.x, player.y - 4, Math.cos(a) * 0.35, Math.sin(a) * 0.25 - 0.1, 26,
      [PALETTE.pulse, PALETTE.pulseMid, PALETTE.pulseDim]));
  }
  pulseCooldown = CONFIG.PULSE_COOLDOWN;
  hasMoved = true;
}

function keyPressed() {
  if (key === 'r' || key === 'R') generateWorld(Math.floor(Math.random() * 1e9));
  // stop arrow keys / space from scrolling the page
  if ([LEFT_ARROW, RIGHT_ARROW, UP_ARROW, DOWN_ARROW, 32].includes(keyCode)) return false;
}