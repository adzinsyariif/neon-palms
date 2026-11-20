// NEON PALMS: Palmera City — central tuning and world constants.
// Every other module imports from here so the whole city can be rebalanced
// from one place: layout, palette, physics, wanted tuning and mission data.

export const WORLD = {
  grid: 10,            // blocks per side
  block: 40,           // building block size (metres)
  road: 14,            // road width
  get pitch() { return this.block + this.road; },
  get half() { return (this.grid * this.pitch) / 2; }, // 270
  beachZ: 284,         // sand starts just south of the last road
  seaZ: 306,           // waterline
  seaEnd: 520,         // far edge of the sea plane
  pierX: 0,            // pier runs south from the coast road at x = 0
  pierEndZ: 392,
  groundY: 0,
};

// Road centre coordinates: grid+1 roads each way, from -270 to +270.
export function roadCenters() {
  const out = [];
  for (let i = 0; i <= WORLD.grid; i++) out.push(-WORLD.half + i * WORLD.pitch);
  return out;
}

// Café Azul sits on the south-east corner block near the beach: the hub
// where Marina Solano picks up every job from Dario Venn.
export const CAFE = { x: 216, z: 243, name: 'Café Azul' };
export const PIER_TIP = { x: 0, z: 384 };

export const PALETTE = {
  skyTop: 0x2b4a7a,
  skyMid: 0xe2703a,
  skyLow: 0xffc46b,
  fog: 0xf2a56b,
  sun: 0xffd9a0,
  sunIntensity: 2.6,
  ambient: 0xffe0b8,
  sea: 0x0e7d86,
  seaDeep: 0x0a5a66,
  sand: 0xe8c98a,
  road: 0x33363d,
  roadLine: 0xf5d76e,
  sidewalk: 0x9a958c,
  grass: 0x5f9e5a,
  palmTrunk: 0x8a6a44,
  palmLeaf: 0x2e8b57,
  lampGlow: 0xffca7a,
  marker: 0x37e6ff,
  markerGold: 0xffc93c,
  policeBody: 0xf2f2f2,
  policeStripe: 0x1c3f8f,
};

export const PLAYER = {
  walkSpeed: 6.2,
  runSpeed: 10.5,
  radius: 0.55,
  height: 1.75,
  maxHealth: 100,
  startCash: 40,
  startPos: { x: 196, z: 262 }, // on the coast road, a short walk from Café Azul
};

export const CAR = {
  accel: 16,
  brake: 26,
  reverseAccel: 9,
  maxSpeed: 34,
  maxReverse: 11,
  turnRate: 1.9,
  grip: 7.5,
  radius: 1.35,
  trafficSpeed: 11,
  policeSpeed: 15.5,
};

export const WANTED = {
  decayDelay: 9,       // seconds hidden before stars start dropping
  decayEvery: 7,       // seconds per star while hidden
  bustRadius: 3.2,     // police this close + slow player = bust progress
  bustTime: 2.4,       // seconds of pinning to get busted
  sightRange: 55,
};

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 26;
export const POLICE_MAX = 5;

// Mission definitions. Positions are filled with named places so the story
// reads as a tour of Palmera: café, north-west towers, the pier, the market.
export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Dario Venn',
    intro: 'Marina! Café Azul needs its courier back. Grab any car and get over here — the blue marker is home.',
    objective: 'Take a car and drive to Café Azul',
    reward: 120,
    type: 'reach-cafe',
  },
  {
    id: 'hot-delivery',
    title: 'Hot Delivery',
    giver: 'Dario Venn',
    intro: 'A catering box for the tower crew up north-west. It is still warm — keep it that way. Ninety seconds.',
    objective: 'Deliver the package to the north-west tower',
    reward: 260,
    type: 'timed-reach',
    timeLimit: 90,
    target: { x: -243, z: -243 },
  },
  {
    id: 'heat',
    title: 'Heat',
    giver: 'Dario Venn',
    intro: 'That delivery ruffled feathers. Palmera PD is all over you — lose the heat, then come home.',
    objective: 'Shake a 3-star wanted level, then return to Café Azul',
    reward: 320,
    type: 'shake-heat',
    stars: 3,
  },
  {
    id: 'three-envelopes',
    title: 'Three Envelopes',
    giver: 'Dario Venn',
    intro: 'Three envelopes, three drops around town. On foot or by car — just bring back the receipts.',
    objective: 'Collect all 3 envelopes',
    reward: 420,
    type: 'collect',
    pickups: [
      { x: -108, z: 108 },
      { x: 108, z: -54 },
      { x: -54, z: -216 },
    ],
  },
  {
    id: 'last-ferry',
    title: 'Last Ferry',
    giver: 'Dario Venn',
    intro: 'Last one, Marina. The ferry leaves the pier in seventy-five seconds. Do not let it leave without this manifest.',
    objective: 'Reach the end of the pier before the ferry leaves',
    reward: 600,
    type: 'timed-reach',
    timeLimit: 75,
    target: { x: PIER_TIP.x, z: PIER_TIP.z },
  },
];

export const STORY_COMPLETE_TEXT =
  'Story complete — Palmera is yours. Cash pickups still spawn around town. Free roam!';

export const SAVE_KEY = 'neon-palms-save-v1';

export const DIALOGUE = {
  start: 'Dario Venn: Marina Solano, best courier in Palmera. Ready to work?',
  busted: 'Palmera PD: That is far enough, Marina.',
  wasted: 'The golden hour fades… but Palmera always gives you another run.',
  carjack: 'You borrowed a car. The owner may disagree.',
  freeRoam: 'Dario Venn: Café Azul is always open for you, Marina.',
};
