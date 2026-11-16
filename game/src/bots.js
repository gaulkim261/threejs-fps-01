import * as THREE from 'three';

const contexts = new WeakMap();
const FOV = Math.cos(50 * Math.PI / 180);
const AXES = ['x', 'y', 'z'];
const start = new THREE.Vector3(), delta = new THREE.Vector3();

function dist2(a, b) {
  const x = a.x - b.x, z = a.z - b.z;
  return x * x + z * z;
}

function blocked(world, sx, sy, sz, tx, ty, tz, pad = 0, height = 0) {
  start.set(sx, sy, sz); delta.set(tx - sx, ty - sy, tz - sz);
  for (const c of world.colliders) {
    if (height && (c.max.y <= 0 || c.min.y >= height)) continue;
    let lo = 0, hi = 0.99999;
    for (const axis of AXES) {
      const s = start[axis], d = delta[axis];
      const min = c.min[axis] - (axis === 'y' ? height : pad);
      const max = c.max[axis] + (axis === 'y' ? 0 : pad);
      if (Math.abs(d) < 1e-9) {
        if (s < min || s > max) { hi = -1; break; }
      } else {
        const a = (min - s) / d, b = (max - s) / d;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
        if (lo > hi) break;
      }
    }
    if (lo <= hi) return true;
  }
  return false;
}

function clear(world, a, b) {
  return !blocked(world, a.x, 0, a.z, b.x, 0, b.z, 0.315, 1.8);
}

function free(world, x, z) {
  for (const c of world.colliders)
    if (c.max.y > 0 && c.min.y < 1.8 &&
        x > c.min.x - 0.32 && x < c.max.x + 0.32 &&
        z > c.min.z - 0.32 && z < c.max.z + 0.32) return false;
  return true;
}

function navigation(world) {
  const nodes = [];
  function add(x, z) {
    if (!free(world, x, z)) return;
    for (const p of nodes) if (Math.abs(p.x - x) < 0.05 && Math.abs(p.z - z) < 0.05) return;
    nodes.push(new THREE.Vector3(x, 0, z));
  }
  for (const route of Object.values(world.waypoints)) for (const p of route) add(p.x, p.z);
  for (const spawns of Object.values(world.spawns)) for (const p of spawns) add(p.x, p.z);
  for (const site of Object.values(world.sites)) add(site.pos.x, site.pos.z);
  for (const c of world.colliders) {
    if (c.max.y <= 0 || c.min.y >= 1.8) continue;
    for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++)
      add(x ? c.max.x + 0.45 : c.min.x - 0.45, z ? c.max.z + 0.45 : c.min.z - 0.45);
  }
  const n = nodes.length, edges = new Float64Array(n * n);
  edges.fill(Infinity);
  for (let i = 0; i < n; i++) {
    edges[i * n + i] = 0;
    for (let j = i + 1; j < n; j++) if (clear(world, nodes[i], nodes[j]))
      edges[i * n + j] = edges[j * n + i] = Math.sqrt(dist2(nodes[i], nodes[j]));
  }
  return { nodes, edges, costs: new Float64Array(n),
    prev: new Int16Array(n), visited: new Uint8Array(n) };
}

function sync(bot) {
  bot.hitbox.position.copy(bot.pos); bot.hitbox.rotation.set(0, bot.yaw, 0);
  bot.hitbox.children[3].rotation.x = bot.pitch;
  bot.hitbox.visible = bot.alive; bot.hitbox.updateWorldMatrix(true, true);
}

function entrance(world, site) {
  const route = world.waypoints[site];
  return route[Math.max(0, route.length - 2)];
}

function holdPoint(bot, world, site, planted) {
  const ai = bot.ai, spawn = world.spawns[bot.team][ai.spawnIndex];
  const center = site === 'mid' ? world.spawns.defend[4] : world.sites[site].pos;
  ai.holdPos.copy(center);
  if (!planted && bot.team === 'defend' && dist2(spawn, center) < 49)
    ai.holdPos.copy(spawn);
  else if (site !== 'mid') {
    ai.holdPos.z += (ai.spawnIndex % 2 ? -1 : 1) * (planted ? 1.4 : 0.7);
    if (!free(world, ai.holdPos.x, ai.holdPos.z)) ai.holdPos.copy(center);
  }
  const entry = site === 'mid' ? world.waypoints.mid[1] : entrance(world, site);
  ai.holdYaw = Math.atan2(ai.holdPos.x - entry.x, ai.holdPos.z - entry.z);
  ai.holdTime = 0; ai.navGoal.set(Infinity, 0, Infinity);
}

