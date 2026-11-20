// NEON PALMS — HUD: wanted stars, cash, health, banners, menus and the
// live 2D-canvas minimap (roads, player arrow, traffic, police, target).

import { WORLD, roadCenters } from './config.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of [
      'stars', 'cash', 'health-fill', 'objective', 'banner', 'banner-title',
      'banner-text', 'toast', 'minimap', 'speed', 'bust-wrap', 'bust-fill',
      'start-screen', 'pause-screen', 'end-screen', 'end-title', 'end-text',
      'continue-btn', 'interact', 'timer-chip',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mm = this.el.minimap.getContext('2d');
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.centers = roadCenters();
  }

  setStars(n, bustProgress = 0) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.classList.toggle('hot', n >= 3);
    this.el['bust-wrap'].style.display = bustProgress > 0.02 ? 'block' : 'none';
    this.el['bust-fill'].style.width = `${Math.round(bustProgress * 100)}%`;
  }

  setCash(v) { this.el.cash.textContent = `$${v.toLocaleString('en-US')}`; }
  setHealth(v) {
    this.el['health-fill'].style.width = `${Math.max(0, Math.round(v))}%`;
    this.el['health-fill'].classList.toggle('low', v < 30);
  }
  setSpeed(kmh, inCar) {
    this.el.speed.textContent = inCar ? `${Math.round(kmh)} km/h` : '';
  }
  setObjective(text, timerSec = null) {
    this.el.objective.textContent = text;
    if (timerSec !== null && timerSec !== undefined) {
      this.el['timer-chip'].style.display = 'inline-block';
      this.el['timer-chip'].textContent = `${Math.max(0, Math.ceil(timerSec))}s`;
      this.el['timer-chip'].classList.toggle('urgent', timerSec < 15);
    } else {
      this.el['timer-chip'].style.display = 'none';
    }
  }
  showInteract(html) {
    if (html) {
      this.el.interact.style.display = 'block';
      this.el.interact.innerHTML = html; // our own fixed strings only
    } else this.el.interact.style.display = 'none';
  }
  banner(title, text, seconds = 6) {
    this.el['banner-title'].textContent = title;
    this.el['banner-text'].textContent = text;
    this.el.banner.style.display = 'block';
    this.bannerTimer = seconds;
  }
  toast(text, seconds = 3) {
    this.el.toast.textContent = text;
    this.el.toast.style.display = 'block';
    this.toastTimer = seconds;
  }
  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.style.display = 'none';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.display = 'none';
    }
  }
  showStart(canContinue) {
    this.el['start-screen'].style.display = 'flex';
    this.el['continue-btn'].style.display = canContinue ? 'inline-block' : 'none';
  }
  hideStart() { this.el['start-screen'].style.display = 'none'; }
  showPause(v) { this.el['pause-screen'].style.display = v ? 'flex' : 'none'; }
  showEnd(title, text) {
    this.el['end-title'].textContent = title;
    this.el['end-text'].textContent = text;
    this.el['end-screen'].style.display = 'flex';
  }
  hideEnd() { this.el['end-screen'].style.display = 'none'; }

  // World -> minimap coords. The mapped window (-316..404) covers the
  // whole city plus the pier tip at z = 392.
  mmX(x, size) { return ((x + 316) / 720) * size; }
  mmY(z, size) { return ((z + 316) / 720) * size; }

  drawMinimap(state) {
    const g = this.mm;
    const size = this.el.minimap.width;
    g.clearRect(0, 0, size, size);
    // Background: city land, beach, sea.
    g.fillStyle = '#3d4a42';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#e8c98a';
    g.fillRect(0, this.mmY(272, size), size, this.mmY(306, size) - this.mmY(272, size));
    g.fillStyle = '#0e7d86';
    g.fillRect(0, this.mmY(306, size), size, size - this.mmY(306, size));
    // Roads.
    g.strokeStyle = '#22252b';
    g.lineWidth = Math.max(2, size * 0.016);
    for (const c of this.centers) {
      g.beginPath();
      g.moveTo(this.mmX(c, size), this.mmY(-272, size));
      g.lineTo(this.mmX(c, size), this.mmY(272, size));
      g.stroke();
      g.beginPath();
      g.moveTo(this.mmX(-272, size), this.mmY(c, size));
      g.lineTo(this.mmX(272, size), this.mmY(c, size));
      g.stroke();
    }
    // Pier.
    g.strokeStyle = '#9a7448';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(this.mmX(0, size), this.mmY(280, size));
    g.lineTo(this.mmX(0, size), this.mmY(392, size));
    g.stroke();
    // Café Azul.
    g.fillStyle = '#37e6ff';
    g.beginPath();
    g.arc(this.mmX(216, size), this.mmY(227, size), 3.4, 0, Math.PI * 2);
    g.fill();
    // Mission target: pulsing gold dot.
    if (state.target) {
      const pulse = 3.4 + Math.sin(state.time * 5) * 1.1;
      g.fillStyle = '#ffc93c';
      g.beginPath();
      g.arc(this.mmX(state.target.x, size), this.mmY(state.target.z, size), pulse, 0, Math.PI * 2);
      g.fill();
    }
    // Traffic: pale dots. Police: flashing red/blue dots.
    g.fillStyle = '#cfd6dd';
    for (const c of state.traffic) {
      g.fillRect(this.mmX(c.x, size) - 1.6, this.mmY(c.z, size) - 1.6, 3.2, 3.2);
    }
    const flash = Math.sin(state.time * 10) > 0;
    for (const c of state.police) {
      g.fillStyle = flash ? '#ff3344' : '#4488ff';
      g.beginPath();
      g.arc(this.mmX(c.x, size), this.mmY(c.z, size), 3, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow at centre-ish (world-mapped), rotated by heading.
    const px = this.mmX(state.player.x, size);
    const py = this.mmY(state.player.z, size);
    g.save();
    g.translate(px, py);
    g.rotate(-state.playerHeading);
    g.fillStyle = state.inCar ? '#ffd93d' : '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.4, 5);
    g.lineTo(0, 2.6);
    g.lineTo(-4.4, 5);
    g.closePath();
    g.fill();
    g.restore();
    // Frame.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, size - 2, size - 2);
    void WORLD;
  }
}
