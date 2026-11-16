import * as THREE from 'three';

export function createBomb(state) {
  const visual = new THREE.Group();
  visual.name = 'Scrapline charge';
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const casing = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({
    color: 0x202c32, metalness: 0.55, roughness: 0.6,
  }));
  casing.scale.set(0.4, 0.4, 0.4);
  casing.position.y = 0.2;
  casing.castShadow = casing.receiveShadow = true;
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: 0xff493f, emissive: 0xff3028, emissiveIntensity: 2,
  });
  const lamp = new THREE.Mesh(cube, lampMaterial);
  lamp.scale.set(0.09, 0.035, 0.09);
  lamp.position.set(0.09, 0.415, 0.09);
  visual.add(casing, lamp);
  visual.visible = false;
  state.scene.add(visual);

  let plantTouched = false, defuseTouched = false;
  let plantAdvanced = false, defuseAdvanced = false;
  let channelSite = null, lastSecond = 35, pulse = 0;
  const bomb = {
    status: 'idle', site: null, timer: 0, plantProgress: 0, defuseProgress: 0,
    plantActor: null, defuseActor: null,
    tryPlant, tryDefuse, update,
  };

  function inZone(actor, key) {
    const site = state.world.sites[key];
    return !!(actor?.alive && site &&
      Math.abs(actor.pos.x - site.pos.x) <= 2 &&
      Math.abs(actor.pos.z - site.pos.z) <= 2);
  }
  function live() {
    return !state.round || state.round.phase === 'live' || state.round.phase === 'planted';
  }
  function tryPlant(actor, site, dt) {
    // Bots pass the world's site record; the player may pass its letter.
    const key = typeof site === 'string' ? site : site?.letter;
    const valid = live() && actor?.team === 'attack' && bomb.status === 'idle' &&
      inZone(actor, key) && (!channelSite || channelSite === key);
    if (!valid) {
      if ((!bomb.plantActor || bomb.plantActor === actor) && !plantTouched) {
        bomb.plantProgress = Math.max(0, bomb.plantProgress - Math.max(0, dt) * 2 / 3);
        plantTouched = true; bomb.plantActor = null;
      }
      return false;
    }
    if (bomb.plantActor && bomb.plantActor !== actor && bomb.plantProgress > 0) return false;
    plantTouched = true;
    bomb.plantActor = actor;
    channelSite = key;
    if (!plantAdvanced) bomb.plantProgress = Math.min(1, bomb.plantProgress + Math.max(0, dt) / 3);
    plantAdvanced = true;
    if (bomb.plantProgress >= 1 - 1e-9) {
      bomb.plantProgress = 1;
      bomb.status = 'planted'; bomb.site = key; bomb.timer = 35;
      lastSecond = 35; pulse = 0;
      visual.position.copy(state.world.sites[key].pos);
      visual.visible = true;
      bomb.plantActor = null;
      state.audio?.plant();
    }
    return true;
  }
  function tryDefuse(actor, dt) {
    const valid = live() && actor?.team === 'defend' && bomb.status === 'planted' &&
      bomb.timer > 0 && inZone(actor, bomb.site);
    if (!valid) {
      if ((!bomb.defuseActor || bomb.defuseActor === actor) && !defuseTouched) {
        bomb.defuseProgress = Math.max(0, bomb.defuseProgress - Math.max(0, dt) * 2 / 5);
        defuseTouched = true; bomb.defuseActor = null;
      }
      return false;
    }
    if (bomb.defuseActor && bomb.defuseActor !== actor && bomb.defuseProgress > 0) return false;
    defuseTouched = true;
    bomb.defuseActor = actor;
    if (!defuseAdvanced) bomb.defuseProgress = Math.min(1, bomb.defuseProgress + Math.max(0, dt) / 5);
    defuseAdvanced = true;
    if (bomb.defuseProgress >= 1 - 1e-9) {
      bomb.defuseProgress = 1; bomb.status = 'defused';
      bomb.defuseActor = null; visual.visible = false;
      state.audio?.defuse();
    }
    return true;
  }
  function update(dt) {
    dt = Math.max(0, dt);
    if (bomb.status === 'idle') {
      if (!plantTouched || (bomb.plantActor && !bomb.plantActor.alive)) {
        bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 2 / 3);
        bomb.plantActor = null;
      }
      if (bomb.plantProgress === 0) { bomb.plantActor = null; channelSite = null; }
      bomb.defuseActor = null;
      lastSecond = 35; pulse = 0;
      visual.visible = false;
    } else if (bomb.status === 'planted') {
      if (!defuseTouched || (bomb.defuseActor && !bomb.defuseActor.alive)) {
        bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt * 2 / 5);
        bomb.defuseActor = null;
      }
      if (bomb.defuseProgress === 0) bomb.defuseActor = null;
      if (live()) bomb.timer = Math.max(0, bomb.timer - dt);
      const urgency = 1 - bomb.timer / 35;
      const second = Math.ceil(bomb.timer);
      if (second !== lastSecond && bomb.timer > 0) {
        lastSecond = second;
        state.audio?.beep(urgency);
      }
      pulse += dt * (2 + urgency * 10);
      lampMaterial.emissiveIntensity = 0.3 + 3.7 * Math.max(0, Math.sin(pulse * Math.PI * 2));
      visual.position.copy(state.world.sites[bomb.site].pos);
      visual.visible = true;
      if (bomb.timer <= 0) {
        bomb.status = 'detonated'; bomb.defuseActor = null;
        visual.visible = false;
      }
    } else {
      visual.visible = false;
      bomb.plantActor = bomb.defuseActor = null;
    }
    plantTouched = defuseTouched = plantAdvanced = defuseAdvanced = false;
  }
  return bomb;
}
