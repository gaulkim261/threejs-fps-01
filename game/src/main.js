// C1 tactical rounds/economy: rounds.js createMatch().
// C2 hitscan, recoil, spread, armor and grenades: weapon.js.
// C3 waypoint routes, sight, sound, bursts and retakes: bots.js.
// C4 planting, defusing and detonation: bomb.js.
// C5 original dusk freight yard: world.js and palette.js.
// C6 HUD, fixed-step simulation and deterministic shots: hud.js/main.js.
import { createBots, updateBots } from './bots.js';
import { createWeaponSystem } from './weapon.js';
import { createBomb } from './bomb.js';
import { createMatch } from './rounds.js';
import { createPlayer } from './player.js';
import { buildWorld } from './world.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { FOG, SKY } from './palette.js';
import * as THREE from 'three';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const query = new URLSearchParams(window.location.search);
const seed = Number(query.get('seed') || 1);
const shot = query.get('shot'), testing = query.get('selftest') === '1';
const FIXED_DT = 1 / 60;
const SITES = ['A', 'B'];
const scene = testing ? { add() {} } : new THREE.Scene();
const camera = testing ? null : new THREE.PerspectiveCamera(75, 1280 / 720, 0.05, 100);
const state = {
  rng: mulberry32(seed), time: 0, scene, camera,
  round: { number: 0, phase: 'buy', timer: 15, scoreA: 0, scoreB: 0, reason: '' },
  player: null, bots: [], bomb: null, economy: { money: 800, lossStreak: 0 },
  world: null, input: null, audio: null, weapons: null, match: null, hud: null,
  grenades: [], shotNoise: null, grenadeDanger: null, lastHit: null,
  buyOpen: true, onPlay: null, onRematch: null, onResume: null, onNextRound: null,
};
window.__scrapline = state;

let renderer = null;
if (!testing) {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(shot ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(1280, 720);
  const host = document.getElementById('game') || document.body;
  host.appendChild(renderer.domElement);
  scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);
}
state.input = testing ? { keys: new Set(), mouseDX: 0, mouseDY: 0,
  crouchHeld: false, interactHeld: false, attackHeld: false } : createInput();
state.audio = testing ? null : createAudio();
state.world = buildWorld(scene);
state.player = createPlayer(state.world, state.input);
state.player.name = 'You';
state.weapons = createWeaponSystem(state);
state.bots = createBots(state, state.world);
state.bomb = createBomb(state);
state.match = createMatch(state);
state.round.score = state.match.score;

function selftest() {
  function check(condition, label) {
    console.log(`SELFTEST ${label}: ${condition ? 'PASS' : 'FAIL'}`);
    return !!condition;
  }
  try {
    state.match.startRound();
    if (!check(state.match.phase === 'buy', 'round start')) return;
    state.match.update(15);
    if (!check(state.match.phase === 'live', 'buy->live')) return;
    const actor = state.bots[0]; actor.pos.copy(state.world.sites.A.pos);
    for (let i = 0; i < 181 && state.bomb.status === 'idle'; i++) {
      state.time += FIXED_DT;
      state.bomb.tryPlant(actor, 'A', FIXED_DT);
      state.bomb.update(FIXED_DT); state.match.update(FIXED_DT);
    }
    if (!check(state.bomb.status === 'planted', 'plant')) return;
    for (let i = 0; i < 2101 && state.bomb.status === 'planted'; i++) {
      state.time += FIXED_DT; state.bomb.update(FIXED_DT); state.match.update(FIXED_DT);
    }
    if (!check(state.bomb.status === 'detonated', 'detonation')) return;
    state.match.update(4);
    check(state.match.roundNumber === 2 || state.match.timer === Infinity, 'plant->detonation');
  } catch (error) { console.log(`SELFTEST plant->detonation: FAIL ${error.message}`); }
}

