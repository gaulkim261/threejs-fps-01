export function createHud(state) {
  const root = document.getElementById('hud') || document.body.appendChild(document.createElement('div'));
  root.id = 'hud';
  function element(id, tag = 'div', parent = root) {
    let node = document.getElementById(id);
    if (!node) { node = document.createElement(tag); node.id = id; parent.appendChild(node); }
    return node;
  }
  const health = element('health'), mag = element('ammo-mag'), reserve = element('ammo-reserve');
  const timer = element('timer'), scoreA = element('score-a'), scoreB = element('score-b');
  const money = element('money'), aliveA = element('alive-a'), aliveB = element('alive-b');
  const bombStatus = element('bomb-status'), feed = element('killfeed');
  const crosshair = element('crosshair'), marker = element('hitmarker');
  for (const node of [crosshair, marker]) if (!node.children.length)
    for (let i = 0; i < 4; i++) node.appendChild(document.createElement('i'));
  const buyMenu = element('buy-menu'), buyMoney = element('buy-money', 'div', buyMenu);
  const overlay = element('overlay');
  const panel = overlay.querySelector('.panel') || overlay;
  const title = element('overlay-title', 'h1', panel), copy = element('overlay-copy', 'p', panel);
  const action = element('overlay-action', 'button', panel);
  action.type = 'button';
  const oldPlay = document.getElementById('play');
  if (oldPlay) oldPlay.hidden = true;
  const channel = element('channel'), channelText = element('channel-text', 'div', channel);
  const channelTrack = element('channel-track', 'div', channel);
  const channelFill = element('channel-fill', 'div', channelTrack);
  const damage = element('damage-cue'), direction = element('damage-direction');
  const style = document.createElement('style');
  style.textContent = `
    #health {position:fixed;bottom:65px;left:32px;font:bold 24px ui-monospace,monospace}
    #timer {position:fixed;top:23px;left:50%;transform:translateX(-50%);font:bold 28px ui-monospace,monospace}
    #score-a,#score-b {position:fixed;top:24px;font:bold 24px ui-monospace,monospace}
    #score-a {right:calc(50% + 90px);color:#ffb449} #score-b {left:calc(50% + 90px);color:#50e3ed}
    #money {position:fixed;left:32px;bottom:105px;color:#ffb449;font:18px ui-monospace,monospace}
    #alive-a,#alive-b {position:fixed;top:60px;font:12px ui-monospace,monospace}
    #alive-a {right:calc(50% + 70px)} #alive-b {left:calc(50% + 70px)}
    #bomb-status {position:fixed;top:95px;left:50%;transform:translateX(-50%);color:#ffb449;letter-spacing:.1em}
    #killfeed {position:fixed;top:24px;right:24px;display:grid;gap:6px;max-width:350px}
    .kill-line {padding:8px 12px;background:#202d34dc;border-left:2px solid #59b8c3;font:12px ui-monospace,monospace;transition:opacity .2s}
    .kill-line b {color:#ffb449;margin-left:9px;font-size:10px}
    #buy-menu {position:fixed;left:32px;top:110px;width:265px;padding:18px;background:#202d34ed;border:1px solid #65777c;pointer-events:auto}
    #buy-money {margin-bottom:14px;font:bold 15px ui-monospace,monospace;color:#ffb449}
    #buy-menu button {width:100%;margin:5px 0;padding:11px;background:#35474b;color:#f0ece1;border:1px solid #65777c;cursor:pointer;text-align:left}
    #overlay {pointer-events:auto;z-index:20} #overlay-action {font:inherit;padding:12px 18px;background:#ffb449;color:#202d34;border:0;border-radius:4px;cursor:pointer}
    #channel {position:fixed;left:50%;bottom:140px;transform:translateX(-50%);width:280px;text-align:center;letter-spacing:.07em}
    #channel-track {height:6px;background:#203239;margin-top:12px} #channel-fill {height:100%;background:#ffb449;transform-origin:left}
    #crosshair {--gap:0px;width:22px;height:22px} #crosshair i:nth-child(1) {translate:0 calc(-1 * var(--gap))}
    #crosshair i:nth-child(2) {translate:0 var(--gap)} #crosshair i:nth-child(3) {translate:calc(-1 * var(--gap)) 0}
    #crosshair i:nth-child(4) {translate:var(--gap) 0} #hitmarker.kill i {background:#ffcb61}
    #buy-menu[hidden],#channel[hidden],#overlay[hidden] {display:none!important}
    #damage-cue {position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 100px #dc6c45}
    #damage-direction {position:fixed;left:50%;top:50%;width:160px;height:160px;margin:-80px;border-top:5px solid #ff865b;border-radius:50%;pointer-events:none}
  `;
  document.head.appendChild(style);
  const items = [['Longshot', 2900], ['Rasp', 1500], ['Sidearm', 300], ['Frag', 300], ['Armor', 650]];
  const buttons = [];
  for (let i = 0; i < items.length; i++) {
    const [name, price] = items[i];
    let button = buyMenu.querySelector(`[data-item="${name}"]`);
    if (!button) { button = document.createElement('button'); button.dataset.item = name; buyMenu.appendChild(button); }
    button.type = 'button';
    button.textContent = `${i < 4 ? i + 1 + '  ' : ''}${name}   $${price}`;
    button.addEventListener('click', () => { state.match.buy(state.player, name); update(state); });
    buttons.push(button);
  }
  let overlayKind = 'start';
  action.addEventListener('click', () => {
    if (overlayKind === 'start') state.onPlay?.();
    else if (overlayKind === 'match') {
      if (state.onRematch) state.onRematch(); else { state.match.rematch(); hideOverlay(); }
    } else if (overlayKind === 'pause') state.onResume?.();
    else if (state.onNextRound) state.onNextRound();
    else { state.match.update(state.match.timer); hideOverlay(); }
  });
  function clock(seconds) {
    const n = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  }
  function name(shooter) { return typeof shooter === 'string' ? shooter : shooter?.isBot ? shooter.name : 'You'; }
  function killfeed(killer, victim, headshot) {
    const line = document.createElement('div'); line.className = 'kill-line';
    line.textContent = `${name(killer)} ▸ ${name(victim)}`;
    line.dataset.time = String(state.time);
    if (headshot) { const badge = document.createElement('b'); badge.textContent = 'HEADSHOT'; line.appendChild(badge); }
    feed.prepend(line);
    while (feed.children.length > 5) feed.lastElementChild.remove();
  }
  function update(s) {
    const player = s.player, phase = s.round.phase;
    health.textContent = `${Math.ceil(player.hp)} HP${player.armor ? ' + ARMOR' : ''}`;
    mag.textContent = String(player.weapon.mag); reserve.textContent = `/ ${player.weapon.reserve}`;
    timer.textContent = clock(phase === 'planted' ? s.bomb.timer : s.round.timer);
    const score = s.match?.score || s.round.score;
    scoreA.textContent = String(score?.attack || 0); scoreB.textContent = String(score?.defend || 0);
    money.textContent = `$${s.economy.money}`;
    let a = player.alive && player.team === 'attack' ? 1 : 0;
    let b = player.alive && player.team === 'defend' ? 1 : 0;
    for (const bot of s.bots) if (bot.alive) { if (bot.team === 'attack') a++; else b++; }
    aliveA.textContent = `SPARROWS ${a}/5`; aliveB.textContent = `JACKALS ${b}/5`;
    bombStatus.textContent = s.bomb.status === 'idle' ? '—' : s.bomb.status === 'planted' ?
      `PLANTED ${clock(s.bomb.timer)}` : s.bomb.status.toUpperCase();
    crosshair.style.setProperty('--gap', `${Math.min(24, player.spread * 260)}px`);
    const hit = s.lastHit, fresh = hit && s.time - hit.time >= 0 && s.time - hit.time < 0.12;
    marker.classList.toggle('on', !!fresh); marker.classList.toggle('kill', !!(fresh && hit.killed));
    marker.style.opacity = fresh ? '1' : '0';
    marker.style.transform = `translate(-50%, -50%) rotate(45deg) scale(${fresh && hit.killed ? 1.35 : 1})`;
    const flash = Math.min(0.65, (player.damageFlash || 0) * 1.8);
    damage.style.opacity = direction.style.opacity = String(flash);
    direction.style.transform = `rotate(${player.damageDirection || 0}rad)`;
    buyMenu.hidden = phase !== 'buy' || s.buyOpen === false || s.match.roundNumber === 0;
    buyMoney.textContent = `BUY PHASE  ·  $${s.economy.money}`;
    for (let i = 0; i < buttons.length; i++) buttons[i].disabled = s.economy.money < items[i][1];
    const defusing = s.bomb.status === 'planted' && s.bomb.defuseProgress > 0;
    const progress = defusing ? s.bomb.defuseProgress : s.bomb.status === 'idle' ? s.bomb.plantProgress : 0;
    channel.hidden = progress <= 0;
    channelText.textContent = `${defusing ? 'DEFUSING' : 'PLANTING'}  ${Math.round(progress * 100)}%`;
    channelFill.style.transform = `scaleX(${progress})`;
    for (let i = feed.children.length - 1; i >= 0; i--) {
      const line = feed.children[i], age = s.time - Number(line.dataset.time);
      if (age >= 6.3) line.remove(); else line.style.opacity = age > 6 ? '0' : '1';
    }
  }
  function showOverlay(kind, data = {}) {
    overlayKind = kind; overlay.hidden = false; overlay.dataset.kind = kind;
    const score = data.score || state.match.score;
    const won = data.winner === state.player.team;
    if (kind === 'start') {
      title.textContent = 'SCRAPLINE'; copy.textContent = 'Plant the bomb or eliminate the Jackals. First to 5 rounds.';
      action.textContent = 'Click to play';
    } else if (kind === 'pause') {
      title.textContent = 'Paused'; copy.textContent = 'Return to the freight yard.'; action.textContent = 'Resume';
    } else {
      title.textContent = `${kind === 'match' ? 'MATCH' : 'ROUND'} ${won ? 'WON' : 'LOST'}`;
      copy.textContent = `${kind === 'round' ? data.reason + ' · ' : 'Final score · '}${score.attack} — ${score.defend}`;
      action.textContent = kind === 'match' ? 'Rematch' : 'Next round';
    }
  }
  function hideOverlay() { overlay.hidden = true; }
  update(state);
  return { update, killfeed, showOverlay, hideOverlay };
}
