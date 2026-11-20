// NEON PALMS: Palmera City — boot, game loop, state machine, save/load.
// Wires every system together: city, Marina, cars, traffic, pedestrians,
// police, missions, HUD, audio. Modes: menu -> playing <-> paused, and
// the BUSTED / WASTED end screen with respawn. With ?shot=<name> the
// game boots straight into a staged scene (see shots.js).

import * as THREE from 'three';
import { PLAYER, SAVE_KEY, DIALOGUE, TRAFFIC_COUNT, PED_COUNT, WORLD } from './config.js';
import { makeRng, clamp, dist2D } from './random.js';
import { buildCity } from './city.js';
import { Player, FollowCamera } from './player.js';
import { spawnParkedCars } from './vehicle.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { MissionSystem } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { SHOT_STAGERS } from './shots.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 1337) || 1337;
const rng = makeRng(seed);

// ---------- renderer / scene ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(160, 30, 340);
camera.lookAt(0, 10, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- world + actors ----------
const city = buildCity(scene, rng);
const player = new Player(scene, PLAYER.startPos);
const parkedCars = spawnParkedCars(scene, rng, city.centers);
const traffic = createTraffic(scene, rng, city.lanes, TRAFFIC_COUNT);
const peds = createPedestrians(scene, rng, city.centers, PED_COUNT);
const police = new PoliceSystem(scene, rng);
const missions = new MissionSystem(scene, rng);
const hud = new Hud();
const audio = new AudioEngine();
const cameraRig = new FollowCamera(camera);
cameraRig.yaw = Math.PI;
cameraRig.snap(player.pos);

// ---------- game state ----------
const state = {
  mode: shotName ? 'playing' : 'menu', // menu | playing | paused | ended
  cash: PLAYER.startCash,
  time: 0,
  currentCar: null,       // Car instance Marina is driving, or null
  carSource: null,        // 'parked' | 'traffic'
  crimeCooldown: 0,
  hitCooldown: 0,
  ramCooldown: 0,
  saveTimer: 0,
  vista: null,            // shot-mode fixed camera
  drift: 0,
  endedKind: null,
};

function setCash(v) {
  state.cash = Math.max(0, Math.round(v));
  hud.setCash(state.cash);
}
function addCash(v) { setCash(state.cash + v); }

// ---------- save / load ----------
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      mission: missions.serialize(),
      pos: { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
      health: Math.round(player.health),
    }));
  } catch { /* storage unavailable: play on without saving */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

// ---------- car enter / exit ----------
function nearestCar(maxDist) {
  let best = null, bestD = maxDist;
  const consider = (car, source) => {
    const d = dist2D(player.pos.x, player.pos.z, car.pos.x, car.pos.z);
    if (d < bestD) { bestD = d; best = { car, source }; }
  };
  for (const c of parkedCars) consider(c, 'parked');
  for (const t of traffic) if (!t.stolen && Math.abs(t.car.speed) < 3) consider(t.car, 'traffic');
  return best;
}

function enterCar(car, opts = {}) {
  state.currentCar = car;
  player.inCar = car;
  player.setVisible(false);
  car.occupied = true;
  if (!opts.silent) audio.door();
}
function exitCar() {
  const car = state.currentCar;
  if (!car) return;
  // Step out beside the car, on the side away from its heading.
  const sideX = Math.cos(car.heading), sideZ = -Math.sin(car.heading);
  player.teleport(car.pos.x + sideX * 2.4, car.pos.z + sideZ * 2.4, car.heading);
  player.inCar = null;
  player.setVisible(true);
  car.occupied = false;
  car.park();
  state.currentCar = null;
  audio.door();
}

// Take a car: parked cars are free; a traffic car means carjacking.
function tryEnter() {
  const found = nearestCar(4.2);
  if (!found) return;
  const { car, source } = found;
  if (source === 'traffic') {
    const t = traffic.find((x) => x.car === car);
    if (t) {
      t.stolen = true;
      parkedCars.push(car); // it is Marina's ride now
    }
    police.reportCrime(1);
    hud.toast('Carjacked! +1 wanted star');
    hud.banner('Palmera PD', DIALOGUE.carjack, 3.5);
    audio.thud(0.5);
  }
  state.carSource = source;
  enterCar(car);
  cameraRig.yaw = car.heading + Math.PI;
}

function focusPos() { return state.currentCar ? state.currentCar.pos : player.pos; }
function focusVel() {
  const c = state.currentCar;
  if (!c) return { x: 0, z: 0 };
  return { x: -Math.sin(c.heading) * c.speed, z: -Math.cos(c.heading) * c.speed };
}
function focusSpeed() {
  const v = focusVel();
  return Math.hypot(v.x, v.z);
}

// ---------- end screens / respawn ----------
function endGame(kind) {
  state.mode = 'ended';
  state.endedKind = kind;
  police.clear();
  if (kind === 'busted') {
    const fine = Math.min(state.cash, 100);
    setCash(state.cash - fine);
    hud.showEnd('BUSTED', `${DIALOGUE.busted} The fine is $${fine}. Marina walks out of the station at golden hour.`);
    audio.fail();
  } else {
    hud.showEnd('WASTED', DIALOGUE.wasted);
    audio.fail();
  }
  saveGame();
}
function respawn() {
  hud.hideEnd();
  if (state.currentCar) {
    state.currentCar.occupied = false;
    state.currentCar = null;
    player.inCar = null;
    player.setVisible(true);
  }
  police.clearCars();
  police.clear();
  player.healFull();
  player.teleport(216, 252, Math.PI);
  cameraRig.yaw = Math.PI;
  cameraRig.snap(player.pos);
  state.mode = 'playing';
}

// ---------- input ----------
const keys = new Set();
let mouseDX = 0, mouseDY = 0;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  audio.start();
  if (state.mode === 'playing') {
    if (e.code === 'KeyE') {
      if (state.currentCar) exitCar(); else tryEnter();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame(true);
  } else if (state.mode === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    pauseGame(false);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => {
  audio.start();
  if (state.mode === 'playing' && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
});
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  }
});
function pauseGame(on) {
  state.mode = on ? 'paused' : 'playing';
  hud.showPause(on);
  if (document.pointerLockElement) document.exitPointerLock?.();
}