export function createBots(state, world) {
  const nav = navigation(world);
  contexts.set(state, { nav, defuser: null,
    shotNoise: { pos: new THREE.Vector3(), until: -1, source: null } });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const amber = new THREE.MeshStandardMaterial({ color: 0xe79a56, roughness: 0.72 });
  const teal = new THREE.MeshStandardMaterial({ color: 0x59b8c3, roughness: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x26343b, metalness: 0.65 });
  const bots = [];
  for (let i = 0; i < 9; i++) {
    const attack = i < 4, index = attack ? i : i - 4;
    const team = attack ? 'attack' : 'defend';
    const name = `${attack ? 'Sparrow' : 'Jackal'}-${index + 1}`;
    const hitbox = new THREE.Group(); hitbox.name = name;
    for (let part = 0; part < 3; part++) {
      const mesh = new THREE.Mesh(cube, attack ? amber : teal);
      mesh.userData.part = part === 0 ? 'head' : part === 1 ? 'body' : 'legs';
      if (part === 0) { mesh.position.y = 1.55; mesh.scale.set(0.25, 0.25, 0.25); }
      else if (part === 1) { mesh.position.y = 1.12; mesh.scale.set(0.5, 0.6, 0.32); }
      else { mesh.position.y = 0.41; mesh.scale.set(0.4, 0.82, 0.3); }
      mesh.castShadow = mesh.receiveShadow = true; hitbox.add(mesh);
    }
    const gun = new THREE.Mesh(cube, steel);
    gun.position.set(0.2, 1.2, -0.36); gun.scale.set(0.12, 0.15, 0.65);
    gun.castShadow = true; hitbox.add(gun);
    const site = attack ? (index < 2 ? 'A' : 'B') :
      (index < 2 ? 'A' : index < 4 ? 'B' : 'mid');
    const bot = {
      name, pos: world.spawns[team][attack ? index + 1 : index].clone(),
      yaw: attack ? -Math.PI / 2 : Math.PI / 2, pitch: 0,
      hp: 100, alive: true, crouched: false, armor: false,
      weapon: { name: 'Sidearm', mag: 12, reserve: 48 },
      owned: { Sidearm: { mag: 12, reserve: 48 } },
      isBot: true, team, hitbox, vel: new THREE.Vector3(), noise: 0, spread: 0.016,
      ai: {
        mode: 'route', target: null, waypointIndex: 0,
        route: world.waypoints[site].slice(), site,
        reactUntil: 0, burstLeft: 0, burstPauseUntil: 0,
        lastSeenPos: null, heardPos: null, seenAt: -Infinity, heardAt: -Infinity,
        heardUntil: -1, visible: null, wasVisible: false, quietTime: 0,
        resumeMode: 'route', returnMode: 'route', holdTime: 0, holdYaw: 0,
        scanPhase: i * 1.73, spawnIndex: attack ? index + 1 : index,
        holdPos: new THREE.Vector3(), moveGoal: new THREE.Vector3(),
        seenStore: new THREE.Vector3(), heardStore: new THREE.Vector3(),
        navGoal: new THREE.Vector3(Infinity, 0, Infinity),
        path: new Int16Array(nav.nodes.length), pathN: 0, pathI: 0,
        retryAt: 0, stuckTime: 0, wantMove: false, investigateUntil: 0,
        plantedSite: null, rally: !attack, grenadeUntil: 0, channeling: false,
      },
    };
    for (let j = 0; j < 3; j++) hitbox.children[j].userData.shooter = bot;
    holdPoint(bot, world, site, false); sync(bot);
    state.scene.add(hitbox); bots.push(bot);
  }
  return bots;
}

