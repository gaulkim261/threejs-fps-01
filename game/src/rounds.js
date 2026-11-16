import { assignRoundPlan, resetBots } from './bots.js';
import { WEAPONS } from './weapon.js';

export function createMatch(state) {
  state.economy = state.economy || { money: 800, lossStreak: 0 };
  state.round = state.round || {
    number: 0, phase: 'buy', timer: 0, scoreA: 0, scoreB: 0, reason: '',
  };
  const match = {
    phase: 'buy', roundNumber: 0, score: { attack: 0, defend: 0 }, timer: 0,
    economy: state.economy, previousWinner: null, pendingAction: null,
    plantAwarded: false, winner: null,
    startRound, endRound, buy, onKill, onPlant, update, rematch,
  };

  function sync() {
    state.round.number = match.roundNumber;
    state.round.phase = match.phase;
    state.round.timer = match.timer;
    state.round.scoreA = match.score.attack;
    state.round.scoreB = match.score.defend;
  }
  function sidearm(player) {
    player.owned = { Sidearm: { mag: WEAPONS.Sidearm.mag, reserve: WEAPONS.Sidearm.reserve } };
    player.weapon = { name: 'Sidearm', mag: WEAPONS.Sidearm.mag, reserve: WEAPONS.Sidearm.reserve };
  }
  function equip(actor, name) {
    const def = WEAPONS[name];
    actor.owned[name] = { mag: def.mag, reserve: def.reserve };
    if (actor.weapon.name === name) {
      // switchTo intentionally preserves ammo when the same weapon is selected.
      actor.weapon.mag = def.mag; actor.weapon.reserve = def.reserve;
      actor.reloading = false; actor.reloadTime = 0;
    } else state.weapons.switchTo(actor, name);
  }
  function startRound() {
    if (match.roundNumber >= 9 || match.score.attack >= 5 || match.score.defend >= 5) return false;
    match.roundNumber++;
    const player = state.player;
    if (!player.alive || player.hp <= 0) sidearm(player);
    else if (player.owned[player.weapon.name]) {
      player.owned[player.weapon.name].mag = player.weapon.mag;
      player.owned[player.weapon.name].reserve = player.weapon.reserve;
    }
    player.pos.copy(state.world.spawns.attack[0]); player.pos.y = 0;
    player.hp = 100; player.alive = true; player.crouched = false;
    // Armor bought in N protects N, and expires only on the start of N+1.
    player.armor = false; player.armorRound = 0;
    player.yaw = -Math.PI / 2; player.pitch = 0;
    player.vel.set(0, 0, 0);
    player.noise = player.gunNoise = player.gunNoiseUntil = 0;
    player.cooldown = player.reloadTime = player.bloom = player.stillTime = 0;
    player.reloading = false; player._weaponRef = null;
    player.damageFlash = 0; player.damageDirection = 0;
    player.lastDamageTime = -Infinity; player.killer = null; player.deathHeadshot = false;
    player.deathReported = false;
    resetBots(state);
    assignRoundPlan(state);
    if (match.roundNumber > 1) {
      for (const bot of state.bots) {
        equip(bot, bot.team === match.previousWinner ? 'Longshot' : 'Rasp');
        if (bot.team === 'defend') bot.owned.Frag = { mag: 1, reserve: 0 };
      }
    }
    state.bomb.status = 'idle'; state.bomb.site = null; state.bomb.timer = 0;
    state.bomb.plantProgress = state.bomb.defuseProgress = 0;
    state.bomb.plantActor = state.bomb.defuseActor = null;
    state.grenades.length = 0;
    if (state.grenadeDanger) {
      state.grenadeDanger.radius = 0; state.grenadeDanger.until = 0;
    }
    match.phase = 'buy'; match.timer = 15;
    match.plantAwarded = false; match.pendingAction = null; match.winner = null;
    state.round.reason = '';
    sync();
    state.bomb.update(0);
    player.update?.(0, state);
    state.hud?.hideOverlay();
    return true;
  }
  function buy(player, itemName) {
    if (match.phase !== 'buy' || player !== state.player || !player.alive) return false;
    const def = WEAPONS[itemName];
    const price = itemName === 'Armor' ? 650 : def?.price;
    if (price === undefined || match.economy.money < price ||
        (itemName === 'Armor' && player.armor)) return false;
    match.economy.money -= price;
    if (itemName === 'Armor') {
      player.armor = true; player.armorRound = match.roundNumber;
    } else if (itemName === 'Frag') {
      const stock = player.owned.Frag;
      const count = typeof stock === 'number' ? stock : (stock?.mag || 0) + (stock?.reserve || 0);
      player.owned.Frag = count + 1;
    } else equip(player, itemName);
    state.audio?.buy();
    return true;
  }
  function onKill(killer) {
    if (killer === state.player && (match.phase === 'live' || match.phase === 'planted'))
      match.economy.money += 300;
  }
  function onPlant() {
    if (match.plantAwarded) return;
    match.plantAwarded = true;
    match.economy.money += 300;
  }
  function alive(team) {
    let count = state.player.alive && state.player.hp > 0 && state.player.team === team ? 1 : 0;
    for (const bot of state.bots) if (bot.alive && bot.hp > 0 && bot.team === team) count++;
    return count;
  }
  function endRound(reason) {
    if (match.phase !== 'live' && match.phase !== 'planted') return false;
    let winner;
    switch (reason) {
      case 'Bomb detonated': winner = 'attack'; break;
      case 'Defused': case 'Time expired': winner = 'defend'; break;
      case 'Team eliminated': winner = alive('attack') > 0 ? 'attack' : 'defend'; break;
      default: return false;
    }
    match.score[winner]++;
    match.previousWinner = match.winner = winner;
    if (winner === state.player.team) {
      match.economy.money += 3000; match.economy.lossStreak = 0;
      state.audio?.roundWin();
    } else {
      const streak = match.economy.lossStreak;
      match.economy.money += streak === 0 ? 1400 : streak === 1 ? 1900 : 2400;
      match.economy.lossStreak++;
      state.audio?.roundLose();
    }
    match.phase = 'over'; match.timer = 4;
    match.pendingAction = match.score.attack >= 5 || match.score.defend >= 5 ||
      match.roundNumber >= 9 ? 'match' : 'round';
    state.round.reason = reason;
    sync();
    state.hud?.showOverlay('round', { winner, reason, score: match.score });
    return true;
  }
  function update(dt) {
    dt = Math.max(0, dt);
    if (match.phase === 'buy') {
      match.timer = Math.max(0, match.timer - dt);
      if (match.timer <= 1e-9) {
        match.phase = 'live'; match.timer = 100;
        state.hud?.hideOverlay();
      }
    } else if (match.phase === 'live') {
      match.timer = Math.max(0, match.timer - dt);
      if (state.bomb.status === 'planted') {
        match.phase = 'planted'; match.timer = state.bomb.timer;
        onPlant();
      } else if (!alive('attack') || !alive('defend')) endRound('Team eliminated');
      else if (match.timer <= 1e-9) endRound('Time expired');
    } else if (match.phase === 'planted') {
      match.timer = state.bomb.timer;
      if (state.bomb.status === 'defused') endRound('Defused');
      else if (state.bomb.status === 'detonated') endRound('Bomb detonated');
    } else if (Number.isFinite(match.timer)) {
      match.timer = Math.max(0, match.timer - dt);
      if (match.timer <= 1e-9 && match.pendingAction) {
        if (match.pendingAction === 'match') {
          match.winner = match.score.attack > match.score.defend ? 'attack' : 'defend';
          match.timer = Infinity; match.pendingAction = null;
          state.hud?.showOverlay('match', { winner: match.winner, score: match.score });
        } else startRound();
      }
    }
    sync();
  }
  function rematch() {
    match.score.attack = match.score.defend = 0;
    match.roundNumber = 0; match.previousWinner = null; match.pendingAction = null;
    match.economy.lossStreak = 0; match.economy.money = 800;
    sidearm(state.player);
    return startRound();
  }
  sync();
  return match;
}
