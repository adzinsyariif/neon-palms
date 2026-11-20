// NEON PALMS — cars: visuals, arcade driving physics, enter/exit, carjacking.
// One Car class serves the player, traffic and police; behaviour differs
// only in who supplies throttle/steer each frame.

import * as THREE from 'three';
import { CAR, PALETTE } from './config.js';
import { clamp, angleLerp, collideCircle } from './random.js';

export const CAR_COLORS = [
  0xe23a3a, 0x2a9df4, 0xffc93c, 0x37d67a, 0xff7ac2, 0xf2f2f2,
  0x8a5cf6, 0xff8c42, 0x2ad4c4, 0xb8bec9,
];

// Build a low-poly car: rounded body, cabin, wheels, lights. Police cars
// get a light bar whose red/blue lamps flash via userData.
export function createCarMesh(color, { police = false } = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? PALETTE.policeBody : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.1), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.34, 0.9), bodyMat);
  nose.position.set(0, 0.42, -2.3);
  group.add(nose);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 2.0),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  cabin.position.set(0, 1.05, 0.25);
  group.add(cabin);
  if (police) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.94, 0.2, 4.14),
      new THREE.MeshLambertMaterial({ color: PALETTE.policeStripe }),
    );
    stripe.position.y = 0.62;
    group.add(stripe);
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.add(base);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.34),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.32, 0.14, 0);
    bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.set(0.32, 0.14, 0);
    bar.add(blue);
    bar.position.set(0, 1.36, 0.25);
    group.add(bar);
    group.userData.lightBar = { red, blue };
  }
  // Headlights + taillights as small emissive boxes.
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.06), hl);
    h.position.set(sx, 0.55, -2.76);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xff3344 }));
    t.position.set(sx, 0.6, 2.06);
    group.add(t);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [sx, sz] of [[-0.95, -1.35], [0.95, -1.35], [-0.95, 1.35], [0.95, 1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(sx, 0.36, sz);
    group.add(w);
    wheels.push(w);
  }
  group.userData.wheels = wheels;
  return group;
}

export class Car {
  constructor(scene, color, opts = {}) {
    this.mesh = createCarMesh(color, opts);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.pos.set(opts.x || 0, 0, opts.z || 0);
    this.heading = opts.heading || 0; // 0 = facing -z (north)
    this.speed = 0;
    this.steerVis = 0;
    this.police = !!opts.police;
    this.occupied = false;
    this.wrecked = false;
    this.flashPhase = Math.random() * Math.PI * 2;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  // Arcade drive step. input: {throttle -1..1, steer -1..1, brake bool}
  drive(dt, input, colliders) {
    const accel = input.throttle > 0 ? CAR.accel : CAR.reverseAccel;
    if (input.brake) {
      this.speed -= Math.sign(this.speed) * CAR.brake * dt;
      if (Math.abs(this.speed) < 0.4) this.speed = 0;
    } else if (input.throttle !== 0) {
      this.speed += input.throttle * accel * dt;
    } else {
      // Rolling drag.
      this.speed -= this.speed * 0.55 * dt;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = clamp(this.speed, -CAR.maxReverse, CAR.maxSpeed);
    // Steering scales with speed and flips in reverse, like a real car.
    const speedFactor = clamp(Math.abs(this.speed) / 6, 0, 1);
    const dir = this.speed >= 0 ? 1 : -1;
    this.heading += input.steer * CAR.turnRate * speedFactor * dir * dt * (1 - Math.abs(this.speed) / (CAR.maxSpeed * 2.6));
    this.steerVis = input.steer;
    const vx = -Math.sin(this.heading) * this.speed;
    const vz = -Math.cos(this.heading) * this.speed;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    // World bounds: keep cars inside Palmera + pier road.
    this.pos.x = clamp(this.pos.x, -292, 292);
    this.pos.z = clamp(this.pos.z, -292, 300);
    // Building collision: circle push-out. If the push-out actually moved
    // the car, that was an impact: bleed speed and flag it so main can
    // play the thud / chip health / count it as a witnessed crime.
    const before = Math.abs(this.speed);
    const px = this.pos.x, pz = this.pos.z;
    collideCircle(this.pos, CAR.radius, colliders);
    const shove = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (shove > 0.04 && before > 3) {
      this.speed *= 0.42;
      this.lastHit = 1;
    }
    this.syncMesh(dt);
    return before;
  }

  // Simple kinematic move used by AI drivers (they steer toward a target).
  driveToward(dt, tx, tz, targetSpeed, colliders) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const want = Math.atan2(-dx, -dz);
    const diff = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.heading += clamp(diff, -2.4 * dt, 2.4 * dt);
    const accel = diff > 1.2 ? 4 : 11;
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + accel * dt);
    else this.speed = Math.max(targetSpeed, this.speed - 18 * dt);
    this.pos.x += -Math.sin(this.heading) * this.speed * dt;
    this.pos.z += -Math.cos(this.heading) * this.speed * dt;
    this.pos.x = clamp(this.pos.x, -292, 292);
    this.pos.z = clamp(this.pos.z, -292, 300);
    collideCircle(this.pos, CAR.radius, colliders);
    this.syncMesh(dt);
  }

  syncMesh(dt) {
    this.mesh.rotation.y = this.heading;
    // Slight body roll/pitch for feel.
    this.mesh.rotation.z = -this.steerVis * clamp(Math.abs(this.speed) / CAR.maxSpeed, 0, 1) * 0.05;
    const spin = this.speed * dt * 2.6;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    if (this.police && this.mesh.userData.lightBar) {
      const t = performance.now() * 0.012 + this.flashPhase;
      const on = Math.sin(t) > 0;
      this.mesh.userData.lightBar.red.material.color.setHex(on ? 0xff2222 : 0x551111);
      this.mesh.userData.lightBar.blue.material.color.setHex(on ? 0x2266ff : 0x111155);
    }
  }

  park() { this.speed = 0; this.syncMesh(0); }
}

// Spawn a ring of parked cars on road edges around town for carjacking.
export function spawnParkedCars(scene, rng, centers) {
  const cars = [];
  const spots = [];
  for (const cz of centers) {
    for (let i = 0; i < 3; i++) {
      const x = rng.range(-260, 260);
      const side = rng.chance(0.5) ? 5.6 : -5.6;
      spots.push({ x, z: cz + side, heading: side > 0 ? -Math.PI / 2 : Math.PI / 2, horiz: true });
    }
  }
  for (const cx of centers) {
    for (let i = 0; i < 2; i++) {
      const z = rng.range(-260, 250);
      const side = rng.chance(0.5) ? 5.6 : -5.6;
      spots.push({ x: cx + side, z, heading: side > 0 ? Math.PI : 0, horiz: false });
    }
  }
  // Always one car near the player's start so mission 1 is quick.
  spots.push({ x: 186, z: 264.6, heading: -Math.PI / 2, horiz: true });
  for (const s of spots) {
    const car = new Car(scene, rng.pick(CAR_COLORS), s);
    car.parked = true;
    cars.push(car);
  }
  return cars;
}
