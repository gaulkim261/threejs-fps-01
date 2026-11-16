export function createInput() {
  // update() drains events once per render. Fixed steps consume each queue once.
  const input = {
    keys: new Set(), mouseDX: 0, mouseDY: 0,
    attackHeld: false, jumpQueued: false, crouchHeld: false,
    interactHeld: false, buyToggleQueued: false, reloadQueued: false,
    weaponSlotQueued: 0, grenadeQueued: false, update,
  };
  let dx = 0, dy = 0, jump = false, buy = false, reload = false, grenade = false, slot = 0;
  let canvas = null;
  const controls = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight',
    'KeyC', 'KeyE', 'KeyB', 'KeyR', 'KeyG',
    'Digit1', 'Digit2', 'Digit3', 'Digit4',
  ]);

  function held() {
    input.crouchHeld = input.keys.has('ControlLeft') ||
      input.keys.has('ControlRight') || input.keys.has('KeyC');
    input.interactHeld = input.keys.has('KeyE');
  }
  function clear() {
    input.keys.clear();
    input.attackHeld = input.crouchHeld = input.interactHeld = false;
    input.jumpQueued = input.buyToggleQueued = input.reloadQueued = input.grenadeQueued = false;
    input.mouseDX = input.mouseDY = input.weaponSlotQueued = 0;
    dx = dy = slot = 0;
    jump = buy = reload = grenade = false;
  }
  function update() {
    input.mouseDX += dx;
    input.mouseDY += dy;
    input.jumpQueued ||= jump;
    input.buyToggleQueued ||= buy;
    input.reloadQueued ||= reload;
    input.grenadeQueued ||= grenade;
    if (slot) input.weaponSlotQueued = slot;
    dx = dy = slot = 0;
    jump = buy = reload = grenade = false;
    held();
  }
  function typing(target) {
    return target && (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (event.button !== 0 || target.tagName !== 'CANVAS' ||
        document.pointerLockElement === target) return;
    try {
      const request = target.requestPointerLock();
      if (request && request.catch) request.catch(() => {});
    } catch { /* Unsupported pointer lock leaves menu controls usable. */ }
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement;
    canvas = locked && locked.tagName === 'CANVAS' ? locked : null;
    clear();
  });
  document.addEventListener('mousemove', event => {
    if (!canvas || document.pointerLockElement !== canvas) return;
    dx += event.movementX || 0;
    dy += event.movementY || 0;
  });
  document.addEventListener('mousedown', event => {
    if (event.button === 0 && canvas && document.pointerLockElement === canvas)
      input.attackHeld = true;
  });
  document.addEventListener('mouseup', event => {
    if (event.button === 0) input.attackHeld = false;
  });
  document.addEventListener('keydown', event => {
    if (typing(event.target) || event.metaKey || !controls.has(event.code)) return;
    event.preventDefault();
    const fresh = !event.repeat && !input.keys.has(event.code);
    input.keys.add(event.code);
    held();
    if (!fresh) return;
    switch (event.code) {
      case 'Space': jump = true; break;
      case 'KeyB': buy = true; break;
      case 'KeyR': reload = true; break;
      case 'KeyG': grenade = true; break;
      default:
        if (event.code.startsWith('Digit')) slot = Number(event.code[5]);
    }
  });
  document.addEventListener('keyup', event => {
    input.keys.delete(event.code);
    held();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clear();
  });
  window.addEventListener('blur', clear);
  return input;
}