export function assignRoundPlan(state) {
  const roles = ['A', 'A', 'B', 'B', 'mid'];
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    const swap = roles[i]; roles[i] = roles[j]; roles[j] = swap;
  }
  if (state.player) state.player.sitePlan = roles[0];
  let attacker = 1, defender = 0;
  for (const bot of state.bots) {
    const ai = bot.ai;
    ai.site = bot.team === 'attack' ? roles[attacker++] :
      (defender < 2 ? 'A' : defender < 4 ? 'B' : 'mid');
    if (bot.team === 'defend') defender++;
    ai.route = state.world.waypoints[ai.site].slice();
    ai.mode = 'route'; ai.waypointIndex = 0; ai.rally = bot.team === 'defend';
    holdPoint(bot, state.world, ai.site, false);
  }
}

export function resetBots(state) {
  for (const bot of state.bots) {
    const ai = bot.ai;
    bot.pos.copy(state.world.spawns[bot.team][ai.spawnIndex]); bot.pos.y = 0;
    bot.yaw = bot.team === 'attack' ? -Math.PI / 2 : ai.holdYaw;
    Object.assign(bot, { pitch: 0, hp: 100, alive: true, crouched: false, armor: false,
      noise: 0, gunNoise: 0, gunNoiseUntil: 0, spread: 0.016,
      cooldown: 0, reloadTime: 0, bloom: 0, stillTime: 0, reloading: false,
      _weaponRef: null, killer: null, deathHeadshot: false, deathReported: false, damageFlash: 0,
      lastDamageTime: -Infinity, lastShotResult: null, lastShotTime: -Infinity });
    bot.weapon = { name: 'Sidearm', mag: 12, reserve: 48 };
    bot.owned = { Sidearm: { mag: 12, reserve: 48 } }; bot.vel.set(0, 0, 0);
    Object.assign(ai, { mode: 'route', resumeMode: 'route', returnMode: 'route',
      target: null, visible: null, lastSeenPos: null, heardPos: null,
      waypointIndex: 0, burstLeft: 0, reactUntil: 0, burstPauseUntil: 0,
      seenAt: -Infinity, heardAt: -Infinity, heardUntil: -1, wasVisible: false,
      wantMove: false, channeling: false, quietTime: 0, holdTime: 0,
      stuckTime: 0, investigateUntil: 0, grenadeUntil: 0, plantedSite: null,
      rally: bot.team === 'defend', pathN: 0, pathI: 0, retryAt: 0 });
    holdPoint(bot, state.world, ai.site, false); sync(bot);
  }
  const context = contexts.get(state);
  if (context) { context.defuser = null; context.shotNoise.until = -1; }
  state.shotNoise = null;
}

function visible(bot, enemy, world) {
  if (!enemy?.alive || enemy.team === bot.team) return false;
  const dx = enemy.pos.x - bot.pos.x, dz = enemy.pos.z - bot.pos.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1600 || (d2 > 0.0001 &&
      (-Math.sin(bot.yaw) * dx - Math.cos(bot.yaw) * dz) / Math.sqrt(d2) < FOV)) return false;
  return !blocked(world, bot.pos.x, 1.55, bot.pos.z,
    enemy.pos.x, enemy.crouched ? 0.75 : 1.2, enemy.pos.z);
}

