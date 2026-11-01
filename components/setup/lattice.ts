import type { TemplateId } from "@/lib/session/types";

/*
 * Geometry of the panel 0 tile pattern (docs/setup_panels/panel_0/design.md), shared by the tile SVG
 * and the warping background canvas so both line up exactly.
 *
 * Everything is in SVG user units of a VIEW-sized view box. The lattice is spanned by E1 and E2
 * (both 220 units long → true rhombuses). Four cells form a staircase:
 *   Hardcoded (0,0) → Automated (0,1) → Worriless (1,1) → Customized (1,2)   (lattice coords i, j)
 */

export const E1 = { x: 187, y: 116 };
export const E2 = { x: 132, y: -176 };
export const VIEW = { w: 1100, h: 700 };
export const ORIGIN = { x: 165, y: 498 }; // centers the four tiles in the view box

export type LatticePoint = readonly [number, number];
export type Point = { x: number; y: number };

/** Lattice coords → user units. */
export const pt = ([i, j]: LatticePoint): Point => ({ x: ORIGIN.x + i * E1.x + j * E2.x, y: ORIGIN.y + i * E1.y + j * E2.y });

const DET = E1.x * E2.y - E2.x * E1.y;
/** User units → lattice coords (inverse of pt). */
export function toLattice(p: Point): LatticePoint {
    const dx = p.x - ORIGIN.x, dy = p.y - ORIGIN.y;
    return [(dx * E2.y - dy * E2.x) / DET, (E1.x * dy - E1.y * dx) / DET];
}

export const TILE_AT: Record<TemplateId, LatticePoint> = {
    hardcoded: [0, 0],
    automated: [0, 1],
    worriless: [1, 1],
    customized: [1, 2],
};

/** Distance (in lattice cells) from a lattice point to the nearest of the four tiles; 0 on or inside them. */
export function distanceToTiles([i, j]: LatticePoint): number {
    let best = Infinity;
    for (const [ci, cj] of Object.values(TILE_AT)) {
        const dx = Math.max(ci - i, 0, i - (ci + 1));
        const dy = Math.max(cj - j, 0, j - (cj + 1));
        best = Math.min(best, Math.hypot(dx, dy));
    }
    return best;
}
