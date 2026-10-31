"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { TEMPLATE_ORDER, TEMPLATES } from "@/lib/session/templates";
import type { TemplateId } from "@/lib/session/types";
import { cn } from "@/lib/utils";

/*
 * Panel 0 tile pattern (docs/setup_panels/panel_0/design.md).
 *
 * The background is a lattice of identical rhombuses. Four of them form a staircase:
 *   Hardcoded (0,0) → Automated (0,1) → Worriless (1,1) → Customized (1,2)   (lattice coords i, j)
 * Each tile's outer edges use its own color. The three edges two tiles share take the color of
 * whichever of the two is active (hovered, or else selected/focused) and a blend of both otherwise.
 */

const E1 = { x: 187, y: 116 };   // lattice basis, both 220 units long → true rhombuses
const E2 = { x: 132, y: -176 };
const VIEW = { w: 1100, h: 700 };
const ORIGIN = { x: 165, y: 498 }; // centers the four tiles in the view box

type LatticePoint = readonly [number, number];
const pt = ([i, j]: LatticePoint) => ({ x: ORIGIN.x + i * E1.x + j * E2.x, y: ORIGIN.y + i * E1.y + j * E2.y });

const TILE_AT: Record<TemplateId, LatticePoint> = {
    hardcoded: [0, 0],
    automated: [0, 1],
    worriless: [1, 1],
    customized: [1, 2],
};

/** Edges shared by two tiles, as lattice segments. */
const SHARED_EDGES: { a: TemplateId; b: TemplateId; from: LatticePoint; to: LatticePoint }[] = [
    { a: "hardcoded", b: "automated", from: [0, 1], to: [1, 1] },
    { a: "automated", b: "worriless", from: [1, 1], to: [1, 2] },
    { a: "worriless", b: "customized", from: [1, 2], to: [2, 2] },
];

