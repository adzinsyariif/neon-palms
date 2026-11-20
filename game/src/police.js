// NEON PALMS — wanted system + Palmera PD pursuit.
// Crimes call reportCrime(); stars rise, police cars spawn at the map
// edge and hunt the player. Stay out of sight and the heat decays.
// If a police car pins a slow player long enough: BUSTED.

import { WANTED, POLICE_MAX, CAR } from './config.js';
import { Car } from './vehicle.js';
import { clamp, dist2D } from './random.js';

export class PoliceSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.stars = 0;
    this.cars = [];          // active police Car instances
    this.hiddenTime = 0;     // seconds since any cop saw the player
    this.decayTimer = 0;
    this.bustProgress = 0;   // 0..1
    this.seen = false;
    this.spawnCooldown = 0;
  }

  get active() { return this.stars > 0; }

  reportCrime(amount = 1) {
    this.stars = clamp(this.stars + amount, 0, 5);
    this.hiddenTime = 0;
    this.decayTimer = 0;
  }

  setStars(n) {
    this.stars = clamp(n, 0, 5);
    this.hiddenTime = 0;
    this.decayTimer = 0;
  }

  clear() {
    this.stars = 0;
    this.bustProgress = 0;
    this.hiddenTime = 0;
  }

  desiredCars() {
    // 1 star: 1 car, scaling to POLICE_MAX at 4–5 stars.
    return this.stars === 0 ? 0 : clamp(this.stars, 1, POLICE_MAX);
  }

  spawnCar(playerPos) {
    // Spawn on a road at least 70 m away, at the map edge side.
    const rng = this.rng;
    const side = rng.int(0, 3);
    let x, z;
    if (side === 0) { x = rng.range(-260, 260); z = -282; }
    else if (side === 1) { x = rng.range(-260, 260); z = 282; }
    else if (side === 2) { x = -282; z = rng.range(-260, 260); }
    else { x = 282; z = rng.range(-260, 260); }
    if (dist2D(x, z, playerPos.x, playerPos.z) < 60) { x = -x; z = -z; }
    // Snap to the nearest road centre line.
    const snap = (v) => Math.round((v + 270) / 54) * 54 - 270;
    if (side < 2) x = snap(x); else z = snap(z);
    const car = new Car(this.scene, 0xffffff, { police: true, x, z });
    this.cars.push(car);
    return car;
  }

  // Returns events: {busted:boolean}
  update(dt, ctx) {
    const events = { busted: false };
    const playerPos = ctx.focusPos;
    this.spawnCooldown -= dt;

    // Spawn up to the desired count.
    if (this.stars > 0 && this.cars.length < this.desiredCars() && this.spawnCooldown <= 0) {
      this.spawnCar(playerPos);
      this.spawnCooldown = 2.5;
    }
    // Remove surplus cars when heat drops (they peel off at the edge).
    while (this.cars.length > this.desiredCars()) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh);
    }

    let anySeen = false;
    let nearest = Infinity;
    for (const car of this.cars) {
      const d = dist2D(car.pos.x, car.pos.z, playerPos.x, playerPos.z);
      nearest = Math.min(nearest, d);
      if (d < WANTED.sightRange) anySeen = true;
      // Pursuit: aim slightly ahead of the player's motion; at higher
      // stars, cut corners more aggressively.
      const lead = this.stars >= 3 ? 0.55 : 0.25;
      const tx = playerPos.x + (ctx.focusVel?.x || 0) * lead;
      const tz = playerPos.z + (ctx.focusVel?.z || 0) * lead;
      const speed = CAR.policeSpeed * (0.82 + this.stars * 0.07);
      car.driveToward(dt, tx, tz, speed, ctx.colliders);
      // Ram damage handled by main via proximity checks.
    }
    this.seen = anySeen;

    // Wanted decay: hidden long enough, stars fall one by one.
    if (this.stars > 0) {
      if (anySeen) {
        this.hiddenTime = 0;
        this.decayTimer = 0;
      } else {
        this.hiddenTime += dt;
        if (this.hiddenTime > WANTED.decayDelay) {
          this.decayTimer += dt;
          if (this.decayTimer >= WANTED.decayEvery) {
            this.decayTimer = 0;
            this.hiddenTime = 0;
            this.stars -= 1;
            if (this.stars <= 0) { this.stars = 0; this.clear(); }
          }
        }
      }
    }

    // Bust logic: a cop within bustRadius while the player is slow.
    const playerSpeed = Math.hypot(ctx.focusVel?.x || 0, ctx.focusVel?.z || 0);
    if (this.stars > 0 && nearest < WANTED.bustRadius + 1.6 && playerSpeed < 2.2) {
      this.bustProgress += dt / WANTED.bustTime;
      if (this.bustProgress >= 1) {
        events.busted = true;
        this.bustProgress = 0;
      }
    } else {
      this.bustProgress = Math.max(0, this.bustProgress - dt * 1.4);
    }
    return events;
  }

  // Force-remove every police car (used on respawn / story reset).
  clearCars() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars = [];
  }
}