function perceive(bot, dt, state) {
  const ai = bot.ai;
  let enemy = null, best = Infinity;
  for (let i = -1; i < state.bots.length; i++) {
    const other = i < 0 ? state.player : state.bots[i];
    if (other === bot || !visible(bot, other, state.world)) continue;
    const score = dist2(bot.pos, other.pos) * (other === ai.target ? 0.8 : 1);
    if (score < best) { best = score; enemy = other; }
  }
  ai.visible = enemy;
  if (enemy) {
    if (enemy !== ai.target || !ai.wasVisible) {
      ai.reactUntil = state.time + 0.25 + state.rng() * 0.2; ai.burstLeft = 0;
    }
    ai.target = enemy; ai.seenStore.copy(enemy.pos); ai.lastSeenPos = ai.seenStore;
    ai.seenAt = state.time; ai.quietTime = 0; ai.investigateUntil = 0;
  } else {
    ai.quietTime += dt;
    if (ai.target && (!ai.target.alive || state.time - ai.seenAt > 3)) ai.target = null;
  }
  ai.wasVisible = !!enemy;
  const player = state.player, noise = state.shotNoise;
  let heard = null;
  if (player?.alive && player.team !== bot.team && player.noise > 0 &&
      dist2(bot.pos, player.pos) <= player.noise * player.noise) heard = player.pos;
  if (noise && state.time < noise.until && noise.source !== bot && dist2(bot.pos, noise.pos) <= 625) {
    ai.heardStore.copy(noise.pos); ai.heardPos = ai.heardStore; ai.heardAt = state.time;
    if (noise.until !== ai.heardUntil) {
      ai.heardUntil = noise.until;
      if (!noise.source || noise.source.team !== bot.team) heard = noise.pos;
    }
  }
  if (heard) {
    ai.heardStore.copy(heard); ai.heardPos = ai.heardStore; ai.heardAt = state.time;
    if (!enemy && !ai.target && ai.mode !== 'plant' && !ai.plantedSite)
      ai.investigateUntil = state.time + 2.5;
  }
}

function pathTo(bot, goal, state, nav) {
  const ai = bot.ai, n = nav.nodes.length;
  ai.navGoal.copy(goal); ai.pathN = ai.pathI = 0; ai.retryAt = state.time + 0.8;
  nav.costs.fill(Infinity); nav.prev.fill(-1); nav.visited.fill(0);
  for (let i = 0; i < n; i++) if (clear(state.world, bot.pos, nav.nodes[i]))
    nav.costs[i] = Math.sqrt(dist2(bot.pos, nav.nodes[i]));
  let finish = -1, finishCost = Infinity;
  for (let pass = 0; pass < n; pass++) {
    let node = -1, cost = Infinity;
    for (let i = 0; i < n; i++) if (!nav.visited[i] && nav.costs[i] < cost) {
      node = i; cost = nav.costs[i];
    }
    if (node < 0 || cost >= finishCost) break;
    nav.visited[node] = 1;
    if (clear(state.world, nav.nodes[node], goal)) {
      const total = cost + Math.sqrt(dist2(nav.nodes[node], goal));
      if (total < finishCost) { finish = node; finishCost = total; }
    }
    for (let i = 0; i < n; i++) {
      const next = cost + nav.edges[node * n + i];
      if (next < nav.costs[i]) { nav.costs[i] = next; nav.prev[i] = node; }
    }
  }
  for (let i = finish; i >= 0 && ai.pathN < n; i = nav.prev[i]) ai.path[ai.pathN++] = i;
  for (let lo = 0, hi = ai.pathN - 1; lo < hi; lo++, hi--) {
    const swap = ai.path[lo]; ai.path[lo] = ai.path[hi]; ai.path[hi] = swap;
  }
}

function steer(bot, state, nav) {
  const ai = bot.ai, goal = ai.moveGoal;
  if (clear(state.world, bot.pos, goal)) return goal;
  if (dist2(ai.navGoal, goal) > 0.04 || ai.stuckTime > 0.8 ||
      (!ai.pathN && state.time >= ai.retryAt)) {
    pathTo(bot, goal, state, nav); ai.stuckTime = 0;
  }
  while (ai.pathI < ai.pathN && dist2(bot.pos, nav.nodes[ai.path[ai.pathI]]) < 0.09) ai.pathI++;
  while (ai.pathI + 1 < ai.pathN &&
      clear(state.world, bot.pos, nav.nodes[ai.path[ai.pathI + 1]])) ai.pathI++;
  return ai.pathI < ai.pathN ? nav.nodes[ai.path[ai.pathI]] : null;
}

function sweep(bot, world, axis, other, amount) {
  const origin = bot.pos[axis];
  let end = origin + amount;
  for (const c of world.colliders) {
    if (c.max.y <= 0 || c.min.y >= 1.8 || bot.pos[other] <= c.min[other] - 0.3 ||
        bot.pos[other] >= c.max[other] + 0.3) continue;
    const low = c.min[axis] - 0.3, high = c.max[axis] + 0.3;
    if (amount > 0 && origin <= low && end > low) end = low;
    else if (amount < 0 && origin >= high && end < high) end = high;
  }
  bot.pos[axis] = end;
}

