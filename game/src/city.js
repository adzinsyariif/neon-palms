// NEON PALMS — city builder for Palmera.
// Builds the whole static world into a three.js scene: sunset sky dome,
// sea, beach, pier, the 10x10 road grid, instanced buildings with
// canvas-generated lit-window facades, palm trees, streetlights,
// sidewalks and road markings. Returns the data gameplay needs:
// building colliders, the lane network and named places.

import * as THREE from 'three';
import { WORLD, PALETTE, CAFE, roadCenters } from './config.js';
import { clamp } from './random.js';

// ---------- canvas facade textures ----------
// Each facade is drawn once on a small canvas: a tinted wall, a grid of
// windows, most dark, some warmly lit. A handful of variants is enough
// for a whole skyline when combined with per-instance colour.
function makeFacadeTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  const cols = 4, rows = 10, ww = 9, wh = 7, gx = 5, gy = 5;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? (rng.chance(0.7) ? '#ffd98a' : '#bfe8ff') : '#232a38';
      g.fillRect(6 + x * (ww + gx), 8 + y * (wh + gy), ww, wh);
    }
  }
  // Ground floor: darker band with a doorway glow.
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 116, 64, 12);
  g.fillStyle = '#ffca7a'; g.fillRect(27, 118, 10, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#274a7d');
  grad.addColorStop(0.45, '#7a4a72');
  grad.addColorStop(0.72, '#e2703a');
  grad.addColorStop(0.92, '#ffc46b');
  grad.addColorStop(1, '#ffe3a1');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSandTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8c98a'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(190,155,90,0.35)' : 'rgba(255,240,200,0.35)';
    g.fillRect(rng.int(0, 127), rng.int(0, 127), 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- small builders ----------

function box(w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...opts }),
  );
  m.position.set(x, y, z);
  return m;
}