function corners(t: TemplateId): LatticePoint[] {
    const [i, j] = TILE_AT[t];
    return [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
}

function edgeKey(p: LatticePoint, q: LatticePoint) {
    const [a, b] = [p.join(","), q.join(",")].sort();
    return `${a}|${b}`;
}

const SHARED_KEYS = new Set(SHARED_EDGES.map(e => edgeKey(e.from, e.to)));

/** Outer (non-shared) edges of a tile. */
function outerEdges(t: TemplateId) {
    const c = corners(t);
    return c.map((p, k) => [p, c[(k + 1) % 4]] as const).filter(([p, q]) => !SHARED_KEYS.has(edgeKey(p, q)));
}

function centerOf(t: TemplateId) {
    const [i, j] = TILE_AT[t];
    return pt([i + 0.5, j + 0.5]);
}

// Arrow-key navigation follows the staircase order.
const NEXT: Record<string, 1 | -1> = { ArrowRight: 1, ArrowUp: 1, ArrowDown: -1, ArrowLeft: -1 };

export function TemplatePicker({ value, onChange, onConfirm, onHover }: {
    value: TemplateId | null;
    onChange: (t: TemplateId) => void;
    onConfirm: (t: TemplateId) => void;
    onHover?: (t: TemplateId | null) => void;
}) {
    const [hovered, setHoveredState] = useState<TemplateId | null>(null);
    const setHovered = (next: TemplateId | null | ((h: TemplateId | null) => TemplateId | null)) => {
        const resolved = typeof next === "function" ? next(hovered) : next;
        setHoveredState(resolved);
        onHover?.(resolved);
    };
    const active = hovered ?? value;
    const maskId = useId();

    const gridLines = useMemo(() => {
        const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
        const R = 12;
        for (let k = -R; k <= R; k++) {
            const a = pt([k, -R]), b = pt([k, R]);
            lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
            const c = pt([-R, k]), d = pt([R, k]);
            lines.push({ x1: c.x, y1: c.y, x2: d.x, y2: d.y });
        }
        return lines;
    }, []);

    function onKeyDown(e: KeyboardEvent, t: TemplateId) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onChange(t);
            onConfirm(t);
            return;
        }
        const step = NEXT[e.key];
        if (!step) return;
        e.preventDefault();
        const idx = TEMPLATE_ORDER.indexOf(t);
        const next = TEMPLATE_ORDER[(idx + step + TEMPLATE_ORDER.length) % TEMPLATE_ORDER.length];
        onChange(next);
        document.getElementById(`tile-${next}`)?.focus();
    }

    return (
        <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="h-full w-full select-none" role="radiogroup"
             aria-label="Session templates" preserveAspectRatio="xMidYMid meet">
            <defs>
                <radialGradient id={`${maskId}-fade`}>
                    <stop offset="0.35" stopColor="white" stopOpacity="1"/>
                    <stop offset="1" stopColor="white" stopOpacity="0"/>
                </radialGradient>
                <mask id={`${maskId}-mask`}>
                    <rect width={VIEW.w} height={VIEW.h} fill={`url(#${maskId}-fade)`}/>
                </mask>
            </defs>

            {/* Background lattice, fading out toward the edges */}
            <g mask={`url(#${maskId}-mask)`} className="text-foreground/25" stroke="currentColor" strokeWidth={2}>
                {gridLines.map((l, k) => <line key={k} {...l}/>)}
            </g>

            {/* Tile fills and hit areas */}
            {TEMPLATE_ORDER.map((t, idx) => {
                const meta = TEMPLATES[t];
                const points = corners(t).map(pt).map(p => `${p.x},${p.y}`).join(" ");
                const isActive = active === t;
                const isSelected = value === t;
                return (
                    <g key={t} id={`tile-${t}`} role="radio" aria-checked={isSelected} aria-label={`${meta.name}: ${meta.tagline}`}
                       tabIndex={isSelected || (value === null && idx === 0) ? 0 : -1}
                       className="cursor-pointer outline-none [animation:tile-in_500ms_cubic-bezier(.2,.8,.2,1)_both]"
                       style={{ animationDelay: `${120 + idx * 70}ms`, transformOrigin: `${centerOf(t).x}px ${centerOf(t).y}px` }}
                       onPointerEnter={() => setHovered(t)} onPointerLeave={() => setHovered(h => h === t ? null : h)}
                       onFocus={() => onChange(t)}
                       onClick={() => onChange(t)} onDoubleClick={() => onConfirm(t)}
                       onKeyDown={e => onKeyDown(e, t)}>
                        <polygon points={points} fill={meta.color}
                                 className="transition-[fill-opacity] duration-300"
                                 fillOpacity={isActive ? 0.16 : isSelected ? 0.1 : 0.03}/>
                    </g>
                );
            })}

            {/* Outer edges in each tile's own color */}
            <g strokeLinecap="round" strokeWidth={7} pointerEvents="none">
                {TEMPLATE_ORDER.flatMap(t => outerEdges(t).map(([p, q], k) => {
                    const a = pt(p), b = pt(q);
                    return <line key={`${t}-${k}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={TEMPLATES[t].color}
                                 className="transition-opacity duration-300" opacity={active && active !== t ? 0.55 : 1}/>;
                }))}
            </g>

            {/* Shared edges: the active neighbour's color, or a blend */}
            <g strokeLinecap="round" strokeWidth={7} pointerEvents="none">
                {SHARED_EDGES.map(e => {
                    const a = pt(e.from), b = pt(e.to);
                    const color = active === e.a ? TEMPLATES[e.a].color
                        : active === e.b ? TEMPLATES[e.b].color
                            : `color-mix(in oklch, ${TEMPLATES[e.a].color}, ${TEMPLATES[e.b].color})`;
                    return <line key={`${e.a}-${e.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                                 style={{ stroke: color, transition: "stroke 250ms ease" }}/>;
                })}
            </g>

            {/* Labels (not skewed) */}
            <g pointerEvents="none">
                {TEMPLATE_ORDER.map(t => {
                    const c = centerOf(t);
                    const isActive = active === t;
                    return (
                        <g key={t} className="transition-transform duration-300"
                           style={{ transform: isActive ? "scale(1.06)" : "scale(1)", transformOrigin: `${c.x}px ${c.y}px` }}>
                            <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle"
                                  className={cn("fill-foreground font-mono font-semibold transition-opacity", !isActive && active && "opacity-70")}
                                  fontSize={26}>{TEMPLATES[t].name}</text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}
