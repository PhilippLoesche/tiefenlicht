// Symmetric shadowcasting (after Albert Ford, "Symmetric Shadowcasting").
// Exact integer slope arithmetic, so floor-to-floor visibility is symmetric.

/**
 * @param {number} ox origin x
 * @param {number} oy origin y
 * @param {number} maxDepth maximum Chebyshev distance to scan
 * @param {(x:number,y:number)=>boolean} blocks true if the tile blocks sight (must be true out of bounds)
 * @param {(x:number,y:number)=>void} mark called for every visible tile (may repeat)
 */
export function shadowcast(ox, oy, maxDepth, blocks, mark) {
  mark(ox, oy);
  for (let q = 0; q < 4; q++) {
    const toX = q < 2 ? (r, c) => ox + c : q === 2 ? (r) => ox + r : (r) => ox - r;
    const toY = q === 0 ? (r) => oy - r : q === 1 ? (r) => oy + r : (r, c) => oy + c;
    // slopes are fractions sn/sd and en/ed with positive denominators
    const scan = (depth, sn, sd, en, ed) => {
      if (depth > maxDepth) return;
      const minCol = Math.floor((2 * depth * sn + sd) / (2 * sd)); // round ties up
      const maxCol = Math.ceil((2 * depth * en - ed) / (2 * ed)); // round ties down
      let prev = 0; // 0 = none, 1 = wall, 2 = floor
      for (let col = minCol; col <= maxCol; col++) {
        const x = toX(depth, col), y = toY(depth, col);
        const wall = blocks(x, y);
        if (wall || (col * sd >= depth * sn && col * ed <= depth * en)) mark(x, y);
        if (prev === 1 && !wall) { sn = 2 * col - 1; sd = 2 * depth; }
        if (prev === 2 && wall) scan(depth + 1, sn, sd, 2 * col - 1, 2 * depth);
        prev = wall ? 1 : 2;
      }
      if (prev === 2) scan(depth + 1, sn, sd, en, ed);
    };
    scan(1, -1, 1, 1, 1);
  }
}

/** Light intensity falloff for distance d within radius r (0..1). */
export function falloff(d, r) {
  const v = 1 - (d / (r + 0.5)) ** 2;
  return v > 0 ? v : 0;
}
