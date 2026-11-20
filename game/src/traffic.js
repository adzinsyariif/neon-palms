// NEON PALMS — AI traffic. Cars loop the road grid: each follows its
// current lane, and at every intersection either continues straight or
// turns onto a crossing lane, keeping Palmera feeling alive. Traffic
// cars brake for the player and can be carjacked (E near a stopped one).

import { CAR } from './config.js';
import { Car, CAR_COLORS } from './vehicle.js';
import { clamp, dist2D } from './random.js';

export class TrafficCar {
  constructor(scene, rng, lanes) {
    this.car = new Car(scene, rng.pick(CAR_COLORS), {});
    this.rng = rng;
    this.lanes = lanes;
    this.pickLane(true);
    this.speed = CAR.trafficSpeed * rng.range(0.8, 1.1);
    this.stolen = false;
  }

  pickLane(anywhere = false) {
    const rng = this.rng;
    this.lane = rng.pick(this.lanes);
    const t = anywhere ? rng.range(-255, 255) : (this.lane.dir > 0 ? -255 : 255);
    if (this.lane.axis === 'x') {
      this.car.pos.set(t, 0, this.lane.fixed);
      this.car.heading = this.lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      this.car.pos.set(this.lane.fixed, 0, t);
      this.car.heading = this.lane.dir > 0 ? Math.PI : 0;
    }
    this.car.speed = 0;
    this.nextTurnAt = this.chooseTurnPoint();
  }

  // Distance along the lane axis at which we may turn next.
  chooseTurnPoint() {
    // Intersections sit every 54 m; choose one 1–4 blocks ahead.
    const pos = this.lane.axis === 'x' ? this.car.pos.x : this.car.pos.z;
    const blocks = this.rng.int(1, 4);
    return pos + this.lane.dir * blocks * 54 + this.rng.range(-6, 6);
  }

  update(dt, ctx) {
    const car = this.car;
    if (this.stolen) return; // the player is driving it now
    const lane = this.lane;
    const along = lane.axis === 'x' ? car.pos.x : car.pos.z;

    // Turn when we reach the chosen intersection.
    if ((lane.dir > 0 && along >= this.nextTurnAt) || (lane.dir < 0 && along <= this.nextTurnAt)) {
      if (this.rng.chance(0.45)) {
        this.turnAtIntersection();
      } else {
        this.nextTurnAt = this.chooseTurnPoint();
      }
    }

    // Target point far ahead along the lane.
    let tx, tz;
    if (lane.axis === 'x') { tx = car.pos.x + lane.dir * 40; tz = lane.fixed; }
    else { tx = lane.fixed; tz = car.pos.z + lane.dir * 40; }

    // Brake for the player's car / Marina, and for the car ahead.
    let targetSpeed = this.speed;
    const focus = ctx.focusPos;
    if (focus) {
      const ahead = lane.axis === 'x'
        ? (focus.x - car.pos.x) * lane.dir
        : (focus.z - car.pos.z) * lane.dir;
      const lateral = lane.axis === 'x' ? Math.abs(focus.z - car.pos.z) : Math.abs(focus.x - car.pos.x);
      if (ahead > 0 && ahead < 9 && lateral < 3.2) targetSpeed = 0;
    }
    for (const other of ctx.trafficCars) {
      if (other === car) continue;
      const d = dist2D(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
      if (d < 7 && Math.abs(other.heading - car.heading) < 0.4) targetSpeed = Math.min(targetSpeed, other.speed);
    }
    // Despawn/respawn far cars at the map edge to keep density near play.
    if (Math.abs(car.pos.x) > 288 || Math.abs(car.pos.z) > 288) this.pickLane(true);
    car.driveToward(dt, tx, tz, targetSpeed, ctx.colliders);
    car.speed = clamp(car.speed, 0, CAR.trafficSpeed * 1.15);
  }

  turnAtIntersection() {
    const car = this.car;
    const lane = this.lane;
    // Snap to the intersection centre lines.
    const ix = Math.round((car.pos.x + 270) / 54) * 54 - 270;
    const iz = Math.round((car.pos.z + 270) / 54) * 54 - 270;
    const rng = this.rng;
    if (lane.axis === 'x') {
      // Turn onto the vertical road at ix, either direction.
      const dir = rng.chance(0.5) ? 1 : -1;
      this.lane = { axis: 'z', fixed: ix + (dir > 0 ? 3.4 : -3.4) * (lane.dir > 0 ? 1 : 1), dir };
      // Right-hand traffic: entering a z-lane heading south (dir=1) uses
      // the west-side lane offset; heading north uses the east side.
      this.lane.fixed = ix + (dir === 1 ? 3.4 : -3.4);
      car.pos.x = this.lane.fixed;
      car.pos.z = iz + lane.dir * 3.4;
    } else {
      const dir = rng.chance(0.5) ? 1 : -1;
      this.lane = { axis: 'x', fixed: iz + (dir === 1 ? -3.4 : 3.4), dir };
      car.pos.z = this.lane.fixed;
      car.pos.x = ix + lane.dir * 3.4;
    }
    this.nextTurnAt = this.chooseTurnPoint();
  }
}

export function createTraffic(scene, rng, lanes, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(new TrafficCar(scene, rng, lanes));
  return out;
}