function face(bot, pos, dt, chest = 1.2) {
  const dx = pos.x - bot.pos.x, dz = pos.z - bot.pos.z;
  const yaw = Math.atan2(-dx, -dz);
  const turn = Math.atan2(Math.sin(yaw - bot.yaw), Math.cos(yaw - bot.yaw));
  bot.yaw += THREE.MathUtils.clamp(turn, -7 * dt, 7 * dt);
  bot.pitch = Math.atan2(pos.y + chest - 1.7, Math.max(0.001, Math.hypot(dx, dz)));
}

function move(bot, dt, state, nav) {
  const ai = bot.ai;
  bot.vel.set(0, 0, 0); bot.noise = 0; bot.pos.y = 0;
  if (!ai.wantMove) return;
  const goal = steer(bot, state, nav);
  if (!goal) return;
  const dx = goal.x - bot.pos.x, dz = goal.z - bot.pos.z, length = Math.hypot(dx, dz);
  if (length < 0.02) return;
  const travel = Math.min(length, 4 * dt), x = bot.pos.x, z = bot.pos.z;
  sweep(bot, state.world, 'x', 'z', dx / length * travel);
  sweep(bot, state.world, 'z', 'x', dz / length * travel);
  bot.vel.set((bot.pos.x - x) / dt, 0, (bot.pos.z - z) / dt);
  bot.noise = bot.vel.lengthSq() > 0.04 ? 8 : 0;
  if (dist2(bot.pos, goal) > 0.09 && bot.vel.lengthSq() < 0.04) ai.stuckTime += dt;
  else ai.stuckTime = 0;
  if (ai.mode !== 'engage') { bot.yaw = Math.atan2(-dx, -dz); bot.pitch = 0; }
}

function bombSite(state) {
  const site = state.bomb?.site;
  if (typeof site === 'string') return state.world.sites[site] ? site : null;
  if (site?.letter) return site.letter;
  return null;
}

function objective(bot, state, key) {
  const ai = bot.ai;
  if (!key || ai.plantedSite === key) return;
  ai.plantedSite = ai.site = key; ai.rally = true; ai.investigateUntil = 0;
  ai.returnMode = bot.team === 'attack' ? 'defend' : 'retake';
  if (ai.mode === 'flee') ai.resumeMode = ai.returnMode;
  else ai.mode = ai.returnMode;
  holdPoint(bot, state.world, key, true);
}

function flee(bot, state, nav) {
  const ai = bot.ai, danger = state.grenadeDanger;
  const active = danger?.radius > 0 && state.time < danger.until;
  const distance = active ? Math.sqrt(dist2(bot.pos, danger.pos)) : Infinity;
  if (active && distance < danger.radius + 2 && ai.mode !== 'flee') {
    ai.resumeMode = ai.mode === 'plant' ? 'hold' : ai.mode; ai.mode = 'flee';
  }
  if (ai.mode !== 'flee') return false;
  if (!active || distance >= danger.radius + 3) {
    ai.mode = ai.resumeMode; ai.navGoal.set(Infinity, 0, Infinity); return false;
  }
  let dx = bot.pos.x - danger.pos.x, dz = bot.pos.z - danger.pos.z;
  const length = Math.hypot(dx, dz), travel = danger.radius + 3.3 - distance;
  if (length > 0.001) { dx /= length; dz /= length; }
  else { dx = Math.sin(ai.scanPhase); dz = Math.cos(ai.scanPhase); }
  ai.moveGoal.set(bot.pos.x + dx * travel, 0, bot.pos.z + dz * travel);
  if (!free(state.world, ai.moveGoal.x, ai.moveGoal.z)) {
    for (const p of nav.nodes) if (dist2(p, danger.pos) > (danger.radius + 3) ** 2 &&
        clear(state.world, bot.pos, p)) { ai.moveGoal.copy(p); break; }
  }
  ai.wantMove = true; return true;
}

function go(ai, pos) { ai.moveGoal.copy(pos); ai.wantMove = true; }