// Buttons.
document.getElementById('new-btn').addEventListener('click', () => {
  audio.start(); audio.stopPad();
  clearSave();
  missions.restore({ index: 0, complete: false });
  setCash(PLAYER.startCash);
  startPlaying();
});
document.getElementById('continue-btn').addEventListener('click', () => {
  audio.start(); audio.stopPad();
  const save = loadSave();
  if (save) {
    setCash(save.cash ?? PLAYER.startCash);
    missions.restore(save.mission);
    if (save.pos) player.teleport(save.pos.x, save.pos.z, Math.PI);
    player.health = clamp(save.health ?? 100, 10, 100);
  }
  startPlaying();
});
document.getElementById('resume-btn').addEventListener('click', () => pauseGame(false));
document.getElementById('restart-btn').addEventListener('click', () => {
  clearSave();
  missions.restore({ index: 0, complete: false });
  setCash(PLAYER.startCash);
  pauseGame(false);
  respawn();
});
document.getElementById('respawn-btn').addEventListener('click', respawn);

function startPlaying() {
  hud.hideStart();
  state.mode = 'playing';
  hud.banner('Dario Venn', DIALOGUE.start, 6);
  cameraRig.snap(player.pos);
}

// ---------- mission event handling ----------
function handleMissionEvents(events) {
  for (const ev of events) {
    if (ev.type === 'started') {
      hud.banner(`Mission — ${ev.mission.title}`, ev.dialogue, 7);
      audio.missionStart();
      saveGame();
    } else if (ev.type === 'complete') {
      hud.banner(ev.done ? 'Story Complete' : 'Mission Complete', ev.text, 8);
      hud.toast(`+$${ev.reward}`);
      audio.missionComplete();
      saveGame();
    } else if (ev.type === 'failed') {
      hud.banner('Mission Failed', ev.text, 6);
      audio.fail();
    } else if (ev.type === 'pickup') {
      hud.toast(ev.text);
      audio.pickup();
    } else if (ev.type === 'progress') {
      hud.toast(ev.text, 4);
      audio.pickup();
    } else if (ev.type === 'cash') {
      hud.toast(`+$${ev.value} cash pickup`);
      audio.pickup();
    }
  }
}

