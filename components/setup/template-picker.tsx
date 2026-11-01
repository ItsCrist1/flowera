"use client";

import { useState, type KeyboardEvent, type Ref } from "react";
import { TEMPLATE_ORDER, TEMPLATES } from "@/lib/session/templates";
import type { TemplateId } from "@/lib/session/types";
import { cn } from "@/lib/utils";
import { pt, TILE_AT, VIEW, type LatticePoint } from "@/components/setup/lattice";

/*
 * Panel 0 tiles. Geometry lives in ./lattice (shared with the warping background in ./template-stage).
 * Each tile's outer edges use its own color. The three edges two tiles share take the color of
 * whichever of the two is active (hovered or focused, else selected) and a blend of both otherwise.
 */

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

/**
 * The four template tiles. Clicking a tile (or Enter/Space on a focused one) picks it and moves on;
 * hovering or focusing one reports it through onPreview so the page can describe it.
 */
export function TemplatePicker({ value, onConfirm, onPreview, svgRef }: {
    value: TemplateId | null;
    onConfirm: (t: TemplateId) => void;
    onPreview?: (t: TemplateId | null) => void;
    svgRef?: Ref<SVGSVGElement>;
}) {
    const [hovered, setHovered] = useState<TemplateId | null>(null);
    const [focused, setFocused] = useState<TemplateId | null>(null);
    const active = hovered ?? focused ?? value;

    const update = (h: TemplateId | null, f: TemplateId | null) => {
        setHovered(h);
        setFocused(f);
        onPreview?.(h ?? f);
    };

    function onKeyDown(e: KeyboardEvent, t: TemplateId) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onConfirm(t);
            return;
        }
        const step = NEXT[e.key];
        if (!step) return;
        e.preventDefault();
        const idx = TEMPLATE_ORDER.indexOf(t);
        const next = TEMPLATE_ORDER[(idx + step + TEMPLATE_ORDER.length) % TEMPLATE_ORDER.length];
        document.getElementById(`tile-${next}`)?.focus();
    }

    return (
        <svg ref={svgRef} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="h-full w-full select-none overflow-visible" role="radiogroup"
             aria-label="Session templates" preserveAspectRatio="xMidYMid meet">
            {/* Tile fills and hit areas */}
            {TEMPLATE_ORDER.map((t, idx) => {
                const meta = TEMPLATES[t];
                const points = corners(t).map(pt).map(p => `${p.x},${p.y}`).join(" ");
                const isActive = active === t;
                const isSelected = value === t;
                return (
                    <g key={t} id={`tile-${t}`} data-tile={t} role="radio" aria-checked={isSelected} aria-label={`${meta.name}: ${meta.tagline}`}
                       tabIndex={isSelected || (value === null && idx === 0) ? 0 : -1}
                       className="cursor-pointer outline-none [animation:tile-in_500ms_cubic-bezier(.2,.8,.2,1)_both]"
                       style={{ animationDelay: `${120 + idx * 70}ms`, transformOrigin: `${centerOf(t).x}px ${centerOf(t).y}px` }}
                       onPointerEnter={() => update(t, focused)}
                       onPointerLeave={() => update(hovered === t ? null : hovered, focused)}
                       onFocus={() => update(hovered, t)}
                       onBlur={() => update(hovered, focused === t ? null : focused)}
                       onClick={() => onConfirm(t)}
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
                    return <line key={`${t}-${k}`} data-tile={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={TEMPLATES[t].color}
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
                        <g key={t} data-tile={t} className="transition-transform duration-300"
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
