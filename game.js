"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// HUD elements
const playerHealthValueEl = document.getElementById("player-health-value");
const weaponValueEl = document.getElementById("weapon-value");
const enemiesValueEl = document.getElementById("enemies-value");
const overlayEl = document.getElementById("message-overlay");
const messageTextEl = document.getElementById("message-text");
const restartButton = document.getElementById("restart-button");

const ROOM_WIDTH = 640;
const ROOM_HEIGHT = 480;
const ROOM_MARGIN_X = (canvas.width - ROOM_WIDTH) / 2;
const ROOM_MARGIN_Y = (canvas.height - ROOM_HEIGHT) / 2;

const PLAYER_SPEED = 2.4;
const PLAYER_SIZE = 32;
const PLAYER_MAX_HP = 10;

// Hero sprite sheet for the player
const heroImage = new Image();
heroImage.src = "radiyya original sprite sheet 32x32.png"; // must match file name exactly

// Sprite sheet layout: 7 columns x 3 rows (Down, Left, Right), 32x32 each
const HERO_FRAME_WIDTH = 32;
const HERO_FRAME_HEIGHT = 32;

// 7 frames per direction: [0]=idle, [1..3]=walk, [4..6]=attack
const HERO_FRAMES_PER_DIRECTION = 7;

// rows: 0 = DOWN, 1 = LEFT, 2 = RIGHT
// no dedicated UP row, so reuse DOWN art for UP
const HERO_DIRECTION_ROW = {
  down: 0,
  left: 1,
  right: 2,
  up: 0,
};

// indices for movement animation
const HERO_IDLE_FRAME = 0;
const HERO_WALK_START_FRAME = 1;
const HERO_WALK_END_FRAME = 3;

const ENEMY_SIZE = 24;
const ENEMY_MAX_HP = 10;
const ENEMY_SPEED = 1.0;

const FIREBALL_SPEED = 5;
const FIREBALL_SIZE = 10;
// Damage values & sword geometry
const FIREBALL_DAMAGE = 5; // each fireball hit
const SWORD_DAMAGE = 10;   // each sword hit
const SWORD_RANGE = PLAYER_SIZE; // sword length roughly equals player size
const SWORD_ARC = Math.PI / 2;   // 180° total swing (±90° from facing)
const SWORD_SWING_DURATION = 12; // frames for full swing animation

const WEAPON_FIREBALL = "fireball";
const WEAPON_SWORD = "sword";

// 2x2 grid of rooms: indices 0..3
// layout:
// [0] [1]
// [2] [3]
const ROOMS = [
  { id: 0, neighbors: { right: 1, down: 2 } },
  { id: 1, neighbors: { left: 0, down: 3 } },
  { id: 2, neighbors: { up: 0, right: 3 } },
  { id: 3, neighbors: { up: 1, left: 2 } },
];

let keys = {};

class Entity {
  constructor(x, y, size, color) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.color = color;
  }

  get half() {
    return this.size / 2;
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(
      this.x - this.half,
      this.y - this.half,
      this.size,
      this.size
    );
  }
}

class Player extends Entity {
  constructor(x, y) {
    super(x, y, PLAYER_SIZE, "#4caf50");
    this.hp = PLAYER_MAX_HP;
    this.weapon = WEAPON_FIREBALL;
    this.facingAngle = 0; // radians
    this.currentRoom = 0;
    this.attackCooldown = 0;
    this.swordSwingTimer = 0; // counts down while sword is visually swinging
    this.direction = "down"; // for sprite: "up" | "down" | "left" | "right"
    this.animFrame = 0;
    this.animTimer = 0;
  }

  reset(x, y, roomId) {
    this.x = x;
    this.y = y;
    this.hp = PLAYER_MAX_HP;
    this.weapon = WEAPON_FIREBALL;
    this.facingAngle = 0;
    this.currentRoom = roomId;
    this.attackCooldown = 0;
    this.swordSwingTimer = 0;
    this.direction = "down";
    this.animFrame = 0;
    this.animTimer = 0;
  }
}

