// NEON PALMS — the 5-mission story from Dario Venn at Café Azul.
// A small state machine: idle-at-café -> active objective -> reward ->
// next mission. Markers are glowing pillars of light with a floating
// ring; pickups are spinning gold envelopes. After mission 5 the game
// drops into free roam with cash pickups spawning around Palmera.

import * as THREE from 'three';
import { MISSIONS, CAFE, STORY_COMPLETE_TEXT, DIALOGUE } from './config.js';
import { dist2D } from './random.js';

function makeMarker(color = 0x37e6ff) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 26, 18, 1, true), beamMat);
  beam.position.y = 13;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.14, 8, 28),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  group.add(ring);
  group.userData = { beam, ring };
  return group;
}

function makeEnvelope() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.12, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0x8a5c00 }),
  );
  group.add(body);
  const flap = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.05, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xffe9a0 }),
  );
  flap.position.set(0, 0.08, -0.14);
  flap.rotation.x = 0.5;
  group.add(flap);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  group.add(glow);
  group.position.y = 1.1;
  return group;
}

export class MissionSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.index = 0;            // next mission to offer
    this.state = 'offer';      // offer | active | done
    this.timer = null;         // seconds left on timed missions
    this.collected = 0;
    this.complete = false;

    this.cafeMarker = makeMarker(0x37e6ff);
    this.cafeMarker.position.set(CAFE.x, 0, CAFE.z - 16);
    scene.add(this.cafeMarker);

    this.targetMarker = makeMarker(0xffc93c);
    this.targetMarker.visible = false;
    scene.add(this.targetMarker);

    this.pickups = [];         // active envelope meshes
    this.cashPickups = [];     // free-roam cash drops {mesh, value}
    this.cashTimer = 4;
    this.spin = 0;
  }

  get current() { return this.complete ? null : MISSIONS[this.index]; }

  // Called by main when Marina stands in the café marker.
  tryStart(ctx) {
    if (this.state !== 'offer' || this.complete) return null;
    const m = this.current;
    this.state = 'active';
    this.collected = 0;
    this.timer = m.timeLimit || null;
    this.cafeMarker.visible = false;
    if (m.type === 'timed-reach' || m.type === 'reach-cafe') {
      const t = m.type === 'reach-cafe' ? { x: CAFE.x, z: CAFE.z - 16 } : m.target;
      this.targetMarker.position.set(t.x, 0, t.z);
      this.targetMarker.visible = true;
    }
    if (m.type === 'shake-heat') {
      ctx.police.setStars(m.stars);
      this.targetMarker.visible = false; // objective is to lose the heat first
    }
    if (m.type === 'collect') {
      for (const p of m.pickups) {
        const env = makeEnvelope();
        env.position.set(p.x, 1.1, p.z);
        this.scene.add(env);
        this.pickups.push(env);
      }
    }
    return { mission: m, dialogue: m.intro };
  }

  objectiveText() {
    if (this.complete) return 'Free roam — collect cash pickups around Palmera';
    const m = this.current;
    if (!m) return '';
    if (this.state === 'offer') return `Go to Café Azul — ${m.giver} has a job: “${m.title}”`;
    let text = m.objective;
    if (m.type === 'collect') text += ` (${this.collected}/${m.pickups.length})`;
    if (this.timer !== null) text += ` — ${Math.max(0, Math.ceil(this.timer))}s`;
    if (m.type === 'shake-heat') {
      text = this.heatCleared
        ? 'Heat lost! Return to Café Azul'
        : `Lose the police (stars must reach 0) — then return to Café Azul`;
    }
    return text;
  }

  markerTarget() {
    // Where the minimap + HUD arrow should point right now.
    if (this.complete) return null;
    const m = this.current;
    if (!m) return null;
    if (this.state === 'offer') return { x: CAFE.x, z: CAFE.z - 16 };
    if (m.type === 'collect') {
      const next = this.pickups.find((p) => p.visible);
      return next ? { x: next.position.x, z: next.position.z } : { x: CAFE.x, z: CAFE.z - 16 };
    }
    if (m.type === 'shake-heat') {
      return this.heatCleared ? { x: CAFE.x, z: CAFE.z - 16 } : null;
    }
    if (m.target) return m.target;
    return { x: CAFE.x, z: CAFE.z - 16 };
  }

  finish(ctx, m) {
    this.state = 'offer';
    this.index += 1;
    this.targetMarker.visible = false;
    this.timer = null;
    this.heatCleared = false;
    ctx.addCash(m.reward);
    if (this.index >= MISSIONS.length) {
      this.complete = true;
      this.cafeMarker.visible = false;
      return { done: true, reward: m.reward, text: STORY_COMPLETE_TEXT };
    }
    this.cafeMarker.visible = true;
    return {
      done: false,
      reward: m.reward,
      text: `${m.title} complete! +$${m.reward}. ${DIALOGUE.freeRoam}`,
    };
  }

  fail(ctx, m) {
    // Timed mission expired: back to the café offer, no reward.
    this.state = 'offer';
    this.timer = null;
    this.targetMarker.visible = false;
    for (const p of this.pickups) this.scene.remove(p);
    this.pickups = [];
    this.cafeMarker.visible = true;
    return { failed: true, text: `Out of time on “${m.title}”. Dario has the job waiting at Café Azul.` };
  }

  // Per-frame update. ctx: {playerPos, inCar, police, addCash, onEvent}
  update(dt, ctx) {
    this.spin += dt;
    const events = [];
    // Marker animation.
    for (const mk of [this.cafeMarker, this.targetMarker]) {
      if (!mk.visible) continue;
      mk.userData.ring.rotation.z += dt * 1.4;
      mk.userData.ring.position.y = 0.4 + Math.sin(this.spin * 2.4) * 0.15;
      mk.userData.beam.material.opacity = 0.26 + Math.sin(this.spin * 3) * 0.07;
    }
    const p = ctx.playerPos;

    // Free-roam cash pickups.
    if (this.complete) {
      this.cashTimer -= dt;
      if (this.cashTimer <= 0 && this.cashPickups.length < 6) {
        this.cashTimer = 5;
        const env = makeEnvelope();
        env.position.set(this.rng.range(-250, 250), 1.1, this.rng.range(-250, 260));
        this.scene.add(env);
        this.cashPickups.push({ mesh: env, value: this.rng.int(20, 80) });
      }
    }
    for (const cp of this.cashPickups) {
      cp.mesh.rotation.y += dt * 2.4;
      cp.mesh.position.y = 1.1 + Math.sin(this.spin * 3 + cp.mesh.position.x) * 0.18;
      if (dist2D(p.x, p.z, cp.mesh.position.x, cp.mesh.position.z) < 2.2) {
        cp.taken = true;
        ctx.addCash(cp.value);
        events.push({ type: 'cash', value: cp.value });
        this.scene.remove(cp.mesh);
      }
    }
    this.cashPickups = this.cashPickups.filter((c) => !c.taken);

    if (this.state === 'offer') {
      if (!this.complete && dist2D(p.x, p.z, CAFE.x, CAFE.z - 16) < 3.2) {
        const started = this.tryStart(ctx);
        if (started) events.push({ type: 'started', ...started });
      }
      return events;
    }
    if (this.state !== 'active') return events;
    const m = this.current;
    if (!m) return events;

    // Timers.
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        events.push({ type: 'failed', ...this.fail(ctx, m) });
        return events;
      }
    }

    if (m.type === 'reach-cafe') {
      if (ctx.inCar && dist2D(p.x, p.z, CAFE.x, CAFE.z - 16) < 7) {
        events.push({ type: 'complete', ...this.finish(ctx, m) });
      }
    } else if (m.type === 'timed-reach') {
      if (dist2D(p.x, p.z, m.target.x, m.target.z) < 6) {
        events.push({ type: 'complete', ...this.finish(ctx, m) });
      }
    } else if (m.type === 'shake-heat') {
      if (!this.heatCleared && ctx.police.stars === 0) {
        this.heatCleared = true;
        this.targetMarker.position.set(CAFE.x, 0, CAFE.z - 16);
        this.targetMarker.visible = true;
        events.push({ type: 'progress', text: 'Heat lost! Get back to Café Azul.' });
      }
      if (this.heatCleared && dist2D(p.x, p.z, CAFE.x, CAFE.z - 16) < 6) {
        events.push({ type: 'complete', ...this.finish(ctx, m) });
      }
    } else if (m.type === 'collect') {
      for (const env of this.pickups) {
        if (!env.visible) continue;
        env.rotation.y += dt * 2.4;
        env.position.y = 1.1 + Math.sin(this.spin * 3 + env.position.x) * 0.18;
        if (dist2D(p.x, p.z, env.position.x, env.position.z) < 2.4) {
          env.visible = false;
          this.collected += 1;
          events.push({ type: 'pickup', text: `Envelope ${this.collected}/${m.pickups.length} collected` });
        }
      }
      if (this.collected >= m.pickups.length) {
        events.push({ type: 'complete', ...this.finish(ctx, m) });
      }
    }
    return events;
  }

  // Save/load support.
  serialize() {
    return { index: this.index, complete: this.complete };
  }
  restore(data) {
    if (!data) return;
    this.index = data.index || 0;
    this.complete = !!data.complete;
    this.state = 'offer';
    this.cafeMarker.visible = !this.complete;
  }
}
