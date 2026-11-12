// Grid helpers: movement rules, BFS (Dijkstra with unit costs), A*, lines.

export const DIRS = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export function isDoor(t) {
  return t === 'door_open' || t === 'door_closed';
}

/** Tiles a walker can stand on (closed doors count: walking into them opens them). */
export function isWalkable(t) {
  return t === 'floor' || t === 'door_open' || t === 'stairs_down' || t === 'fungus';
}

export function isPassableOrDoor(t) {
  return isWalkable(t) || t === 'door_closed';
}

/** No diagonal steps into or out of doorways. */
export function diagonalOk(tiles, from, to, dx, dy) {
  if (dx === 0 || dy === 0) return true;
  return !isDoor(tiles[from]) && !isDoor(tiles[to]);
}

/**
 * Breadth-first distance map from (sx, sy). passable(i) decides which tiles
 * may be entered. Returns Int32Array with -1 for unreachable.
 */
export function bfs(width, height, tiles, sx, sy, passable) {
  const n = width * height;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const s = sy * width + sx;
  dist[s] = 0;
  queue[tail++] = s;
  while (head < tail) {
    const i = queue[head++];
    const x = i % width, y = (i - x) / width;
    const d = dist[i] + 1;
    for (let k = 0; k < 8; k++) {
      const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (dist[j] !== -1 || !passable(j)) continue;
      if (!diagonalOk(tiles, i, j, DIRS[k][0], DIRS[k][1])) continue;
      dist[j] = d;
      queue[tail++] = j;
    }
  }
  return dist;
}

/**
 * A* over an 8-connected grid. cost(i) returns the step cost into tile i or
 * Infinity if blocked. The goal tile is always enterable if goalAlways.
 * Returns an array of tile indices from the first step to the goal, or null.
 */
export function astar(width, height, tiles, sx, sy, tx, ty, cost, { goalAlways = false, maxNodes = 5000 } = {}) {
  const n = width * height;
  const start = sy * width + sx, goal = ty * width + tx;
  if (start === goal) return [];
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = []; // [f, idx]
  const push = (f, i) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (i) => {
    const x = i % width, y = (i - x) / width;
    return Math.max(Math.abs(x - tx), Math.abs(y - ty));
  };
  g[start] = 0;
  push(h(start), start);
  let expanded = 0;
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    if (i === goal) break;
    closed[i] = 1;
    if (++expanded > maxNodes) return null;
    const x = i % width, y = (i - x) / width;
    for (let k = 0; k < 8; k++) {
      const dx = DIRS[k][0], dy = DIRS[k][1];
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (closed[j]) continue;
      let c = j === goal && goalAlways ? 1 : cost(j);
      if (!(c < Infinity)) continue;
      if (!diagonalOk(tiles, i, j, dx, dy)) continue;
      // tiny diagonal penalty for prettier paths
      if (dx !== 0 && dy !== 0) c += 0.001;
      const ng = g[i] + c;
      if (ng < g[j]) {
        g[j] = ng;
        came[j] = i;
        push(ng + h(j), j);
      }
    }
  }
  if (came[goal] === -1) return null;
  const path = [];
  for (let i = goal; i !== start; i = came[i]) path.push(i);
  return path.reverse();
}

/** Bresenham line from (x0,y0) to (x1,y1), excluding the start. */
export function line(x0, y0, x1, y1) {
  const pts = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    pts.push({ x, y });
  }
  return pts;
}

/** Ray from (x0,y0) through (x1,y1) continuing up to `range` steps. */
export function ray(x0, y0, x1, y1, range) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.max(Math.abs(dx), Math.abs(dy));
  if (len === 0) return [];
  // repeat the exact step pattern of the line to the target, so the ray
  // always passes through the chosen target tile
  const base = line(x0, y0, x1, y1);
  const pts = [];
  for (let k = 0; pts.length < range; k++) {
    for (const p of base) {
      if (pts.length >= range) break;
      pts.push({ x: p.x + dx * k, y: p.y + dy * k });
    }
  }
  return pts;
}

export function cheb(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
