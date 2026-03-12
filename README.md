# 4-Room Top-Down Game

A small browser game inspired by classic top-down adventures. You explore a 2x2 grid of rooms, defeat demon enemies with a fireball or sword, and win once all demons are slain.

## Controls

- **Movement**: Arrow keys or `WASD`
- **Attack**: `Space`
- **Switch weapon**: `S` (toggles between **Fireball** and **Sword**)

## Rules

- **Player health**: 10 HP
- **Enemy health**: 10 HP each
- **Fireball damage**: 4 HP per hit
- **Sword damage**: 2 HP per hit
- Touching demons damages the player.
- You **win** when all demons in all four rooms are defeated.
- You **lose** when your health reaches 0.

## Rooms and doors

- There are **4 rooms** arranged in a 2x2 grid.
- Each room has doors only where it has neighboring rooms:
  - Top/bottom for vertical neighbors
  - Left/right for horizontal neighbors
- When you walk through a door, the view snaps to the new room (the canvas always shows the current room centered).

## Obstacles

- Each room has solid obstacles (cubes/walls).
- Player movement and fireballs are blocked by obstacles.

## Running the game

You can either open `index.html` directly or run a tiny dev server:

### Option 1: Open directly

1. Open the `index.html` file in a modern browser (Chrome, Edge, Firefox).

### Option 2: Run with Node (optional)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start a local server:

   ```bash
   npm start
   ```

3. Open the printed URL (usually `http://localhost:3000` or `http://localhost:5000`) in your browser.

