// Linear-compatible hex inputs for THREE.Color; site colors also suit DOM UI.
export const PALETTE = Object.freeze({
  duskOrange: 0xe58c58,
  teal: 0x397d83,
  siteA: 0xffb449,
  siteB: 0x50e3ed,
  fog: 0x344951,
  sky: 0x253943,
  sun: 0xffb783,
  hemisphereSky: 0x8faeb9,
  hemisphereGround: 0x4b3931,
  ground: 0x414846,
  crate: 0x927155,
  container: 0x356d73,
  containerRust: 0x995d43,
  rail: 0x778588,
  ballast: 0x545957,
  warehouse: 0x636662,
  steel: 0x333e43,
  concrete: 0x777c73,
  sparrow: 0x76bab0,
  jackal: 0xdb8058,
  ink: 0xf0ece1,
  muted: 0x9aaeb4,
});

export const FOG = Object.freeze({ color: PALETTE.fog, near: 18, far: 82 });
export const SKY = PALETTE.sky;
