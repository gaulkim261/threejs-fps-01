import * as THREE from 'three';
import { PALETTE, FOG } from './palette.js';

// Every structural prop is described here: [x, z, width, height, depth, type].
// Warehouse and tunnel entries expand into hollow shells, never filled boxes.
// A-long is the open z=0 freight apron (-25 to +14, 39 m); the west
// warehouse's east-facing doorway is reached through its northern apron.
const SPECS = [
  [-27, 0, 0.8, 4, 40.8, 'wall'],
  [28, 0, 0.8, 4, 40.8, 'wall'],
  [0.5, -20, 55.8, 4, 0.8, 'wall'],
  [0.5, 20, 55.8, 4, 0.8, 'wall'],
  [-20, -10, 12, 8, 10, 'warehouse'],
  [0, 16, 20, 3, 4, 'wall'], // Roofed connector, open at both x ends.
  [0, 16, 19.8, 0.22, 0.22, 'pipe'], // Ceiling service pipe.
  [17.8, 3.7, 6, 5.2, 2.6, 'container'],
  [23.8, 3.7, 6, 5.2, 2.6, 'container'],
  [25.5, 8, 2.6, 5.2, 6, 'container'],
  [-13.71, -10, 2.05, 3, 0.12, 'letter'],
  [14.7, 3.7, 2.05, 3, 0.12, 'letter'],
  [-0.72, 0, 0.1, 0.08, 36, 'rail'],
  [0.72, 0, 0.1, 0.08, 36, 'rail'],
  [3.1, 6.8, 0.65, 1.05, 4.6, 'wall'],
  [-3.2, -9.6, 0.65, 1.05, 4, 'wall'],
  [-19, 4.6, 2, 1, 1, 'crate'],
  [-10.4, 3.4, 1, 1, 1, 'crate'],
  [8.7, -3.6, 2, 1, 1, 'crate'],
  [-10.8, -15.8, 2, 1, 1, 'crate'],
  [-6.8, -5.4, 1, 1, 1, 'crate'],
  [-23.4, -13.3, 2, 1, 1, 'crate'],
  [17.3, 11.2, 2, 1, 1, 'crate'],
  [23.4, 13.4, 1, 1, 1, 'crate'],
  [11.5, 7.8, 2, 1, 1, 'crate'],
  [-6.2, 6.5, 1, 1, 1, 'crate'],
  [6.4, -12.4, 2, 1, 1, 'crate'],
  [-16.8, 7.4, 0.72, 1.05, 0.72, 'barrel'],
  [-16, 7.5, 0.72, 1.05, 0.72, 'barrel'],
  [-10.8, -6.5, 0.72, 1.05, 0.72, 'barrel'],
  [11.1, -9, 0.72, 1.05, 0.72, 'barrel'],
  [14.6, 12, 0.72, 1.05, 0.72, 'barrel'],
  [4.3, 11.3, 0.72, 1.05, 0.72, 'barrel'],
  [-17.4, 10.8, 4.2, 0.6, 0.6, 'pipe'],
  [8.5, -16.2, 4.8, 0.6, 0.6, 'pipe'],
];