if (testing) selftest();
else {
  state.hud = createHud(state);
  const input = state.input, player = state.player, match = state.match, hud = state.hud;
  let paused = true, previousAttack = false, lastRound = 0;
  let previousFrame = 0, accumulator = 0;
  const hitRecord = { time: -1, killed: false };
  const playerNoise = { pos: player.pos, until: 0, source: player };
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x354b50, metalness: 0.65 }));
  gun.position.set(0.22, -0.24, -0.4);
  camera.add(gun); scene.add(camera);

  input.requestLock = () => {
    if (shot) return;
    try { renderer.domElement.requestPointerLock()?.catch?.(() => {}); } catch {}
  };
  state.onPlay = () => {
    if (!match.roundNumber) match.startRound();
    paused = false; input.requestLock(); hud.hideOverlay(); state.buyOpen = true;
  };
  state.onResume = () => { paused = false; input.requestLock(); hud.hideOverlay(); };
  state.onRematch = () => {
    hud.hideOverlay(); match.rematch(); paused = false; state.buyOpen = true; input.requestLock();
  };
  state.onNextRound = () => {
    if (match.phase === 'over' && Number.isFinite(match.timer)) match.update(match.timer);
    if (match.phase !== 'over') { paused = false; input.requestLock(); hud.hideOverlay(); }
  };
  document.addEventListener('pointerlockchange', () => {
    if (!shot && !document.pointerLockElement && match.roundNumber && match.phase !== 'over' &&
        !(match.phase === 'buy' && state.buyOpen)) {
      paused = true; hud.showOverlay('pause');
    }
  });
  hud.showOverlay('start');

  function deaths() {
    for (let i = -1; i < state.bots.length; i++) {
      const actor = i < 0 ? player : state.bots[i];
      if (actor.alive) { actor.deathReported = false; continue; }
      if (!actor.deathReported && actor.killer) {
        actor.deathReported = true;
        hud.killfeed(actor.killer, actor, actor.deathHeadshot);
        match.onKill(actor.killer);
      }
    }
  }
  function step() {
    state.time += FIXED_DT;
    player.update(FIXED_DT, state);
    const slot = input.weaponSlotQueued;
    input.weaponSlotQueued = 0;
    if (input.buyToggleQueued) {
      input.buyToggleQueued = false;
      if (match.phase === 'buy') {
        state.buyOpen = !state.buyOpen;
        if (state.buyOpen) document.exitPointerLock(); else input.requestLock();
      }
    }
    if (input.grenadeQueued) { state.weapons.throwGrenade(player); input.grenadeQueued = false; }
    if (slot) {
      if (match.phase === 'buy' && slot <= 4)
        match.buy(player, slot === 1 ? 'Longshot' : slot === 2 ? 'Rasp' : slot === 3 ? 'Sidearm' : 'Frag');
      else if (slot === 4) state.weapons.throwGrenade(player);
      else state.weapons.switchTo(player, slot === 1 ? 'Longshot' : slot === 2 ? 'Rasp' : 'Sidearm');
    }
    if (input.reloadQueued) { state.weapons.reload(player); input.reloadQueued = false; }
    const live = match.phase === 'live' || match.phase === 'planted';
    if (live && player.alive && input.attackHeld && (player.weapon.name !== 'Sidearm' || !previousAttack)) {
      const result = state.weapons.fire(player);
      if (result) {
        playerNoise.until = state.time + 1.5; state.shotNoise = playerNoise;
        if (result.hit) {
          hitRecord.time = state.time; hitRecord.killed = result.killed; state.lastHit = hitRecord;
          if (result.killed) state.audio.kill(); else state.audio.hit();
        }
      }
    }
    previousAttack = !!input.attackHeld;
    if (match.phase === 'live' && player.alive && input.interactHeld) {
      for (const key of SITES) {
        const site = state.world.sites[key];
        if (Math.abs(player.pos.x - site.pos.x) <= 2 && Math.abs(player.pos.z - site.pos.z) <= 2) {
          state.bomb.tryPlant(player, key, FIXED_DT); break;
        }
      }
    }
    updateBots(FIXED_DT, state);
    state.weapons.update(FIXED_DT); deaths();
    state.bomb.update(FIXED_DT); match.update(FIXED_DT); state.world.update(FIXED_DT);
    if (lastRound !== match.roundNumber) { lastRound = match.roundNumber; state.buyOpen = true; }
    hud.update(state);
  }
  function view() {
    camera.position.copy(player.eye); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    gun.visible = player.alive;
  }
  function applyShot(name) {
    match.startRound(); state.time = 12;
    player.pos.set(-12, 0, 0); player.yaw = -Math.PI / 2; player.pitch = 0;
    for (const bot of state.bots) bot.hitbox.visible = false;
    match.phase = 'live'; match.timer = 62; hud.hideOverlay();
    if (name === 'start') { match.phase = 'buy'; match.timer = 15; hud.showOverlay('start'); }
    else if (name === 'play') {
      const bot = state.bots[4]; bot.pos.set(0, 0, 0); bot.yaw = Math.PI / 2 + state.rng() * 0.1;
      bot.hitbox.position.copy(bot.pos); bot.hitbox.rotation.y = bot.yaw; bot.hitbox.visible = true;
      hitRecord.time = state.time; hitRecord.killed = true; state.lastHit = hitRecord;
      hud.killfeed('Sparrow-2', 'Jackal-3', false); hud.killfeed('You', 'Jackal-2', true);
    } else if (name === 'bomb') {
      player.pos.copy(state.world.sites.A.pos); state.bomb.plantProgress = 0.6;
      state.bomb.plantActor = player;
    } else if (name === 'end') {
      match.phase = 'over'; match.timer = 4; match.score.attack = 1;
      state.round.reason = 'Bomb detonated';
      hud.showOverlay('round', { winner: 'attack', reason: state.round.reason, score: match.score });
    }
    state.round.phase = match.phase; state.round.timer = match.timer;
    state.round.scoreA = match.score.attack; state.round.scoreB = match.score.defend;
    player.update(0, state); hud.update(state); view(); renderer.render(scene, camera);
  }
  if (shot) applyShot(shot);
  else {
    function resize() {
      const w = window.innerWidth || 1280, h = window.innerHeight || 720;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize); resize();
    function frame(now) {
      const elapsed = previousFrame ? Math.min(0.1, (now - previousFrame) / 1000) : 0;
      previousFrame = now; input.update();
      if (!paused) {
        accumulator += elapsed;
        while (accumulator >= FIXED_DT) { step(); accumulator -= FIXED_DT; }
      } else accumulator = 0;
      hud.update(state); view(); renderer.render(scene, camera); requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
}
