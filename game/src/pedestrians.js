// NEON PALMS — pedestrians. Palmera locals stroll the sidewalks and the
// beach promenade; they scatter when a car comes fast or the player is
// wanted nearby. Simple two-state walkers with a little procedural bounce.

import * as THREE from 'three';
import { collideCircle, dist2D, clamp } from './random.js';

const SHIRTS = [0xff6b6b, 0xffd93d, 0x6bcbff, 0x95e06c, 0xff9ff3, 0xf2f2f2, 0xffa502, 0x1dd1a1];
const SKINS = [0xc98a5e, 0x8a5a34, 0xe8b088, 0x6e4423, 0xf0c8a0];

function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), shirt);
  torso.position.y = 1.02;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
  head.position.y = 1.52;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2),
    new THREE.MeshLambertMaterial({ color: 0x39415a }));
  legL.position.set(-0.12, 0.35, 0);
  const legR = legL.clone(); legR.position.x = 0.12;
  g.add(legL, legR);
  g.userData = { legL, legR };
  return g;
}

export class Pedestrian {
  constructor(scene, rng, centers) {
    this.mesh = makePedMesh(rng);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.rng = rng;
    this.centers = centers;
    this.speed = rng.range(1.1, 2.0);
    this.phase = rng.range(0, 6);
    this.fleeing = 0;
    this.respawn();
  }

  respawn() {
    const rng = this.rng;
    // Walk along a random road's sidewalk, or along the beach.
    if (rng.chance(0.25)) {
      this.pos.set(rng.range(-260, 260), 0, 276 + rng.range(-2, 8));
      this.axis = 'x';
      this.fixed = this.pos.z;
      this.dir = rng.chance(0.5) ? 1 : -1;
    } else {
      const c = rng.pick(this.centers);
      this.axis = rng.chance(0.5) ? 'x' : 'z';
      this.fixed = c + (rng.chance(0.5) ? 8.6 : -8.6);
      this.dir = rng.chance(0.5) ? 1 : -1;
      if (this.axis === 'x') this.pos.set(rng.range(-260, 260), 0, this.fixed);
      else this.pos.set(this.fixed, 0, rng.range(-260, 260));
    }
    this.heading = this.axis === 'x' ? (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (this.dir > 0 ? Math.PI : 0);
  }

  update(dt, ctx) {
    this.phase += dt * (this.fleeing > 0 ? 14 : 8);
    // Danger check: fast car or wanted player close by -> flee sideways.
    const focus = ctx.focusPos;
    let fleeX = 0, fleeZ = 0;
    if (focus) {
      const d = dist2D(this.pos.x, this.pos.z, focus.x, focus.z);
      const danger = (ctx.focusSpeed > 7 && d < 8) || (ctx.wanted > 0 && d < 5);
      if (danger) {
        this.fleeing = 0.9;
        fleeX = this.pos.x - focus.x;
        fleeZ = this.pos.z - focus.z;
        const l = Math.hypot(fleeX, fleeZ) || 1;
        fleeX /= l; fleeZ /= l;
      }
    }
    if (this.fleeing > 0) {
      this.fleeing -= dt;
      const sp = 5.2;
      this.pos.x += fleeX * sp * dt;
      this.pos.z += fleeZ * sp * dt;
      this.heading = Math.atan2(-fleeX, -fleeZ);
    } else {
      // Stroll along the sidewalk line; turn around at the map edge.
      if (this.axis === 'x') {
        this.pos.x += this.dir * this.speed * dt;
        if (Math.abs(this.pos.x) > 272) { this.dir *= -1; }
        this.pos.z += (this.fixed - this.pos.z) * dt * 3;
      } else {
        this.pos.z += this.dir * this.speed * dt;
        if (Math.abs(this.pos.z) > 272) { this.dir *= -1; }
        this.pos.x += (this.fixed - this.pos.x) * dt * 3;
      }
      this.heading = this.axis === 'x'
        ? (this.dir > 0 ? -Math.PI / 2 : Math.PI / 2)
        : (this.dir > 0 ? Math.PI : 0);
      // Occasionally pause to enjoy the sunset.
      if (this.rng.chance(0.0015)) this.fleeing = -2; // negative = idle pause timer reuse
    }
    if (this.fleeing < 0) {
      this.fleeing += dt;
      if (this.fleeing >= 0) this.fleeing = 0;
    }
    this.pos.x = clamp(this.pos.x, -290, 290);
    this.pos.z = clamp(this.pos.z, -290, 300);
    collideCircle(this.pos, 0.4, ctx.colliders);
    const s = Math.sin(this.phase) * 0.5;
    this.mesh.userData.legL.rotation.x = s;
    this.mesh.userData.legR.rotation.x = -s;
    this.mesh.position.y = Math.abs(Math.sin(this.phase)) * 0.04;
    this.mesh.rotation.y = this.heading;
  }
}

export function createPedestrians(scene, rng, centers, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(new Pedestrian(scene, rng, centers));
  return out;
}