// ---------- per-frame update ----------
function update(dt) {
  state.time += dt;
  const fp = focusPos();
  const fv = focusVel();
  const fs = focusSpeed();
  state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);
  state.hitCooldown = Math.max(0, state.hitCooldown - dt);
  state.ramCooldown = Math.max(0, state.ramCooldown - dt);

  // Camera orbit from accumulated mouse movement.
  if (mouseDX || mouseDY) {
    cameraRig.addMouse(mouseDX, mouseDY);
    mouseDX = 0; mouseDY = 0;
  }

  // --- movement / driving ---
  const fwdKey = keys.has('KeyW') || keys.has('ArrowUp');
  const backKey = keys.has('KeyS') || keys.has('ArrowDown');
  const leftKey = keys.has('KeyA') || keys.has('ArrowLeft');
  const rightKey = keys.has('KeyD') || keys.has('ArrowRight');
  const runKey = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const brakeKey = keys.has('Space');

  if (state.currentCar) {
    const car = state.currentCar;
    const input = {
      throttle: fwdKey ? 1 : backKey ? -1 : 0,
      steer: (leftKey ? 1 : 0) + (rightKey ? -1 : 0),
      brake: brakeKey,
    };
    // Reverse doubles as brake when moving forward (arcade convention).
    if (backKey && car.speed > 1) { input.throttle = 0; input.brake = true; }
    car.drive(dt, input, city.colliders);
    if (car.lastHit) {
      car.lastHit = 0;
      audio.thud(clamp(Math.abs(car.speed) + 0.4, 0.3, 1));
      if (state.hitCooldown <= 0) {
        state.hitCooldown = 1.2;
        player.hurt(3);
        // A hard crash in view of a patrol refreshes their attention:
        // the wanted decay clock restarts (stars themselves unchanged).
        if (police.stars > 0) police.hiddenTime = 0;
      }
    }
    // Running down a pedestrian is a serious crime.
    if (fs > 5) {
      for (const ped of peds) {
        if (dist2D(car.pos.x, car.pos.z, ped.pos.x, ped.pos.z) < 1.5) {
          ped.respawn();
          police.reportCrime(1);
          hud.toast('You hit a pedestrian! +1 star');
          player.hurt(2);
          audio.thud(1);
          break;
        }
      }
    }
  } else {
    // Camera-relative on-foot movement.
    const yaw = cameraRig.yaw;
    const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const r = { x: -f.z, z: f.x };
    const move = { x: 0, z: 0 };
    if (fwdKey) { move.x += f.x; move.z += f.z; }
    if (backKey) { move.x -= f.x; move.z -= f.z; }
    if (rightKey) { move.x += r.x; move.z += r.z; }
    if (leftKey) { move.x -= r.x; move.z -= r.z; }
    player.update(dt, move, runKey, yaw, city.colliders);
    // Walking into traffic hurts.
    if (state.ramCooldown <= 0) {
      for (const t of traffic) {
        if (Math.abs(t.car.speed) > 6 && dist2D(player.pos.x, player.pos.z, t.car.pos.x, t.car.pos.z) < 1.7) {
          player.hurt(14);
          state.ramCooldown = 1.5;
          audio.thud(1);
          hud.toast('Hit by a car!');
          break;
        }
      }
    }
  }

  // --- world systems ---
  const trafficCtx = { focusPos: fp, trafficCars: traffic.map((t) => t.car), colliders: city.colliders };
  for (const t of traffic) t.update(dt, trafficCtx);
  const pedCtx = { focusPos: fp, focusSpeed: fs, wanted: police.stars, colliders: city.colliders };
  for (const ped of peds) ped.update(dt, pedCtx);

  const policeEvents = police.update(dt, {
    focusPos: fp, focusVel: fv, colliders: city.colliders,
  });
  // Police ramming a moving player car chips health.
  if (state.currentCar && state.ramCooldown <= 0) {
    for (const pc of police.cars) {
      if (dist2D(pc.pos.x, pc.pos.z, fp.x, fp.z) < 2.9 && Math.abs(pc.speed) > 6) {
        player.hurt(5);
        state.ramCooldown = 1.1;
        audio.thud(0.8);
        break;
      }
    }
  }
  if (policeEvents.busted) { endGame('busted'); return; }
  if (player.health <= 0) { endGame('wasted'); return; }

  // --- missions ---
  const mEvents = missions.update(dt, {
    playerPos: fp,
    inCar: !!state.currentCar,
    police,
    addCash,
  });
  handleMissionEvents(mEvents);

  // --- HUD ---
  hud.setStars(police.stars, police.bustProgress);
  hud.setHealth(player.health);
  hud.setSpeed(fs * 3.6, !!state.currentCar);
  const m = missions.current;
  hud.setObjective(missions.objectiveText(), missions.state === 'active' ? missions.timer : null);
  void m;
  const near = !state.currentCar ? nearestCar(4.2) : null;
  hud.showInteract(state.currentCar
    ? '<b>E</b> exit car'
    : near ? '<b>E</b> enter car' : null);
  hud.drawMinimap({
    player: fp,
    playerHeading: state.currentCar ? state.currentCar.heading : player.heading,
    inCar: !!state.currentCar,
    traffic: traffic.map((t) => t.car.pos),
    police: police.cars.map((c) => c.pos),
    target: missions.markerTarget(),
    time: state.time,
  });
  hud.update(dt);

  // --- audio ---
  let nearestCop = Infinity;
  for (const pc of police.cars) nearestCop = Math.min(nearestCop, dist2D(pc.pos.x, pc.pos.z, fp.x, fp.z));
  audio.update(dt, {
    inCar: !!state.currentCar,
    speedRatio: state.currentCar ? state.currentCar.speed / 34 : 0,
    sirensNear: police.stars > 0 && nearestCop < 90 ? nearestCop : 0,
    time: state.time,
  });

  city.update(dt, state.time);

  // Camera: vista (shots/menu) or follow rig.
  if (state.vista) {
    const v = state.vista;
    const dx = state.drift ? Math.sin(state.time * 0.07) * state.drift : 0;
    camera.position.set(v.pos[0] + dx, v.pos[1], v.pos[2]);
    camera.lookAt(v.look[0], v.look[1], v.look[2]);
  } else {
    cameraRig.update(dt, fp, state.currentCar ? state.currentCar.heading : player.heading, !!state.currentCar);
  }

  // Periodic autosave while playing.
  state.saveTimer += dt;
  if (state.saveTimer > 6) { state.saveTimer = 0; saveGame(); }
}

