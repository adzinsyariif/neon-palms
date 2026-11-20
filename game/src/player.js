// NEON PALMS — Marina Solano: on-foot controller + follow camera rig.
// Marina is a small stylised figure (teal jacket, dark hair) built from
// boxes. WASD moves relative to the mouse-orbit camera; Shift runs.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, angleLerp, collideCircle } from './random.js';

export function createMarinaMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x0e7d86 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3242 });
  const hairM = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });

  const legs = new THREE.Group();
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pants);
  legL.position.set(-0.13, 0.36, 0);
  const legR = legL.clone(); legR.position.x = 0.13;
  legs.add(legL, legR);
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), jacket);
  torso.position.y = 1.05;
  group.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), jacket);
  armL.position.set(-0.37, 1.06, 0);
  const armR = armL.clone(); armR.position.x = 0.37;
  group.add(armL, armR);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
  head.position.y = 1.58;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.38), hairM);
  hair.position.y = 1.78;
  group.add(hair);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.1), hairM);
  tail.position.set(0, 1.52, 0.2);
  group.add(tail);
  group.userData = { legL, legR, armL, armR, torso };
  return group;
}

export class Player {
  constructor(scene, startPos) {
    this.mesh = createMarinaMesh();
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.pos.set(startPos.x, 0, startPos.z);
    this.heading = Math.PI; // face south toward the beach at spawn
    this.health = PLAYER.maxHealth;
    this.walkPhase = 0;
    this.inCar = null;
    this.visible = true;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  setVisible(v) {
    this.visible = v;
    this.mesh.visible = v;
  }

  // move: {x,z} camera-relative wish direction (normalised by caller),
  // run: bool. Camera yaw drives facing when moving.
  update(dt, move, run, camYaw, colliders) {
    if (this.inCar) return;
    const moving = Math.abs(move.x) > 0.01 || Math.abs(move.z) > 0.01;
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (moving) {
      const len = Math.hypot(move.x, move.z) || 1;
      const wx = (move.x / len) * speed;
      const wz = (move.z / len) * speed;
      this.pos.x += wx * dt;
      this.pos.z += wz * dt;
      const targetHeading = Math.atan2(-wx, -wz);
      this.heading = angleLerp(this.heading, targetHeading, clamp(dt * 12, 0, 1));
      this.walkPhase += dt * (run ? 13 : 9);
    } else {
      this.walkPhase = 0;
    }
    // Clamp to the world: city + beach + pier deck.
    this.pos.x = clamp(this.pos.x, -296, 296);
    this.pos.z = clamp(this.pos.z, -296, 396);
    // South of the beach line, only the pier strip is walkable (plus sand
    // down to the waterline at seaZ).
    if (this.pos.z > 306 && Math.abs(this.pos.x - 0) > 5.2) {
      this.pos.z = 306; // waterline: Marina does not swim
    }
    collideCircle(this.pos, PLAYER.radius, colliders);
    // Ground height: the pier deck sits 1.45 m above the sand/water line,
    // so Marina steps up onto it when she is on the pier strip.
    const onPier = Math.abs(this.pos.x) < 5.2 && this.pos.z > 280;
    const groundY = onPier ? 1.45 : 0;
    // Animate limbs with a simple swing.
    const s = Math.sin(this.walkPhase) * (moving ? 0.55 : 0);
    const u = this.mesh.userData;
    u.legL.rotation.x = s; u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
    this.mesh.position.y = groundY + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.05 : 0);
    this.mesh.rotation.y = this.heading;
    void camYaw;
  }

  teleport(x, z, heading = this.heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.mesh.rotation.y = heading;
  }

  hurt(amount) {
    this.health = clamp(this.health - amount, 0, PLAYER.maxHealth);
    return this.health <= 0;
  }

  healFull() { this.health = PLAYER.maxHealth; }
}

// Mouse-orbit follow camera: yaw/pitch from pointer movement, smoothed
// follow behind either Marina or her car.
export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 9;
    this.smoothPos = new THREE.Vector3(0, 6, 20);
    this.lookTarget = new THREE.Vector3();
  }

  addMouse(dx, dy) {
    this.yaw -= dx * 0.0032;
    this.pitch = clamp(this.pitch + dy * 0.0024, 0.06, 1.1);
  }

  update(dt, focus, focusHeading, inCar) {
    const dist = inCar ? 12.5 : this.dist;
    const height = inCar ? 4.6 : 3.4;
    // When driving, ease the camera behind the car's heading.
    if (inCar) this.yaw = angleLerp(this.yaw, focusHeading + Math.PI, clamp(dt * 1.6, 0, 1));
    const cx = focus.x - Math.sin(this.yaw) * Math.cos(this.pitch) * -dist * -1;
    // Compute orbit offset: camera sits behind the focus relative to yaw.
    const ox = Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
    const oz = Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
    const oy = Math.sin(this.pitch) * dist + height * 0.4;
    void cx;
    const want = new THREE.Vector3(focus.x + ox, oy + 1.2, focus.z + oz);
    const k = clamp(dt * (inCar ? 5.5 : 8), 0, 1);
    this.smoothPos.lerp(want, k);
    // Never let the camera sink under the pier or ground.
    this.smoothPos.y = Math.max(this.smoothPos.y, 1.1);
    this.camera.position.copy(this.smoothPos);
    this.lookTarget.set(focus.x, 1.6, focus.z);
    this.camera.lookAt(this.lookTarget);
  }

  snap(focus) {
    const ox = Math.sin(this.yaw) * this.dist;
    const oz = Math.cos(this.yaw) * this.dist;
    this.smoothPos.set(focus.x + ox, 4.6, focus.z + oz);
  }
}