function scan(bot, dt, state) {
  const ai = bot.ai;
  bot.yaw = ai.holdYaw + Math.sin(state.time * 0.65 + ai.scanPhase) * 0.55;
  bot.pitch = 0;
  if (ai.heardPos && state.time - ai.heardAt < 2) face(bot, ai.heardPos, dt);
}

function canPlant(bot, state) {
  const ai = bot.ai, site = state.world.sites[ai.site];
  if (!state.bomb || state.bomb.status !== 'idle' || !site || ai.quietTime < 2 ||
      Math.abs(bot.pos.x - site.pos.x) > 2 || Math.abs(bot.pos.z - site.pos.z) > 2) return false;
  if (state.player?.alive && state.input?.interactHeld && dist2(state.player.pos, site.pos) < 9)
    return false;
  for (const other of state.bots) if (other !== bot && other.alive &&
      other.team === 'attack' && other.ai.mode === 'plant') return false;
  return true;
}

function modes(bot, dt, state, context, key) {
  const ai = bot.ai;
  ai.wantMove = ai.channeling = false; objective(bot, state, key);
  if (flee(bot, state, context.nav)) return;
  const defuser = key && bot === context.defuser;
  const center = key ? state.world.sites[key].pos : null;
  const urgent = defuser && (dist2(bot.pos, center) < 1.69 || state.bomb.timer < 12);
  if (ai.visible && !urgent) {
    if (ai.mode !== 'engage') ai.returnMode = key ?
      (bot.team === 'attack' ? 'defend' : 'retake') : (ai.mode === 'plant' ? 'hold' : ai.mode);
    ai.mode = 'engage';
  } else if (urgent) ai.mode = 'retake';
  else if (ai.mode === 'engage' && !ai.target) {
    ai.mode = key ? (bot.team === 'attack' ? 'defend' : 'retake') : ai.returnMode;
  }
  if (ai.mode === 'engage') {
    if (ai.visible) face(bot, ai.visible.pos, dt, ai.visible.crouched ? 0.75 : 1.2);
    else if (ai.lastSeenPos) {
      face(bot, ai.lastSeenPos, dt);
      if (state.time - ai.seenAt > 0.5 && dist2(bot.pos, ai.lastSeenPos) > 4) go(ai, ai.lastSeenPos);
    }
    if (key && defuser) go(ai, center);
    return;
  }
  if (ai.mode === 'route') {
    if (ai.heardPos && state.time < ai.investigateUntil) {
      if (dist2(bot.pos, ai.heardPos) > 2.25) go(ai, ai.heardPos); else face(bot, ai.heardPos, dt);
      return;
    }
    if (ai.rally) {
      if (dist2(bot.pos, ai.holdPos) > 0.09) go(ai, ai.holdPos);
      else { ai.mode = 'hold'; ai.holdTime = 0; }
    } else {
      while (ai.waypointIndex < ai.route.length && dist2(bot.pos, ai.route[ai.waypointIndex]) < 0.12)
        ai.waypointIndex++;
      if (ai.waypointIndex < ai.route.length) go(ai, ai.route[ai.waypointIndex]);
      else { ai.mode = 'hold'; ai.holdTime = 0; }
    }
    return;
  }
  if (ai.mode === 'plant') {
    ai.channeling = true;
    if (!state.bomb.tryPlant(bot, ai.site, dt)) { ai.mode = 'hold'; ai.channeling = false; }
    return;
  }
  if (ai.mode === 'retake' || ai.mode === 'defend') {
    const goal = defuser ? center : ai.holdPos;
    if (goal && dist2(bot.pos, goal) > (defuser ? 1.44 : 0.16)) go(ai, goal);
    else {
      scan(bot, dt, state);
      if (defuser) { ai.channeling = true; state.bomb.tryDefuse(bot, dt); }
    }
    return;
  }
  if (ai.mode === 'hold') {
    ai.holdTime += dt;
    if (dist2(bot.pos, ai.holdPos) > 0.16) go(ai, ai.holdPos); else scan(bot, dt, state);
    if (ai.heardPos && state.time < ai.investigateUntil) ai.mode = 'route';
    else if (bot.team === 'attack' && ai.site === 'mid' && ai.holdTime > 5) {
      ai.site = ai.spawnIndex % 2 ? 'A' : 'B'; ai.rally = true; ai.mode = 'route';
      holdPoint(bot, state.world, ai.site, false);
    } else if (bot.team === 'attack' && canPlant(bot, state)) {
      ai.mode = 'plant'; ai.wantMove = false;
    }
  }
}