// ---------- boot ----------
setCash(state.cash);
hud.setHealth(100);
const game = {
  scene, player, parkedCars, traffic, peds, police, missions, hud,
  cameraRig, camera, enterCar, setCash,
};
window.__neonPalms = game;

if (shotName && SHOT_STAGERS[shotName]) {
  const staged = SHOT_STAGERS[shotName](game);
  if (staged && staged.vista) {
    state.vista = staged.vista;
    state.drift = staged.drift || 0;
  }
  state.mode = shotName === 'start' ? 'menu' : 'playing';
  if (shotName === 'start') audio.startPad;
} else {
  const save = loadSave();
  hud.showStart(!!save);
  audio.startPad;
  state.vista = { pos: [168, 30, 348], look: [0, 16, -40] };
  state.drift = 6;
}

// Leaving the menu clears the vista so the follow camera takes over.
const vistaGuard = setInterval(() => {
  if (state.mode === 'playing' && !shotName) {
    state.vista = null;
    state.drift = 0;
    clearInterval(vistaGuard);
  }
}, 250);

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  if (state.mode === 'playing' || state.mode === 'ended') {
    if (state.mode === 'playing') update(dt);
    else {
      // Keep the world breathing behind the end screen.
      state.time += dt;
      city.update(dt, state.time);
      hud.update(dt);
    }
  } else if (state.mode === 'menu') {
    state.time += dt;
    city.update(dt, state.time);
    // Ambient traffic/peds behind the title screen.
    const ctx = { focusPos: { x: 0, z: 200 }, trafficCars: traffic.map((t) => t.car), colliders: city.colliders };
    for (const t of traffic) t.update(dt, ctx);
    for (const ped of peds) ped.update(dt, { focusPos: ctx.focusPos, focusSpeed: 0, wanted: 0, colliders: city.colliders });
    if (state.vista) {
      const v = state.vista;
      const dx = state.drift ? Math.sin(state.time * 0.07) * state.drift : 0;
      camera.position.set(v.pos[0] + dx, v.pos[1], v.pos[2]);
      camera.lookAt(v.look[0], v.look[1], v.look[2]);
    }
    hud.drawMinimap({
      player: player.pos, playerHeading: player.heading, inCar: false,
      traffic: traffic.map((t) => t.car.pos), police: [], target: missions.markerTarget(), time: state.time,
    });
  }
  // Paused: render the frozen frame without updating.
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
void WORLD;