export function buildWorld(scene) {
  const colliders = [];
  const yard = new THREE.Group();
  yard.name = 'Scrapline Yard';
  scene.add(yard);
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(FOG.color, FOG.near, FOG.far);

  const hemi = new THREE.HemisphereLight(
    PALETTE.hemisphereSky, PALETTE.hemisphereGround, 1.65,
  );
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-32, 38, -24);
  sun.target.position.set(0.5, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadow = sun.shadow.camera;
  shadow.left = shadow.bottom = -40;
  shadow.right = shadow.top = 40;
  shadow.near = 1;
  shadow.far = 110;
  shadow.updateProjectionMatrix();
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(hemi, sun, sun.target);

  const material = (color, metalness = 0, roughness = 0.85) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const mats = {
    ground: material(PALETTE.ground),
    concrete: material(PALETTE.concrete),
    warehouse: material(PALETTE.warehouse, 0.35),
    steel: material(PALETTE.steel, 0.65, 0.6),
    crate: material(PALETTE.crate),
    wood: material(0x594936),
    container: material(PALETTE.container, 0.4, 0.7),
    rust: material(PALETTE.containerRust, 0.4, 0.8),
    rail: material(PALETTE.rail, 0.8, 0.38),
    ballast: material(PALETTE.ballast),
    paint: material(PALETTE.muted, 0.2),
    amber: new THREE.MeshStandardMaterial({
      color: PALETTE.siteA, emissive: PALETTE.siteA,
      emissiveIntensity: 2.2, roughness: 0.5,
    }),
    cyan: new THREE.MeshStandardMaterial({
      color: PALETTE.siteB, emissive: PALETTE.siteB,
      emissiveIntensity: 2.2, roughness: 0.5,
    }),
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const barrelGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const pipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const ringGeo = new THREE.TorusGeometry(0.49, 0.035, 4, 12);

  function bounds(x, y, z, w, h, d) {
    const collider = {
      min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
    };
    colliders.push(collider);
    return collider;
  }
  function mesh(geometry, mat, x, y, z, w, h, d, solid = false) {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z);
    object.scale.set(w, h, d);
    object.castShadow = solid;
    object.receiveShadow = true;
    object.userData.solid = solid;
    if (solid) object.userData.collider = bounds(x, y, z, w, h, d);
    yard.add(object);
    return object;
  }
  function box(x, y, z, w, h, d, mat, solid = false) {
    return mesh(cube, mat, x, y, z, w, h, d, solid);
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(55.8, 40.8), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0.5, 0, 0);
  ground.receiveShadow = true;
  ground.name = 'yard-ground';
  ground.userData.solid = false;
  yard.add(ground);
  // Flat ballast and freight-lane paint cannot snag a walking actor.
  box(0, 0.008, 0, 2.45, 0.015, 36.5, mats.ballast);
  for (let z = -17.5; z <= 17.5; z += 1.25)
    box(0, 0.012, z, 2.05, 0.024, 0.2, mats.wood);
  for (let x = -24; x <= 12; x += 3) {
    box(x, 0.009, -1.7, 1.35, 0.016, 0.075, mats.paint);
    box(x, 0.009, 1.7, 1.35, 0.016, 0.075, mats.paint);
  }

  function warehouse(x, z, w, h, d) {
    const t = 0.28, east = x + w / 2, west = x - w / 2;
    const north = z - d / 2, south = z + d / 2;
    const door = 4.4, doorHeight = 3.5;
    box(west + t / 2, h / 2, z, t, h, d, mats.warehouse, true);
    box(x, h / 2, north + t / 2, w, h, t, mats.warehouse, true);
    box(x, h / 2, south - t / 2, w, h, t, mats.warehouse, true);
    const wing = (d - door) / 2;
    box(east - t / 2, h / 2, north + wing / 2, t, h, wing,
      mats.warehouse, true);
    box(east - t / 2, h / 2, south - wing / 2, t, h, wing,
      mats.warehouse, true);
    box(east - t / 2, doorHeight + (h - doorHeight) / 2, z,
      t, h - doorHeight, door, mats.warehouse, true);
    box(x, h + 0.14, z, w + 0.4, 0.28, d + 0.4, mats.steel, true);
    // Columns and corrugated ribs give the warehouse a distinct tall silhouette.
    for (let xx = west + 1; xx < east; xx += 1.5) {
      box(xx, h / 2, north - 0.035, 0.06, h, 0.07, mats.steel);
      box(xx, h / 2, south + 0.035, 0.06, h, 0.07, mats.steel);
    }
    for (const zz of [north + 0.16, south - 0.16]) {
      box(east + 0.035, h / 2, zz, 0.1, h, 0.18, mats.steel);
    }
    box(east + 0.035, doorHeight, z, 0.1, 0.16, door + 0.2, mats.amber);
    box(east + 0.035, 1.75, z - door / 2, 0.1, 3.5, 0.09, mats.amber);
    box(east + 0.035, 1.75, z + door / 2, 0.1, 3.5, 0.09, mats.amber);
    box(x, 0.015, z, w - 0.6, 0.025, d - 0.6, mats.concrete);
    box(x, h - 0.45, z, 8, 0.06, 0.12, mats.amber);
    // Dock apron is flush, preserving the doorway's full walkable width.
    box(east + 1.15, 0.012, z, 2.3, 0.02, door + 0.6, mats.concrete);
  }

  function tunnel(x, z, w, h, d) {
    const t = 0.25;
    // Three-metre cross openings let the mid rail route pass under the roof.
    const wing = (w - 3) / 2;
    for (const side of [-1, 1]) {
      for (const edge of [-1, 1])
        box(x + side * (1.5 + wing / 2), h / 2,
          z + edge * (d / 2 - t / 2), wing, h, t, mats.concrete, true);
    }
    box(x, h + 0.15, z, w + 0.2, 0.3, d, mats.steel, true);
    for (let xx = x - w / 2; xx <= x + w / 2; xx += 4) {
      box(xx, h - 0.08, z, 0.14, 0.16, d - 0.5, mats.steel);
      box(xx, 1.5, z - d / 2 + 0.27, 0.14, 3, 0.1, mats.steel);
      box(xx, 1.5, z + d / 2 - 0.27, 0.14, 3, 0.1, mats.steel);
    }
    box(x - w / 2 + 1, h - 0.18, z, 1.6, 0.035, 0.12, mats.amber);
    box(x + w / 2 - 1, h - 0.18, z, 1.6, 0.035, 0.12, mats.cyan);
  }

  function container(x, z, w, h, d) {
    const alongX = w > d;
    const length = alongX ? w : d;
    const layers = Math.round(h / 2.6);
    for (let layer = 0; layer < layers; layer++) {
      const y = layer * 2.6 + 1.3;
      const mat = layer % 2 ? mats.rust : mats.container;
      box(x, y, z, w, 2.6, d, mat, true);
      for (let p = -length / 2 + 0.25; p < length / 2; p += 0.32) {
        if (alongX) {
          box(x + p, y, z - d / 2 - 0.025, 0.055, 2.35, 0.055, mat);
          box(x + p, y, z + d / 2 + 0.025, 0.055, 2.35, 0.055, mat);
        } else {
          box(x - w / 2 - 0.025, y, z + p, 0.055, 2.35, 0.055, mat);
          box(x + w / 2 + 0.025, y, z + p, 0.055, 2.35, 0.055, mat);
        }
      }
      for (const yy of [y - 1.23, y + 1.23]) {
        box(x, yy, z - d / 2 - 0.035, w, 0.1, 0.075, mats.steel);
        box(x, yy, z + d / 2 + 0.035, w, 0.1, 0.075, mats.steel);
        box(x - w / 2 - 0.035, yy, z, 0.075, 0.1, d, mats.steel);
        box(x + w / 2 + 0.035, yy, z, 0.075, 0.1, d, mats.steel);
      }
      // Door latches and small painted identification bars on both ends.
      for (const offset of [-0.55, 0.55]) {
        if (alongX) {
          box(x - w / 2 - 0.04, y, z + offset, 0.07, 2.1, 0.055, mats.rail);
          box(x + w / 2 + 0.04, y, z + offset, 0.07, 2.1, 0.055, mats.rail);
        } else {
          box(x + offset, y, z - d / 2 - 0.04, 0.055, 2.1, 0.07, mats.rail);
          box(x + offset, y, z + d / 2 + 0.04, 0.055, 2.1, 0.07, mats.rail);
        }
      }
      box(x, y + 0.65, z + d / 2 + 0.075,
        Math.min(w * 0.4, 1.3), 0.12, 0.025, mats.paint);
    }
    box(x, h + 0.045, z - d / 2, w, 0.065, 0.065, mats.cyan);
    box(x - w / 2, h + 0.045, z, 0.065, 0.065, d, mats.cyan);
  }

  function crate(x, z, w, h, d) {
    box(x, h / 2, z, w, h, d, mats.crate, true);
    for (const xx of [x - w / 2 + 0.09, x + w / 2 - 0.09]) {
      box(xx, h / 2, z - d / 2 - 0.02, 0.12, h, 0.04, mats.wood);
      box(xx, h / 2, z + d / 2 + 0.02, 0.12, h, 0.04, mats.wood);
      box(xx, h + 0.02, z, 0.12, 0.04, d, mats.wood);
    }
    for (const yy of [0.08, h - 0.08]) {
      box(x, yy, z - d / 2 - 0.025, w, 0.11, 0.05, mats.wood);
      box(x, yy, z + d / 2 + 0.025, w, 0.11, 0.05, mats.wood);
    }
    const brace = box(x, h / 2, z + d / 2 + 0.028,
      Math.hypot(w - 0.22, h - 0.2), 0.09, 0.035, mats.wood);
    brace.rotation.z = Math.atan2(h - 0.2, w - 0.22);
  }

  function barrel(x, z, w, h, d) {
    mesh(barrelGeo, mats.rust, x, h / 2, z, w, h, d, true);
    for (const y of [0.12, h * 0.5, h - 0.12]) {
      const ring = mesh(ringGeo, mats.steel, x, y, z, w, d, w);
      ring.rotation.x = Math.PI / 2;
    }
    box(x + w * 0.16, h + 0.015, z, 0.1, 0.03, 0.1, mats.steel);
  }

  function pipe(x, z, w, h, d) {
    const overhead = h < 0.3;
    const y = overhead ? 2.68 : h / 2;
    const alongX = w >= d;
    const length = alongX ? w : d;
    const radius = alongX ? d : w;
    const object = mesh(pipeGeo, mats.steel, x, y, z, 1, 1, 1);
    object.scale.set(radius, length, h);
    if (alongX) object.rotation.z = Math.PI / 2;
    else object.rotation.x = Math.PI / 2;
    object.castShadow = true;
    object.userData.solid = true;
    object.userData.collider = bounds(x, y, z, w, h, d);
    for (let p = -length / 2 + 0.3; p < length / 2; p += 2) {
      const ring = mesh(ringGeo, mats.rail,
        alongX ? x + p : x, y, alongX ? z : z + p,
        radius, h, radius);
      if (alongX) ring.rotation.y = Math.PI / 2;
      if (overhead)
        box(x + p, 2.9, z, 0.07, 0.22, 0.07, mats.rail);
    }
  }

  function letter(x, z, w, h, d) {
    const isA = x < 0;
    const shape = new THREE.Shape();
    const points = isA
      ? [[-1, -1.5], [-0.35, 1.5], [0.35, 1.5], [1, -1.5],
        [0.46, -1.5], [0.23, -0.45], [-0.23, -0.45], [-0.46, -1.5]]
      : [[-0.9, -1.5], [-0.9, 1.5], [0.35, 1.5], [0.85, 1.1],
        [0.85, 0.4], [0.48, 0.05], [0.95, -0.32], [0.95, -1.05], [0.45, -1.5]];
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const holes = isA
      ? [[[-0.14, 0], [0, 0.82], [0.14, 0]]]
      : [[[-0.35, 0.35], [0.26, 0.35], [0.32, 0.92], [-0.35, 0.92]],
        [[-0.35, -0.98], [0.34, -0.98], [0.34, -0.38], [-0.35, -0.38]]];
    for (const vertices of holes) {
      const hole = new THREE.Path();
      hole.moveTo(vertices[0][0], vertices[0][1]);
      for (let i = 1; i < vertices.length; i++) hole.lineTo(vertices[i][0], vertices[i][1]);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    const glyph = mesh(geometry, isA ? mats.amber : mats.cyan,
      x, isA ? 5.4 : 3.55, z, w / 2, h / 3, 1);
    glyph.rotation.y = isA ? Math.PI / 2 : -Math.PI / 2;
    glyph.name = `site-letter-${isA ? 'A' : 'B'}`;
    // Thin sign backing is decoration, attached to the structural collider.
    box(isA ? x - 0.04 : x + 0.04, glyph.position.y, z,
      0.08, h + 0.3, w + 0.3, mats.steel);
  }

  for (const [x, z, w, h, d, type] of SPECS) {
    switch (type) {
      case 'warehouse': warehouse(x, z, w, h, d); break;
      case 'container': container(x, z, w, h, d); break;
      case 'crate': crate(x, z, w, h, d); break;
      case 'barrel': barrel(x, z, w, h, d); break;
      case 'pipe': pipe(x, z, w, h, d); break;
      case 'letter': letter(x, z, w, h, d); break;
      case 'rail':
        // Buried solid rail bed with a walkable, decorative head above ballast.
        box(x, -h / 2, z, w, h, d, mats.rail, true);
        box(x, 0.035, z, w, 0.035, d, mats.rail); break;
      case 'wall':
        if (w === 20 && h === 3 && d === 4) tunnel(x, z, w, h, d);
        else {
          box(x, h / 2, z, w, h, d, mats.concrete, true);
          box(x, h + 0.045, z, w + 0.08, 0.09, d + 0.08, mats.steel);
          if (h === 4) {
            const alongX = w > d, length = alongX ? w : d;
            for (let p = -length / 2 + 2; p < length / 2; p += 5)
              box(alongX ? x + p : x, h / 2, alongX ? z : z + p,
                alongX ? 0.16 : w + 0.06, h,
                alongX ? d + 0.06 : 0.16, mats.steel);
          }
        }
        break;
    }
  }

  const sites = {
    A: { pos: new THREE.Vector3(-20, 0, -10), letter: 'A' },
    B: { pos: new THREE.Vector3(21, 0, 8), letter: 'B' },
  };
  for (const site of Object.values(sites)) {
    const { x, z } = site.pos;
    const mat = site.letter === 'A' ? mats.amber : mats.cyan;
    for (const offset of [-2, 2]) {
      box(x + offset, 0.035, z, 0.075, 0.035, 4.075, mat);
      box(x, 0.035, z + offset, 4.075, 0.035, 0.075, mat);
    }
    const lamp = new THREE.PointLight(
      site.letter === 'A' ? PALETTE.siteA : PALETTE.siteB, 32, 13, 2,
    );
    lamp.position.set(x, 3.1, z);
    yard.add(lamp);
  }

  // Adjacent navigation nodes have actor-width clearance; all heights are feet.
  const vectors = points => points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const waypoints = {
    A: vectors([[-25, 0], [-20, 0], [-13, 0], [-12, -4],
      [-12, -10], [-16, -10], [-20, -10]]),
    B: vectors([[-25, 0], [-23, 6], [-21, 12], [-12, 12],
      [-12, 16], [-8, 16], [0, 16], [8, 16], [12, 16],
      [17, 15.5], [20.5, 12], [21, 8]]),
    mid: vectors([[-25, 0], [-13, 0], [-5, 0], [0, 0],
      [0, -8], [0, -17], [0, -8], [0, 0], [0, 8], [0, 17]]),
  };
  const spawns = {
    attack: vectors([[-25, -2.2], [-24, -1.1], [-25, 0], [-24, 1.1], [-25, 2.2]]),
    defend: vectors([[-24, -11.7], [-17, -7], [21, 7], [23.5, 12], [2.5, -8]]),
  };
  return { colliders, sites, waypoints, spawns, update(dt) {} };
}
