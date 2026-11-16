import * as THREE from 'three';

export function createPlayer(world, input) {
  const hitbox = new THREE.Group();
  hitbox.name = 'Sparrow player';
  // Hidden in first person; invisible meshes still participate in raycasts.
  hitbox.visible = false;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x76bab0 });
  const parts = ['head', 'body', 'legs'];
  for (const part of parts) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.userData.part = part;
    hitbox.add(mesh);
  }
  const player = {
    pos: world.spawns.attack[0].clone(), yaw: -Math.PI / 2, pitch: 0,
    hp: 100, alive: true, crouched: false, armor: false,
    weapon: { name: 'Sidearm', mag: 12, reserve: 48 },
    isBot: false, team: 'attack', hitbox, vel: new THREE.Vector3(),
    owned: { Sidearm: { mag: 12, reserve: 48 } },
    eye: new THREE.Vector3(), eyeHeight: 1.7, noise: 0, spread: 0.016,
    update,
  };
  for (const mesh of hitbox.children) mesh.userData.shooter = player;
  const target = new THREE.Vector3(), delta = new THREE.Vector3();
  const radius = 0.3, epsilon = 0.00001;
  let height = 1.8, stepClock = 0;

  function intersects(c) {
    return c.max.y > 0 && c.min.y < height &&
      player.pos.x > c.min.x - radius && player.pos.x < c.max.x + radius &&
      player.pos.z > c.min.z - radius && player.pos.z < c.max.z + radius;
  }
  function unstuck() {
    // Also handles externally reset/teleported positions and standing up.
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const c of world.colliders) {
        if (!intersects(c)) continue;
        const p = player.pos;
        const left = p.x - (c.min.x - radius);
        const right = c.max.x + radius - p.x;
        const near = p.z - (c.min.z - radius);
        const far = c.max.z + radius - p.z;
        const least = Math.min(left, right, near, far);
        if (least === left) p.x = c.min.x - radius - epsilon;
        else if (least === right) p.x = c.max.x + radius + epsilon;
        else if (least === near) p.z = c.min.z - radius - epsilon;
        else p.z = c.max.z + radius + epsilon;
        moved = true;
      }
      if (!moved) break;
    }
  }
  function sweep(axis, other, amount) {
    const p = player.pos, start = p[axis];
    let end = start + amount;
    for (const c of world.colliders) {
      if (c.max.y <= 0 || c.min.y >= height ||
          p[other] <= c.min[other] - radius ||
          p[other] >= c.max[other] + radius) continue;
      const low = c.min[axis] - radius, high = c.max[axis] + radius;
      // Swept crossings rather than overlap-only tests prevent tunnelling.
      if (amount > 0 && start <= low && end > low) end = low;
      else if (amount < 0 && start >= high && end < high) end = high;
    }
    p[axis] = end;
  }
  function sync() {
    const crouch = player.crouched;
    player.eyeHeight = crouch ? 1.1 : 1.7;
    player.eye.copy(player.pos);
    player.eye.y += player.eyeHeight;
    const [head, body, legs] = hitbox.children;
    head.position.y = player.eyeHeight;
    head.scale.set(0.25, 0.25, 0.25);
    body.position.y = crouch ? 0.73 : 1.21;
    body.scale.set(0.48, crouch ? 0.49 : 0.72, 0.3);
    legs.position.y = crouch ? 0.24 : 0.425;
    legs.scale.set(0.4, crouch ? 0.48 : 0.85, 0.3);
    hitbox.position.copy(player.pos);
    hitbox.rotation.set(0, player.yaw, 0);
    hitbox.updateWorldMatrix(true, true);
  }
  function update(dt, state) {
    player.yaw -= input.mouseDX * 0.0022;
    player.pitch = THREE.MathUtils.clamp(
      player.pitch - input.mouseDY * 0.0022, -1.5, 1.5,
    );
    // Render queues are consumed once, even with several catch-up sim steps.
    input.mouseDX = input.mouseDY = 0;
    player.crouched = !!input.crouchHeld;
    height = player.crouched ? 1.2 : 1.8;
    player.pos.y = 0;
    if (dt <= 0 || !player.alive || state?.round?.phase === 'over') {
      player.vel.set(0, 0, 0);
      player.noise = stepClock = 0;
      sync();
      return;
    }
    unstuck();
    const k = input.keys;
    let forward = Number(k.has('KeyW')) - Number(k.has('KeyS'));
    let strafe = Number(k.has('KeyD')) - Number(k.has('KeyA'));
    const length = Math.hypot(forward, strafe);
    if (length) {
      forward /= length;
      strafe /= length;
      const speed = player.crouched ? 2.5 : 5;
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      target.set((strafe * cos - forward * sin) * speed, 0,
        (-strafe * sin - forward * cos) * speed);
      delta.subVectors(target, player.vel);
      const change = delta.length();
      if (change <= 40 * dt) player.vel.copy(target);
      else player.vel.addScaledVector(delta, 40 * dt / change);
    } else {
      player.vel.multiplyScalar(Math.exp(-12 * dt));
      if (player.vel.lengthSq() < 0.0025) player.vel.set(0, 0, 0);
    }
    // Crouching caps existing momentum immediately as well as target speed.
    const speed = player.crouched ? 2.5 : 5;
    if (player.vel.lengthSq() > speed * speed) player.vel.setLength(speed);
    const x = player.pos.x, z = player.pos.z;
    sweep('x', 'z', player.vel.x * dt);
    sweep('z', 'x', player.vel.z * dt);
    player.vel.set((player.pos.x - x) / dt, 0, (player.pos.z - z) / dt);
    player.noise = !player.crouched && player.vel.lengthSq() > 0.04 ? 8 : 0;
    if (player.noise) {
      stepClock += dt;
      if (stepClock >= 0.43) {
        stepClock -= 0.43;
        state?.audio?.step();
      }
    } else stepClock = 0;
    sync();
  }
  sync();
  return player;
}