class Enemy extends Entity {
  constructor(x, y, roomId) {
    super(x, y, ENEMY_SIZE, "#e53935");
    this.hp = ENEMY_MAX_HP;
    this.roomId = roomId;
    this.hitFlashTimer = 0;
  }

  draw() {
    if (this.hitFlashTimer > 0) {
      ctx.fillStyle = "#ffffff";
      this.hitFlashTimer--;
    } else {
      ctx.fillStyle = this.color;
    }
    ctx.fillRect(
      this.x - this.half,
      this.y - this.half,
      this.size,
      this.size
    );
  }
}

class Projectile extends Entity {
  constructor(x, y, vx, vy, roomId) {
    super(x, y, FIREBALL_SIZE, "#ffca28");
    this.vx = vx;
    this.vy = vy;
    this.roomId = roomId;
    this.alive = true;
  }

  update(obstacles) {
    this.x += this.vx;
    this.y += this.vy;

    // Stop if outside room bounds
    if (
      this.x - this.half < ROOM_MARGIN_X ||
      this.x + this.half > ROOM_MARGIN_X + ROOM_WIDTH ||
      this.y - this.half < ROOM_MARGIN_Y ||
      this.y + this.half > ROOM_MARGIN_Y + ROOM_HEIGHT
    ) {
      this.alive = false;
      return;
    }

    // Collide with obstacles
    for (const ob of obstacles) {
      if (rectIntersect(this, ob)) {
        this.alive = false;
        return;
      }
    }
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.half, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rectIntersect(a, b) {
  return !(
    a.x + a.half <= b.x - b.half ||
    a.x - a.half >= b.x + b.half ||
    a.y + a.half <= b.y - b.half ||
    a.y - a.half >= b.y + b.half
  );
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Obstacles per room: array of {x,y,size}
const roomObstacles = new Map();

function createObstacle(x, y, size) {
  return { x, y, size, get half() { return size / 2; } };
}

function setupRoomObstacles() {
  roomObstacles.clear();

  // Room 0: some central blocks and side walls
  roomObstacles.set(0, [
    createObstacle(ROOM_MARGIN_X + ROOM_WIDTH / 2 - 60, ROOM_MARGIN_Y + ROOM_HEIGHT / 2, 40),
    createObstacle(ROOM_MARGIN_X + ROOM_WIDTH / 2 + 60, ROOM_MARGIN_Y + ROOM_HEIGHT / 2, 40),
  ]);

  // Room 1: horizontal line of cubes
  roomObstacles.set(1, [
    createObstacle(ROOM_MARGIN_X + ROOM_WIDTH / 2 - 80, ROOM_MARGIN_Y + ROOM_HEIGHT / 2 - 40, 32),
    createObstacle(ROOM_MARGIN_X + ROOM_WIDTH / 2, ROOM_MARGIN_Y + ROOM_HEIGHT / 2, 32),
    createObstacle(ROOM_MARGIN_X + ROOM_WIDTH / 2 + 80, ROOM_MARGIN_Y + ROOM_HEIGHT / 2 + 40, 32),
  ]);

  // Room 2: vertical wall with a gap
  roomObstacles.set(2, [
    createObstacle(ROOM_MARGIN_X + ROOM_WIDTH / 2 - 20, ROOM_MARGIN_Y + ROOM_HEIGHT / 2 - 100, 30),
    createObstacle(ROOM_MARGIN_X + ROOM_WIDTH / 2 - 20, ROOM_MARGIN_Y + ROOM_HEIGHT / 2 + 100, 30),
  ]);

  // Room 3: scattered cubes
  roomObstacles.set(3, [
    createObstacle(ROOM_MARGIN_X + 150, ROOM_MARGIN_Y + 200, 30),
    createObstacle(ROOM_MARGIN_X + 450, ROOM_MARGIN_Y + 260, 30),
    createObstacle(ROOM_MARGIN_X + 350, ROOM_MARGIN_Y + 120, 30),
  ]);
}

let player = new Player(
  ROOM_MARGIN_X + ROOM_WIDTH / 2,
  ROOM_MARGIN_Y + ROOM_HEIGHT / 2
);

let enemies = [];
let projectiles = [];
let isGameOver = false;
let victory = false;

function setupEnemies() {
  enemies = [];

  // Room 0
  enemies.push(new Enemy(ROOM_MARGIN_X + 160, ROOM_MARGIN_Y + 160, 0));
  enemies.push(new Enemy(ROOM_MARGIN_X + 480, ROOM_MARGIN_Y + 200, 0));

  // Room 1
  enemies.push(new Enemy(ROOM_MARGIN_X + 220, ROOM_MARGIN_Y + 180, 1));
  enemies.push(new Enemy(ROOM_MARGIN_X + 440, ROOM_MARGIN_Y + 300, 1));

  // Room 2
  enemies.push(new Enemy(ROOM_MARGIN_X + 220, ROOM_MARGIN_Y + 320, 2));

  // Room 3
  enemies.push(new Enemy(ROOM_MARGIN_X + 520, ROOM_MARGIN_Y + 260, 3));
  enemies.push(new Enemy(ROOM_MARGIN_X + 320, ROOM_MARGIN_Y + 200, 3));
}

function resetGame() {
  setupRoomObstacles();
  setupEnemies();
  const startX = ROOM_MARGIN_X + ROOM_WIDTH / 2;
  const startY = ROOM_MARGIN_Y + ROOM_HEIGHT / 2;
  player.reset(startX, startY, 0);
  projectiles = [];
  isGameOver = false;
  victory = false;
  overlayEl.classList.add("hidden");
  updateHUD();
}

function updateHUD() {
  playerHealthValueEl.textContent = player.hp.toString();
  weaponValueEl.textContent =
    player.weapon === WEAPON_FIREBALL ? "Fireball" : "Sword";
  const aliveEnemies = enemies.filter((e) => e.hp > 0).length;
  enemiesValueEl.textContent = aliveEnemies.toString();
}

document.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;

  if (e.key === " " || e.code === "Space") {
    if (!isGameOver) {
      attemptAttack();
    }
    e.preventDefault();
  }

  if (e.key.toLowerCase() === "s") {
    if (!isGameOver) {
      toggleWeapon();
    }
    e.preventDefault();
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

restartButton.addEventListener("click", () => {
  resetGame();
});

function toggleWeapon() {
  player.weapon =
    player.weapon === WEAPON_FIREBALL ? WEAPON_SWORD : WEAPON_FIREBALL;
  updateHUD();
}

function attemptAttack() {
  if (player.attackCooldown > 0) return;

  if (player.weapon === WEAPON_FIREBALL) {
    // Fire a projectile in facing direction
    const angle = player.facingAngle;
    const vx = Math.cos(angle) * FIREBALL_SPEED;
    const vy = Math.sin(angle) * FIREBALL_SPEED;
    const px = player.x + Math.cos(angle) * (player.half + FIREBALL_SIZE);
    const py = player.y + Math.sin(angle) * (player.half + FIREBALL_SIZE);
    const proj = new Projectile(px, py, vx, vy, player.currentRoom);
    projectiles.push(proj);
    player.attackCooldown = 18;
  } else if (player.weapon === WEAPON_SWORD) {
    performSwordAttack();
    player.attackCooldown = 16;
    player.swordSwingTimer = SWORD_SWING_DURATION;
  }
}

function performSwordAttack() {
  const angle = player.facingAngle;

  enemies.forEach((enemy) => {
    if (enemy.roomId !== player.currentRoom || enemy.hp <= 0) return;

    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > player.half + SWORD_RANGE + enemy.half) return;

    const enemyAngle = Math.atan2(dy, dx);
    let diff = enemyAngle - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    if (Math.abs(diff) <= SWORD_ARC) {
      enemy.hp -= SWORD_DAMAGE;
      enemy.hitFlashTimer = 6;
    }
  });
}

function updatePlayerMovement() {
  let moveX = 0;
  let moveY = 0;

  if (keys["arrowup"]) moveY -= 1;
  if (keys["arrowdown"]) moveY += 1;
  if (keys["arrowleft"]) moveX -= 1;
  if (keys["arrowright"]) moveX += 1;

  let isMoving = false;

  if (moveX !== 0 || moveY !== 0) {
    isMoving = true;
    const len = Math.hypot(moveX, moveY);
    moveX /= len;
    moveY /= len;
    player.facingAngle = Math.atan2(moveY, moveX);

    // choose a cardinal direction for the sprite based on movement
    if (Math.abs(moveX) > Math.abs(moveY)) {
      player.direction = moveX > 0 ? "right" : "left";
    } else {
      player.direction = moveY > 0 ? "down" : "up";
    }
  }

  // simple walk animation: use frames 1–3 for walking, frame 0 for idle
  if (isMoving) {
    player.animTimer++;
    if (player.animTimer >= 8) {
      player.animTimer = 0;

      // if not already in the walk range, jump to first walk frame
      if (
        player.animFrame < HERO_WALK_START_FRAME ||
        player.animFrame > HERO_WALK_END_FRAME
      ) {
        player.animFrame = HERO_WALK_START_FRAME;
      } else {
        player.animFrame++;
        if (player.animFrame > HERO_WALK_END_FRAME) {
          player.animFrame = HERO_WALK_START_FRAME;
        }
      }
    }
  } else {
    player.animFrame = HERO_IDLE_FRAME;
    player.animTimer = 0;
  }

  const speed = PLAYER_SPEED;
  const obstacles = roomObstacles.get(player.currentRoom) || [];

  // Move X with collision
  let newX = player.x + moveX * speed;
  newX = clamp(
    newX,
    ROOM_MARGIN_X + player.half,
    ROOM_MARGIN_X + ROOM_WIDTH - player.half
  );
  const oldX = player.x;
  player.x = newX;
  for (const ob of obstacles) {
    if (rectIntersect(player, ob)) {
      player.x = oldX;
      break;
    }
  }

  // Move Y with collision
  let newY = player.y + moveY * speed;
  newY = clamp(
    newY,
    ROOM_MARGIN_Y + player.half,
    ROOM_MARGIN_Y + ROOM_HEIGHT - player.half
  );
  const oldY = player.y;
  player.y = newY;
  for (const ob of obstacles) {
    if (rectIntersect(player, ob)) {
      player.y = oldY;
      break;
    }
  }

  handleRoomTransitions();
}

function handleRoomTransitions() {
  const room = ROOMS[player.currentRoom];

  const leftDoorY = ROOM_MARGIN_Y + ROOM_HEIGHT / 2;
  const rightDoorY = leftDoorY;
  const topDoorX = ROOM_MARGIN_X + ROOM_WIDTH / 2;
  const bottomDoorX = topDoorX;

  const doorThickness = 60; // vertical extent for side doors, horizontal for top/bottom

  // Left door
  if (
    room.neighbors.left !== undefined &&
    player.x - player.half <= ROOM_MARGIN_X + 4 &&
    Math.abs(player.y - leftDoorY) <= doorThickness / 2
  ) {
    player.currentRoom = room.neighbors.left;
    player.x = ROOM_MARGIN_X + ROOM_WIDTH - player.half - 10;
    player.y = leftDoorY;
  }

  // Right door
  if (
    room.neighbors.right !== undefined &&
    player.x + player.half >= ROOM_MARGIN_X + ROOM_WIDTH - 4 &&
    Math.abs(player.y - rightDoorY) <= doorThickness / 2
  ) {
    player.currentRoom = room.neighbors.right;
    player.x = ROOM_MARGIN_X + player.half + 10;
    player.y = rightDoorY;
  }

  // Top door
  if (
    room.neighbors.up !== undefined &&
    player.y - player.half <= ROOM_MARGIN_Y + 4 &&
    Math.abs(player.x - topDoorX) <= doorThickness / 2
  ) {
    player.currentRoom = room.neighbors.up;
    player.y = ROOM_MARGIN_Y + ROOM_HEIGHT - player.half - 10;
    player.x = topDoorX;
  }

  // Bottom door
  if (
    room.neighbors.down !== undefined &&
    player.y + player.half >= ROOM_MARGIN_Y + ROOM_HEIGHT - 4 &&
    Math.abs(player.x - bottomDoorX) <= doorThickness / 2
  ) {
    player.currentRoom = room.neighbors.down;
    player.y = ROOM_MARGIN_Y + player.half + 10;
    player.x = bottomDoorX;
  }
}

function updateEnemies() {
  enemies.forEach((enemy) => {
    if (enemy.hp <= 0 || enemy.roomId !== player.currentRoom) return;

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const vx = (dx / dist) * ENEMY_SPEED;
      const vy = (dy / dist) * ENEMY_SPEED;
      const obstacles = roomObstacles.get(enemy.roomId) || [];

      const oldX = enemy.x;
      enemy.x += vx;
      for (const ob of obstacles) {
        if (rectIntersect(enemy, ob)) {
          enemy.x = oldX;
          break;
        }
      }

      const oldY = enemy.y;
      enemy.y += vy;
      for (const ob of obstacles) {
        if (rectIntersect(enemy, ob)) {
          enemy.y = oldY;
          break;
        }
      }
    }

    // Damage player on contact
    if (rectIntersect(enemy, player)) {
      player.hp = Math.max(0, player.hp - 1);
      if (player.hp <= 0) {
        isGameOver = true;
        victory = false;
        showEndMessage();
      }
    }
  });
}

function updateProjectiles() {
  const obstacles = roomObstacles.get(player.currentRoom) || [];
  projectiles.forEach((p) => {
    if (!p.alive) return;
    if (p.roomId !== player.currentRoom) return;
    p.update(obstacles);

    // Hit enemies
    enemies.forEach((enemy) => {
      if (!p.alive) return;
      if (enemy.roomId !== p.roomId || enemy.hp <= 0) return;
      if (rectIntersect(p, enemy)) {
        enemy.hp -= FIREBALL_DAMAGE;
        enemy.hitFlashTimer = 6;
        p.alive = false;
      }
    });
  });

  projectiles = projectiles.filter((p) => p.alive);
}

function checkWinCondition() {
  const stillAlive = enemies.some((e) => e.hp > 0);
  if (!stillAlive) {
    isGameOver = true;
    victory = true;
    showEndMessage();
  }
}

function showEndMessage() {
  messageTextEl.textContent = victory
    ? "You defeated all the demons!"
    : "You were slain by the demons.";
  overlayEl.classList.remove("hidden");
}

function drawRoomBackground() {
  // Room bounds
  ctx.fillStyle = "#1b1b26";
  ctx.fillRect(ROOM_MARGIN_X, ROOM_MARGIN_Y, ROOM_WIDTH, ROOM_HEIGHT);

  // Border
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 4;
  ctx.strokeRect(ROOM_MARGIN_X, ROOM_MARGIN_Y, ROOM_WIDTH, ROOM_HEIGHT);

  // Doors (2 per room, to neighbors)
  const room = ROOMS[player.currentRoom];
  ctx.strokeStyle = "#cfd8dc";
  ctx.lineWidth = 6;

  const midX = ROOM_MARGIN_X + ROOM_WIDTH / 2;
  const midY = ROOM_MARGIN_Y + ROOM_HEIGHT / 2;
  const doorHalf = 30;

  // Left door
  if (room.neighbors.left !== undefined) {
    ctx.beginPath();
    ctx.moveTo(ROOM_MARGIN_X, midY - doorHalf);
    ctx.lineTo(ROOM_MARGIN_X, midY + doorHalf);
    ctx.stroke();
  }
  // Right door
  if (room.neighbors.right !== undefined) {
    ctx.beginPath();
    ctx.moveTo(ROOM_MARGIN_X + ROOM_WIDTH, midY - doorHalf);
    ctx.lineTo(ROOM_MARGIN_X + ROOM_WIDTH, midY + doorHalf);
    ctx.stroke();
  }
  // Top door
  if (room.neighbors.up !== undefined) {
    ctx.beginPath();
    ctx.moveTo(midX - doorHalf, ROOM_MARGIN_Y);
    ctx.lineTo(midX + doorHalf, ROOM_MARGIN_Y);
    ctx.stroke();
  }
  // Bottom door
  if (room.neighbors.down !== undefined) {
    ctx.beginPath();
    ctx.moveTo(midX - doorHalf, ROOM_MARGIN_Y + ROOM_HEIGHT);
    ctx.lineTo(midX + doorHalf, ROOM_MARGIN_Y + ROOM_HEIGHT);
    ctx.stroke();
  }
}

function drawObstacles() {
  const obstacles = roomObstacles.get(player.currentRoom) || [];
  ctx.fillStyle = "#607d8b";
  obstacles.forEach((ob) => {
    ctx.fillRect(ob.x - ob.half, ob.y - ob.half, ob.size, ob.size);
  });
}

function drawPlayer() {
  // draw hero sprite instead of a simple square
  if (heroImage.complete && heroImage.naturalWidth > 0) {
    const dirRow = HERO_DIRECTION_ROW[player.direction] ?? 0;
    const frameIndex = player.animFrame % HERO_FRAMES_PER_DIRECTION;

    const sx = frameIndex * HERO_FRAME_WIDTH;
    const sy = dirRow * HERO_FRAME_HEIGHT;

    ctx.drawImage(
      heroImage,
      sx, sy, HERO_FRAME_WIDTH, HERO_FRAME_HEIGHT,
      player.x - player.half,
      player.y - player.half,
      PLAYER_SIZE,
      PLAYER_SIZE
    );
  } else {
    // fallback while image is loading
    player.draw();
  }

  // sword (visual) when swinging: long blade sweeping 180° in front of player
  if (player.weapon === WEAPON_SWORD && player.swordSwingTimer > 0) {
    const t = 1 - player.swordSwingTimer / SWORD_SWING_DURATION; // 0 → 1 over swing
    const startAngle = player.facingAngle - SWORD_ARC; // start on one side
    const endAngle = player.facingAngle + SWORD_ARC;   // end on the other side
    const swingAngle = startAngle + (endAngle - startAngle) * t;

    const bladeLength = SWORD_RANGE;
    const bladeThickness = 6;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(swingAngle);

    // Draw from just outside player body outward
    const startOffset = player.half;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillRect(
      startOffset,              // x (forward from player center)
      -bladeThickness / 2,      // y (centered vertically)
      bladeLength,              // width (length of sword)
      bladeThickness            // height (thickness)
    );

    ctx.restore();
  }
}

function drawEnemies() {
  enemies.forEach((enemy) => {
    if (enemy.roomId !== player.currentRoom || enemy.hp <= 0) return;
    enemy.draw();
  });
}

function drawProjectiles() {
  projectiles.forEach((p) => {
    if (p.roomId !== player.currentRoom && p.alive) return;
    p.draw();
  });
}

function drawUIHints() {
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(
    "Move: Arrow keys | Attack: Space | Switch weapon: S",
    ROOM_MARGIN_X + 12,
    ROOM_MARGIN_Y + ROOM_HEIGHT - 12
  );
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!isGameOver) {
    if (player.attackCooldown > 0) player.attackCooldown--;
    if (player.swordSwingTimer > 0) player.swordSwingTimer--;
    updatePlayerMovement();
    updateEnemies();
    updateProjectiles();
    checkWinCondition();
  }

  drawRoomBackground();
  drawObstacles();
  drawEnemies();
  drawProjectiles();
  drawPlayer();
  drawUIHints();

  updateHUD();

  requestAnimationFrame(gameLoop);
}

// Initialize
resetGame();
requestAnimationFrame(gameLoop);