function throwFrag(bot, state) {
  const ai = bot.ai, stock = bot.owned.Frag;
  if (bot.team !== 'defend' || !(stock?.mag || stock?.reserve) ||
      ai.mode === 'flee' || ai.channeling || state.time < ai.grenadeUntil) return;
  if (state.bomb?.status !== 'planted' && !(state.bomb?.plantProgress > 0)) return;
  const key = bombSite(state) || (ai.site === 'mid' ? 'A' : ai.site);
  const site = state.world.sites[key].pos, distance = Math.sqrt(dist2(bot.pos, site));
  if (distance < 5 || distance > 22 ||
      blocked(state.world, bot.pos.x, 1.7, bot.pos.z, site.x, 2, site.z)) return;
  bot.yaw = Math.atan2(bot.pos.x - site.x, bot.pos.z - site.z);
  bot.pitch = Math.min(0.4, distance * 0.024 - 0.22);
  const grenade = state.weapons.throwGrenade(bot);
  if (grenade) ai.grenadeUntil = state.time + 4;
}

function combat(bot, state, context) {
  const ai = bot.ai, target = ai.visible;
  if (ai.mode !== 'engage' || !target?.alive || ai.target !== target ||
      state.time < ai.reactUntil || state.time < ai.burstPauseUntil) return;
  if (bot.reloading || bot.cooldown > 0.000001) { state.weapons.fire(bot); return; }
  if (ai.burstLeft <= 0) ai.burstLeft = 3 + Math.floor(state.rng() * 3);
  const dx = target.pos.x - bot.pos.x, dz = target.pos.z - bot.pos.z, distance = Math.hypot(dx, dz);
  const error = 0.02 + 0.0015 * distance + (target.vel.lengthSq() > 4 ? 0.03 : 0);
  bot.yaw = Math.atan2(-dx, -dz) + (state.rng() * 2 - 1) * error;
  bot.pitch = Math.atan2((target.crouched ? 0.75 : 1.2) - 1.7,
    Math.max(0.001, distance)) + (state.rng() * 2 - 1) * error;
  const result = state.weapons.fire(bot);
  if (!result) return;
  const noise = context.shotNoise;
  noise.pos.copy(bot.pos); noise.until = state.time + 1.5;
  noise.source = bot; state.shotNoise = noise;
  bot.lastShotResult = result; bot.lastShotTime = state.time;
  if (result.killed && result.victim.isBot) {
    result.victim.hitbox.visible = false; result.victim.ai.target = null;
  }
  if (--ai.burstLeft === 0) ai.burstPauseUntil = state.time + 0.4 + state.rng() * 0.5;
}

export function updateBots(dt, state) {
  const context = contexts.get(state);
  const key = state.bomb?.status === 'planted' ? bombSite(state) : null;
  context.defuser = null;
  if (key) {
    let nearest = Infinity;
    for (const bot of state.bots) {
      if (!bot.alive || bot.team !== 'defend' || bot.ai.mode === 'flee') continue;
      const d2 = dist2(bot.pos, state.world.sites[key].pos);
      if (d2 < nearest) { nearest = d2; context.defuser = bot; }
    }
  }
  for (const bot of state.bots) {
    if (!bot.alive || bot.hp <= 0) {
      bot.alive = bot.hitbox.visible = false; bot.ai.target = null;
      bot.vel.set(0, 0, 0); bot.noise = 0; continue;
    }
    if (dt <= 0 || state.round.phase === 'buy' || state.round.phase === 'over') {
      bot.vel.set(0, 0, 0); bot.noise = 0; sync(bot); continue;
    }
    perceive(bot, dt, state);
    modes(bot, dt, state, context, key);
    move(bot, dt, state, context.nav);
    throwFrag(bot, state); combat(bot, state, context); sync(bot);
  }
}
