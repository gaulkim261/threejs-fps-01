import * as THREE from 'three';

export const WEAPONS = Object.freeze({
  Longshot: Object.freeze({ price: 2900, mag: 30, reserve: 120, damage: 34,
    fireRate: 0.12, spread: 0.011, recoil: 0.021, auto: true, reload: 2.2 }),
  Rasp: Object.freeze({ price: 1500, mag: 25, reserve: 100, damage: 19,
    fireRate: 0.075, spread: 0.03, recoil: 0.009, auto: true, reload: 1.8 }),
  Sidearm: Object.freeze({ price: 300, mag: 12, reserve: 48, damage: 26,
    fireRate: 0.16, spread: 0.016, recoil: 0.012, auto: false, reload: 1.4 }),
  Frag: Object.freeze({ price: 300, fuse: 2.5, radius: 5 }),
});

export function createWeaponSystem(state) {
  const raycaster = new THREE.Raycaster();
  const eye = new THREE.Vector3(), direction = new THREE.Vector3();
  const point = new THREE.Vector3(), box = new THREE.Box3();
  const meshes = [], hits = [];
  const results = Array.from({ length: 10 }, () =>
    ({ hit: false, killed: false, headshot: false, victim: null }));
  const danger = state.grenadeDanger || (state.grenadeDanger = {
    pos: new THREE.Vector3(), radius: 0, until: 0,
  });

  function prepare(s) {
    if (!s || !s.weapon) return;
    if (s._weaponRef !== s.weapon) {
      s._weaponRef = s.weapon;
      s.cooldown = s.reloadTime = s.bloom = s.stillTime = 0;
      s.reloading = false;
    }
  }
  function remember(s) {
    const stock = s.owned?.[s.weapon.name];
    if (stock) {
      stock.mag = s.weapon.mag;
      stock.reserve = s.weapon.reserve;
    }
  }
  function spread(s) {
    const def = WEAPONS[s.weapon.name] || WEAPONS.Sidearm;
    const moving = s.vel.x * s.vel.x + s.vel.z * s.vel.z > 0.04;
    if (!moving && s.stillTime >= 0.3) s.bloom = 0;
    s.spread = (def.spread + (moving ? 0.02 : 0) + s.bloom) *
      (s.crouched ? 0.6 : 1);
    return s.spread;
  }
  function aim(s) {
    eye.copy(s.pos);
    eye.y += s.crouched ? 1.1 : 1.7;
    const cos = Math.cos(s.pitch);
    direction.set(-Math.sin(s.yaw) * cos, Math.sin(s.pitch),
      -Math.cos(s.yaw) * cos);
  }
  function walls(limit) {
    let distance = limit;
    for (const c of state.world.colliders) {
      box.set(c.min, c.max);
      if (box.containsPoint(raycaster.ray.origin)) return 0;
      if (raycaster.ray.intersectBox(box, point))
        distance = Math.min(distance, point.distanceTo(raycaster.ray.origin));
    }
    return distance;
  }
  function collect(s, shooter) {
    if (!s || !s.alive || s === shooter) return;
    s.hitbox.position.copy(s.pos);
    s.hitbox.rotation.y = s.yaw;
    s.hitbox.updateWorldMatrix(true, true);
    for (const mesh of s.hitbox.children) {
      if (!mesh.isMesh || !mesh.userData.part) continue;
      mesh.userData.shooter = s;
      meshes.push(mesh);
    }
  }
  function depleted(s) {
    if (s.weapon.mag || s.reloading) return;
    if (s.weapon.reserve > 0) reload(s);
    else switchTo(s, 'Sidearm');
  }
  function warn(g) {
    danger.pos.copy(g.pos);
    danger.radius = g.radius;
    danger.until = state.time + Math.max(0, g.fuse) + 0.3;
  }
  function hurt(victim, damage, attacker, headshot) {
    victim.hp = Math.max(0, victim.hp - damage);
    victim.lastDamageTime = state.time;
    victim.damageFlash = 0.35;
    const angle = Math.atan2(victim.pos.x - attacker.pos.x,
      victim.pos.z - attacker.pos.z) - victim.yaw;
    victim.damageDirection = Math.atan2(Math.sin(angle), Math.cos(angle));
    if (victim.hp > 0) return false;
    victim.alive = false;
    victim.vel.set(0, 0, 0);
    victim.noise = 0;
    victim.reloading = false;
    victim.reloadTime = 0;
    victim.killer = attacker;
    victim.deathHeadshot = headshot;
    return true;
  }
  function fire(s) {
    if (!s?.alive || state.round?.phase === 'buy' ||
        state.round?.phase === 'over') return null;
    prepare(s);
    const weapon = s.weapon, def = WEAPONS[weapon.name];
    if (!def?.damage || s.reloading || s.cooldown > 0.000001) return null;
    if (weapon.mag <= 0) {
      depleted(s);
      return null;
    }
    const slot = s === state.player ? 0 : state.bots.indexOf(s) + 1;
    const result = results[slot];
    result.hit = result.killed = result.headshot = false; result.victim = null;
    aim(s);
    const cone = spread(s);
    const angle = state.rng() * Math.PI * 2, radius = Math.sqrt(state.rng()) * cone;
    const yaw = s.yaw + Math.cos(angle) * radius, pitch = s.pitch + Math.sin(angle) * radius;
    const cos = Math.cos(pitch);
    direction.set(-Math.sin(yaw) * cos, Math.sin(pitch), -Math.cos(yaw) * cos);
    raycaster.set(eye, direction);
    raycaster.near = 0;
    raycaster.far = walls(100);
    meshes.length = hits.length = 0;
    collect(state.player, s);
    for (const bot of state.bots) collect(bot, s);
    raycaster.intersectObjects(meshes, false, hits);
    if (hits.length && hits[0].distance < raycaster.far) {
      const hit = hits[0], victim = hit.object.userData.shooter;
      const part = hit.object.userData.part;
      const scale = part === 'head' ? 2 : part === 'legs' ? 0.75 : 1;
      const fall = 1 - 0.4 * THREE.MathUtils.clamp((hit.distance - 15) / 25, 0, 1);
      const damage = def.damage * scale * fall *
        (victim.armor && part === 'body' ? 0.5 : 1);
      result.hit = true;
      result.headshot = part === 'head';
      result.victim = victim;
      result.killed = hurt(victim, damage, s, result.headshot);
    }
    weapon.mag--;
    s.cooldown = def.fireRate;
    s.gunNoise = 25;
    s.gunNoiseUntil = state.time + 0.65;
    s.pitch = THREE.MathUtils.clamp(s.pitch + def.recoil, -1.5, 1.5);
    s.yaw += (state.rng() - 0.5) * def.recoil * 0.55;
    s.bloom = Math.min(0.06, s.bloom + 0.004);
    s.stillTime = 0;
    spread(s);
    remember(s);
    state.audio?.shoot(weapon.name);
    depleted(s);
    return result;
  }
  function reload(s) {
    if (!s?.alive) return false;
    prepare(s);
    const def = WEAPONS[s.weapon.name];
    if (!def?.damage || s.reloading || s.weapon.mag >= def.mag ||
        s.weapon.reserve <= 0) return false;
    s.reloading = true;
    s.reloadTime = def.reload;
    if (!s.isBot) state.audio?.reload();
    return true;
  }
  function switchTo(s, name) {
    if (!s?.alive || !WEAPONS[name]?.damage) return false;
    prepare(s);
    const stock = s.owned?.[name];
    if (!stock) return false;
    if (s.weapon.name === name) return true;
    remember(s);
    s.weapon.name = name;
    s.weapon.mag = stock.mag;
    s.weapon.reserve = stock.reserve;
    s.reloading = false; s.reloadTime = s.bloom = s.stillTime = 0;
    spread(s);
    if (!s.weapon.mag && s.weapon.reserve > 0) reload(s);
    return true;
  }
  function throwGrenade(s) {
    if (!s?.alive || state.round?.phase === 'buy' ||
        state.round?.phase === 'over' || !s.owned?.Frag) return null;
    const stock = s.owned.Frag;
    if (typeof stock === 'number' && stock > 0) s.owned.Frag--;
    else if (stock.mag > 0) stock.mag--;
    else if (stock.reserve > 0) stock.reserve--;
    else return null;
    aim(s);
    const g = {
      pos: eye.clone(), vel: direction.clone().multiplyScalar(11),
      fuse: WEAPONS.Frag.fuse, radius: WEAPONS.Frag.radius,
      owner: s, bounced: false, settled: false,
    };
    g.vel.y += 4;
    state.grenades.push(g);
    warn(g);
    return g;
  }
  function blast(s, g) {
    if (!s?.alive) return;
    eye.copy(s.pos);
    eye.y += s.crouched ? 0.65 : 0.9;
    const distance = eye.distanceTo(g.pos);
    if (distance >= g.radius) return;
    direction.subVectors(eye, g.pos).normalize();
    raycaster.set(g.pos, direction);
    if (walls(distance) < distance - 0.001) return;
    hurt(s, 120 * (1 - distance / g.radius) * (s.armor ? 0.5 : 1), g.owner, false);
  }
  function tick(s, dt) {
    if (!s) return;
    prepare(s);
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.damageFlash = Math.max(0, (s.damageFlash || 0) - dt);
    if (!s.alive) {
      s.reloading = false;
      s.reloadTime = s.bloom = 0;
      return;
    }
    if (s.reloading) {
      s.reloadTime = Math.max(0, s.reloadTime - dt);
      if (s.reloadTime <= 0.000001) {
        const amount = Math.min(WEAPONS[s.weapon.name].mag - s.weapon.mag,
          s.weapon.reserve);
        s.weapon.mag += amount;
        s.weapon.reserve -= amount;
        s.reloading = false;
        s.reloadTime = 0;
        remember(s);
      }
    }
    if (s.vel.x * s.vel.x + s.vel.z * s.vel.z <= 0.04) {
      s.stillTime += dt;
      s.bloom = Math.max(0, s.bloom - 0.015 * dt);
    } else s.stillTime = 0;
    spread(s);
    depleted(s);
  }
  function update(dt) {
    tick(state.player, dt);
    for (const bot of state.bots) tick(bot, dt);
    let urgent = null;
    for (let i = state.grenades.length - 1; i >= 0; i--) {
      const g = state.grenades[i];
      if (!g.settled) {
        for (let axis = 0; axis < 3; axis++) {
          const key = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
          const start = g.pos[key], end = start + g.vel[key] * dt;
          direction.set(0, 0, 0);
          direction[key] = g.vel[key] >= 0 ? 1 : -1;
          raycaster.set(g.pos, direction);
          const travel = Math.abs(end - start), safe = walls(travel);
          g.pos[key] += direction[key] * (safe < travel ? Math.max(0, safe - 0.001) : travel);
          if (safe < travel) g.vel[key] *= -0.35;
        }
        g.vel.y -= 9.8 * dt;
        if (g.pos.y <= 0.08) {
          g.pos.y = 0.08;
          if (!g.bounced) {
            g.bounced = true;
            g.vel.y = Math.abs(g.vel.y) * 0.4;
            g.vel.x *= 0.65;
            g.vel.z *= 0.65;
          } else {
            g.settled = true;
            g.vel.set(0, 0, 0);
          }
        }
      }
      g.fuse -= dt;
      if (g.fuse <= 0.000001) {
        blast(state.player, g);
        for (const bot of state.bots) blast(bot, g);
        state.audio?.shoot('Frag');
        warn(g);
        state.grenades.splice(i, 1);
      } else if (!urgent || g.fuse < urgent.fuse) urgent = g;
    }
    if (urgent) warn(urgent);
    else if (danger.until <= state.time) danger.radius = 0;
  }
  return { fire, reload, switchTo, throwGrenade, update };
}