// A café sign: coloured box + emissive lettering plane (canvas text).
function makeCafeSign() {
  const group = new THREE.Group();
  const board = box(16, 3, 0.6, 0x0d5a6e, 0, 0, 0);
  group.add(board);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0d5a6e'; g.fillRect(0, 0, 512, 96);
  g.font = 'bold 58px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#7df3ff';
  g.shadowColor = '#37e6ff'; g.shadowBlur = 18;
  g.fillText('CAFÉ AZUL', 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(15.6, 2.9),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  face.position.z = 0.32;
  group.add(face);
  return group;
}

// ---------- the city ----------

export function buildCity(scene, rng) {
  const colliders = [];
  const centers = roadCenters();
  const half = WORLD.half;

  // Sky: a big inverted sphere with the sunset gradient.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Sun disc low over the sea (south, +z).
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
  );
  sunDisc.position.set(120, 66, 860);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);

  scene.fog = new THREE.Fog(PALETTE.fog, 190, 780);

  // Lights: warm low sun from the south-west + soft ambient + hemisphere.
  const sun = new THREE.DirectionalLight(PALETTE.sun, PALETTE.sunIntensity);
  sun.position.set(-160, 190, 320);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.55));
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2a4a5e, 0.5);
  scene.add(hemi);

  // Ground base (under everything): warm pavement tone.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 160, half * 2 + 160),
    new THREE.MeshLambertMaterial({ color: 0x8f8a80 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // --- roads: one dark plane per road strip + dashed centre lines ---
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  const dashGeoH = new THREE.BoxGeometry(4.5, 0.02, 0.35);
  const dashGeoV = new THREE.BoxGeometry(0.35, 0.02, 4.5);
  const dashes = [];
  for (const c of centers) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + WORLD.road, WORLD.road), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.01, c); scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.road, half * 2 + WORLD.road), roadMat);
    v.rotation.x = -Math.PI / 2; v.position.set(c, 0.011, 0); scene.add(v);
    for (let t = -half + 8; t < half; t += 11) {
      dashes.push([t, c, true]);
      dashes.push([c, t, false]);
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeoH, lineMat, dashes.length);
  const dummy = new THREE.Object3D();
  dashes.forEach(([x, z, horiz], i) => {
    dummy.position.set(x, 0.03, z);
    dummy.rotation.set(0, horiz ? 0 : Math.PI / 2, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashMesh.setMatrixAt(i, dummy.matrix);
  });
  // Reuse geometry trick: rotate instance instead of a second geometry.
  scene.add(dashMesh);
  void dashGeoV;

  // --- sidewalks + blocks + buildings (instanced) ---
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const facadeTex = [
    makeFacadeTexture(rng, '#c96f4a', 0.42),
    makeFacadeTexture(rng, '#7a8ba0', 0.36),
    makeFacadeTexture(rng, '#d9b380', 0.48),
    makeFacadeTexture(rng, '#5e7d8c', 0.33),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4038 });

  // Collect building transforms first so we can instance them per texture.
  const perTex = facadeTex.map(() => []);
  const buildingPalette = [0xffffff, 0xffe3c2, 0xd8ecff, 0xffd2b8, 0xe8e8e8, 0xcfe8d8];
  for (let bx = 0; bx < WORLD.grid; bx++) {
    for (let bz = 0; bz < WORLD.grid; bz++) {
      const cx = -half + WORLD.road / 2 + WORLD.block / 2 + bx * WORLD.pitch;
      const cz = -half + WORLD.road / 2 + WORLD.block / 2 + bz * WORLD.pitch;
      // Sidewalk slab for the whole block.
      const slab = new THREE.Mesh(new THREE.BoxGeometry(WORLD.block + 3, 0.24, WORLD.block + 3), walkMat);
      slab.position.set(cx, 0.12, cz);
      scene.add(slab);
      // Café block (south-east, near beach) gets the café instead of towers.
      const isCafeBlock = Math.abs(cx - 216) < 30 && Math.abs(cz - 216) < 30;
      if (isCafeBlock) continue;
      // 1–4 buildings per block.
      const layout = rng.pick([[1, 1], [2, 1], [1, 2], [2, 2]]);
      const [nx, nz] = layout;
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          const w = (WORLD.block / nx) - 5;
          const d = (WORLD.block / nz) - 5;
          const distC = Math.hypot(cx, cz);
          const tall = clamp(46 - distC * 0.055, 10, 46);
          const h = rng.range(9, tall) * rng.range(0.8, 1.25);
          const x = cx + (ix - (nx - 1) / 2) * (WORLD.block / nx);
          const z = cz + (iz - (nz - 1) / 2) * (WORLD.block / nz);
          const ti = rng.int(0, facadeTex.length - 1);
          perTex[ti].push({ x, z, w, d, h, color: rng.pick(buildingPalette) });
          colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        }
      }
    }
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  for (let ti = 0; ti < facadeTex.length; ti++) {
    const list = perTex[ti];
    if (!list.length) continue;
    const mat = new THREE.MeshLambertMaterial({ map: facadeTex[ti] });
    const mesh = new THREE.InstancedMesh(unitBox, mat, list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2 + 0.24, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(b.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    // Flat roofs as a second instanced mesh sharing transforms.
    const roofs = new THREE.InstancedMesh(unitBox, roofMat, list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.h + 0.3, b.z);
      dummy.scale.set(b.w + 0.3, 0.14, b.d + 0.3);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
    });
    roofs.instanceMatrix.needsUpdate = true;
    scene.add(roofs);
  }

  // --- Café Azul building: low, teal, with the glowing sign ---
  const cafeGroup = new THREE.Group();
  const cafeBody = box(30, 8, 20, 0x2a7d8c, 0, 4.24, 0);
  cafeGroup.add(cafeBody);
  const cafeRoof = box(32, 1, 22, 0xe2703a, 0, 8.7, 0);
  cafeGroup.add(cafeRoof);
  const sign = makeCafeSign();
  sign.position.set(0, 6.4, -10.4);
  sign.rotation.y = Math.PI; // face north, toward the city
  cafeGroup.add(sign);
  // Awning stripes facing the coast road (south side).
  for (let i = 0; i < 6; i++) {
    const stripe = box(4.6, 0.3, 5, i % 2 ? 0xffffff : 0xe23a3a, -12.5 + i * 5, 3.4, 12);
    stripe.rotation.x = 0.5;
    cafeGroup.add(stripe);
  }
  cafeGroup.position.set(CAFE.x, 0, CAFE.z);
  scene.add(cafeGroup);
  colliders.push({ minX: CAFE.x - 15, maxX: CAFE.x + 15, minZ: CAFE.z - 10, maxZ: CAFE.z + 10 });

  // --- beach + sea + pier (south edge) ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 200, WORLD.seaZ - WORLD.beachZ + 26),
    new THREE.MeshLambertMaterial({ map: makeSandTexture(rng) }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (WORLD.beachZ + WORLD.seaZ) / 2 + 4);
  scene.add(sand);

  const seaMat = new THREE.MeshPhongMaterial({
    color: PALETTE.sea, shininess: 120, specular: 0xffc46b, transparent: true, opacity: 0.94,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, WORLD.seaEnd - WORLD.seaZ), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.16, (WORLD.seaZ + WORLD.seaEnd) / 2);
  sea.name = 'sea';
  scene.add(sea);

  // Pier: wooden deck on posts running south, with lamps and a rail.
  const pier = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a7448 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.7, WORLD.pierEndZ - WORLD.beachZ + 16), deckMat);
  deck.position.set(0, 1.1, (WORLD.beachZ + WORLD.pierEndZ) / 2 - 4);
  pier.add(deck);
  const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6e5232 });
  for (let z = WORLD.beachZ; z < WORLD.pierEndZ; z += 12) {
    for (const sx of [-3.8, 3.8]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(sx, 0, z);
      pier.add(p);
    }
  }
  const railMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d4 });
  for (const sx of [-4.4, 4.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, WORLD.pierEndZ - WORLD.beachZ + 14), railMat);
    rail.position.set(sx, 2.2, (WORLD.beachZ + WORLD.pierEndZ) / 2 - 4);
    pier.add(rail);
  }
  // Ferry hut at the pier tip.
  const hut = box(7, 3.6, 6, 0xf2e3c2, 0, 3.2, WORLD.pierEndZ - 4);
  pier.add(hut);
  const hutRoof = box(8, 0.5, 7, 0xe23a3a, 0, 5.2, WORLD.pierEndZ - 4);
  pier.add(hutRoof);
  pier.position.x = WORLD.pierX;
  scene.add(pier);
  // Keep the player on the deck: invisible side rails as colliders.
  colliders.push({ minX: WORLD.pierX - 30, maxX: WORLD.pierX - 4.6, minZ: WORLD.beachZ, maxZ: WORLD.pierEndZ });
  colliders.push({ minX: WORLD.pierX + 4.6, maxX: WORLD.pierX + 30, minZ: WORLD.beachZ, maxZ: WORLD.pierEndZ });

  // --- palm trees (instanced trunks + fronds) along roads & beach ---
  const palmSpots = [];
  for (const c of centers) {
    for (let t = -half + 14; t < half; t += 27) {
      if (rng.chance(0.55)) palmSpots.push([c + WORLD.road / 2 + 2.6, t + rng.range(-3, 3)]);
      if (rng.chance(0.4)) palmSpots.push([t + rng.range(-3, 3), c - WORLD.road / 2 - 2.6]);
    }
  }
  for (let x = -half + 10; x < half; x += 16) {
    if (rng.chance(0.8) && Math.abs(x - WORLD.pierX) > 12) palmSpots.push([x, WORLD.beachZ + rng.range(2, 12)]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  trunkGeo.translate(0, 3.2, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }), palmSpots.length);
  const frondGeo = new THREE.ConeGeometry(3.1, 1.5, 7);
  frondGeo.translate(0, 6.9, 0);
  const frondMesh = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf }), palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    const lean = rng.range(-0.07, 0.07);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(lean, rng.range(0, Math.PI * 2), lean);
    const s = rng.range(0.85, 1.25);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(i, dummy.matrix);
    frondMesh.setMatrixAt(i, dummy.matrix);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  frondMesh.instanceMatrix.needsUpdate = true;
  scene.add(trunkMesh); scene.add(frondMesh);

  // --- streetlights (instanced poles + glowing heads) ---
  const lampSpots = [];
  for (const cx of centers) for (const cz of centers) {
    lampSpots.push([cx + 8.4, cz + 8.4], [cx - 8.4, cz - 8.4]);
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f46 }), lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.34, 8, 6);
  headGeo.translate(0, 5.7, 0);
  const headMesh = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: PALETTE.lampGlow }), lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
    headMesh.setMatrixAt(i, dummy.matrix);
  });
  poleMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  scene.add(poleMesh); scene.add(headMesh);

  // Lane network for traffic: each road is a loop lane in both directions.
  // A lane is {axis:'x'|'z', fixed, dir, from, to} — cars drive along it
  // and pick a new lane at intersections.
  const lanes = [];
  for (const c of centers) {
    lanes.push({ axis: 'x', fixed: c + 3.4, dir: 1 });
    lanes.push({ axis: 'x', fixed: c - 3.4, dir: -1 });
    lanes.push({ axis: 'z', fixed: c + 3.4, dir: -1 });
    lanes.push({ axis: 'z', fixed: c - 3.4, dir: 1 });
  }

  return {
    colliders,
    lanes,
    centers,
    sea,
    cafePos: { x: CAFE.x, z: CAFE.z - 16 },
    update(dt, t) {
      // Gentle sea shimmer: slide the water plane a touch and breathe opacity.
      sea.position.y = 0.16 + Math.sin(t * 0.7) * 0.03;
      seaMat.opacity = 0.92 + Math.sin(t * 1.3) * 0.03;
    },
  };
}
