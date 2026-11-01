export type InputState = { left: boolean; right: boolean; jump: boolean };
export type PlayerState = {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; grounded: boolean; jumpLock: boolean;
};
export type Rect = { x: number; y: number; w: number; h: number };
export type Level = {
  name: string; hint: string; platforms: Rect[]; pads?: [number, number];
  key?: { x: number; y: number }; gateX?: number; goalX: number;
  moving?: Rect;
};
export type WorldState = {
  level: number; players: [PlayerState, PlayerState]; keyTaken: boolean;
  gateOpen: boolean; padCharge: number; tick: number; complete: boolean;
};

export const WIDTH = 960;
export const HEIGHT = 540;
const FLOOR = 492;
const GRAVITY = 1550;
const MOVE_SPEED = 285;
const JUMP_SPEED = 625;

export const LEVELS: Level[] = [
  {
    name: 'A friendly start',
    hint: 'Find the golden key, then meet at the exit.',
    platforms: [
      { x: 0, y: FLOOR, w: WIDTH, h: 48 },
      { x: 205, y: 412, w: 145, h: 18 },
      { x: 425, y: 345, w: 150, h: 18 },
      { x: 665, y: 408, w: 130, h: 18 }
    ],
    key: { x: 725, y: 375 }, goalX: 900
  },
  {
    name: 'Two little switches',
    hint: 'Stand on both floor switches at the same time to open the gate.',
    platforms: [{ x: 0, y: FLOOR, w: WIDTH, h: 48 }],
    pads: [260, 630], gateX: 812, goalX: 900
  },
  {
    name: 'The stepping stones',
    hint: 'Climb the floating steps together and grab the key up high.',
    platforms: [
      { x: 0, y: FLOOR, w: WIDTH, h: 48 },
      { x: 170, y: 420, w: 115, h: 16 },
      { x: 345, y: 350, w: 115, h: 16 },
      { x: 525, y: 285, w: 120, h: 16 },
      { x: 710, y: 355, w: 125, h: 16 }
    ],
    key: { x: 575, y: 250 }, goalX: 900
  },
  {
    name: 'One last team-up',
    hint: 'Both players must reach the exit. No one gets left behind!',
    platforms: [
      { x: 0, y: FLOOR, w: WIDTH, h: 48 },
      { x: 250, y: 420, w: 135, h: 16 },
      { x: 475, y: 355, w: 135, h: 16 },
      { x: 690, y: 420, w: 135, h: 16 }
    ],
    pads: [390, 570], gateX: 812, goalX: 900
  }
];

function makePlayer(x: number): PlayerState {
  return { x, y: FLOOR - 48, vx: 0, vy: 0, w: 34, h: 48, grounded: true, jumpLock: false };
}

export function makeWorld(): WorldState {
  return {
    level: 0,
    players: [makePlayer(90), makePlayer(150)],
    keyTaken: false, gateOpen: false, padCharge: 0, tick: 0, complete: false
  };
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function respawn(player: PlayerState, index: number) {
  player.x = index === 0 ? 90 : 150;
  player.y = FLOOR - player.h;
  player.vx = 0; player.vy = 0; player.grounded = true; player.jumpLock = false;
}

function updatePlayer(player: PlayerState, input: InputState, platforms: Rect[], index: number, gate?: Rect) {
  const accel = input.left === input.right ? 0 : input.left ? -1 : 1;
  player.vx = accel * MOVE_SPEED;
  if (input.jump && player.grounded && !player.jumpLock) {
    player.vy = -JUMP_SPEED;
    player.grounded = false;
    player.jumpLock = true;
  }
  if (!input.jump) player.jumpLock = false;
  const oldY = player.y;
  const previousX = player.x;
  player.x += player.vx / 60;
  player.x = Math.max(0, Math.min(WIDTH - player.w, player.x));
  if (gate && player.y + player.h > gate.y && player.y < gate.y + gate.h &&
      player.x + player.w > gate.x && player.x < gate.x + gate.w) {
    if (previousX + player.w <= gate.x) player.x = gate.x - player.w;
    else if (previousX >= gate.x + gate.w) player.x = gate.x + gate.w;
  }
  player.vy += GRAVITY / 60;
  player.y += player.vy / 60;
  player.grounded = false;

  const solids = gate ? [...platforms, gate] : platforms;
  for (const platform of solids) {
    const horizontal = player.x + player.w > platform.x && player.x < platform.x + platform.w;
    if (!horizontal) continue;
    if (player.vy >= 0 && oldY + player.h <= platform.y + 7 && player.y + player.h >= platform.y) {
      player.y = platform.y - player.h;
      player.vy = 0;
      player.grounded = true;
    } else if (player.vy < 0 && oldY >= platform.y + platform.h - 2 && player.y <= platform.y + platform.h) {
      player.y = platform.y + platform.h;
      player.vy = 0;
    }
  }
  if (player.y > HEIGHT + 80) respawn(player, index);
}

export function stepWorld(world: WorldState, inputs: [InputState, InputState]): WorldState {
  if (world.complete) return world;
  const next: WorldState = {
    ...world,
    players: world.players.map(p => ({ ...p })) as [PlayerState, PlayerState],
    tick: world.tick + 1
  };
  const level = LEVELS[next.level];
  const gate = level.gateX !== undefined && !next.gateOpen
    ? { x: level.gateX, y: FLOOR - 132, w: 24, h: 132 }
    : undefined;
  for (let i = 0; i < 2; i++) updatePlayer(next.players[i], inputs[i], level.platforms, i, gate);

  if (level.key && !next.keyTaken) {
    const keyBox = { x: level.key.x - 13, y: level.key.y - 15, w: 26, h: 30 };
    if (next.players.some(p => overlaps({ x: p.x, y: p.y, w: p.w, h: p.h }, keyBox))) next.keyTaken = true;
  }

  if (level.pads) {
    const active = level.pads.map(px => next.players.some(p =>
      Math.abs((p.x + p.w / 2) - px) < 36 && p.grounded && p.y + p.h >= FLOOR - 4
    ));
    if (active[0] && active[1]) next.padCharge = Math.min(1, next.padCharge + 1 / 60);
    else next.padCharge = Math.max(0, next.padCharge - 1.8 / 60);
    if (next.padCharge >= 0.75) next.gateOpen = true;
  }

  const needsKey = Boolean(level.key);
  const canExit = (!needsKey || next.keyTaken) && (!level.gateX || next.gateOpen);
  if (canExit && next.players.every(p => p.x + p.w / 2 > level.goalX - 70)) {
    if (next.level >= LEVELS.length - 1) next.complete = true;
    else {
      next.level += 1;
      next.players = [makePlayer(90), makePlayer(150)];
      next.keyTaken = false; next.gateOpen = false; next.padCharge = 0;
    }
  }
  return next;
}

export const emptyInput = (): InputState => ({ left: false, right: false, jump: false });
