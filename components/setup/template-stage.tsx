"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import { TemplatePicker } from "@/components/setup/template-picker";
import { distanceToTiles, E1, E2, ORIGIN, toLattice, type Point } from "@/components/setup/lattice";
import { TEMPLATES } from "@/lib/session/templates";
import type { TemplateId } from "@/lib/session/types";
import { cn } from "@/lib/utils";

/*
 * Panel 0 as a full-screen stage:
 *  - a canvas behind everything draws the rhombus lattice across the whole page. Near the cursor the
 *    lines bulge away from it like a lens, but they stay pinned where they meet the four tiles, so the
 *    tiles never move;
 *  - the tile SVG sits on top, aligned to the canvas through its screen transform;
 *  - the preview box on the right appears on hover/focus and leans toward the cursor.
 *
 * All motion runs in one requestAnimationFrame loop that stops when it settles, writes to the canvas and
 * to CSS variables (no React re-renders), and is off under prefers-reduced-motion.
 */

/** Tuning knobs for the warp. Units are SVG user units of the tile view box (one tile edge = 220). */
const WARP = {
    radius: 300,     // how far the bulge reaches
    strength: 0.55,  // how far lines get pushed (fraction of their distance to the cursor, at the peak)
    pinCells: 0.9,   // lines fade from fully pinned at a tile to fully free this many cells away
    follow: 0.14,    // cursor smoothing per frame (0..1, higher = snappier)
    fade: 0.07,      // how fast the effect fades in/out when the cursor enters/leaves
    sample: 0.08,    // line sampling step in cells (smaller = smoother curves)
};
/** How much the preview box leans: px of shift and degrees of tilt at the stage edges. */
const LEAN = { shiftX: 18, shiftY: 12, tiltX: 6, tiltY: 8 };

const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

export function TemplateStage({ value, onConfirm, header }: {
    value: TemplateId | null;
    onConfirm: (t: TemplateId) => void;
    /** Banner, stepper and heading, drawn over the top of the stage. */
    header: ReactNode;
}) {
    const stageRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [preview, setPreview] = useState<TemplateId | null>(null);

    useEffect(() => {
        const stage = stageRef.current, canvas = canvasRef.current, svg = svgRef.current;
        if (!stage || !canvas || !svg) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        // Cursor in client px: target and smoothed. Intensity fades the whole effect in and out.
        const s = { tx: 0, ty: 0, x: 0, y: 0, ti: 0, i: 0, seeded: false };
        let frame = 0;

        function draw() {
            const rect = canvas!.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
            if (canvas!.width !== w || canvas!.height !== h) {
                canvas!.width = w;
                canvas!.height = h;
            }
            const ctm = svg!.getScreenCTM();
            if (!ctm || !w || !h) return;
            // User units → canvas px.
            const m = new DOMMatrix().scale(dpr).translate(-rect.left, -rect.top).multiply(DOMMatrix.fromMatrix(ctm));
            const inv = m.inverse();
            const toUser = (x: number, y: number): Point => {
                const p = inv.transformPoint({ x, y });
                return { x: p.x, y: p.y };
            };

            // Lattice range that covers the canvas.
            const cornersL = [toUser(0, 0), toUser(w, 0), toUser(0, h), toUser(w, h)].map(toLattice);
            const iMin = Math.floor(Math.min(...cornersL.map(c => c[0]))) - 1, iMax = Math.ceil(Math.max(...cornersL.map(c => c[0]))) + 1;
            const jMin = Math.floor(Math.min(...cornersL.map(c => c[1]))) - 1, jMax = Math.ceil(Math.max(...cornersL.map(c => c[1]))) + 1;

            // Cursor in user units.
            const cursor = toUser((s.x - rect.left) * dpr, (s.y - rect.top) * dpr);
            const R2 = WARP.radius * WARP.radius;
            const k = WARP.strength * s.i;

            const warp = (i: number, j: number) => {
                const x = ORIGIN.x + i * E1.x + j * E2.x, y = ORIGIN.y + i * E1.y + j * E2.y;
                if (k < 0.001) return m.transformPoint({ x, y });
                const dx = x - cursor.x, dy = y - cursor.y;
                const f = k * Math.exp(-(dx * dx + dy * dy) / R2) * smoothstep(0, WARP.pinCells, distanceToTiles([i, j]));
                return m.transformPoint({ x: x + dx * f, y: y + dy * f });
            };

            ctx!.clearRect(0, 0, w, h);
            ctx!.strokeStyle = getComputedStyle(canvas!).color;
            ctx!.lineWidth = Math.max(1, 2 * ctm.a * dpr);
            ctx!.lineJoin = "round";
            ctx!.beginPath();
            for (let a = iMin; a <= iMax; a++) {
                for (let t = jMin; t <= jMax + 1e-9; t += WARP.sample) {
                    const p = warp(a, t);
                    if (t === jMin) ctx!.moveTo(p.x, p.y); else ctx!.lineTo(p.x, p.y);
                }
            }
            for (let b = jMin; b <= jMax; b++) {
                for (let t = iMin; t <= iMax + 1e-9; t += WARP.sample) {
                    const p = warp(t, b);
                    if (t === iMin) ctx!.moveTo(p.x, p.y); else ctx!.lineTo(p.x, p.y);
                }
            }
            ctx!.stroke();

            // Preview box: lean toward the cursor, relative to the stage center.
            const st = stage!.getBoundingClientRect();
            const nx = Math.max(-1, Math.min(1, (s.x - (st.left + st.width / 2)) / (st.width / 2))) * s.i;
            const ny = Math.max(-1, Math.min(1, (s.y - (st.top + st.height / 2)) / (st.height / 2))) * s.i;
            boxRef.current?.style.setProperty("--nx", nx.toFixed(4));
            boxRef.current?.style.setProperty("--ny", ny.toFixed(4));
        }

        function tick() {
            frame = 0;
            s.x += (s.tx - s.x) * WARP.follow;
            s.y += (s.ty - s.y) * WARP.follow;
            s.i += (s.ti - s.i) * WARP.fade;
            draw();
            const settled = Math.abs(s.tx - s.x) < 0.2 && Math.abs(s.ty - s.y) < 0.2 && Math.abs(s.ti - s.i) < 0.002;
            if (settled) {
                s.x = s.tx;
                s.y = s.ty;
                s.i = s.ti;
            } else schedule();
        }
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(tick);
        };
        const redraw = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            draw();
        };

        function onMove(e: PointerEvent) {
            if (e.pointerType === "touch" || reduceMotion.matches) return;
            s.tx = e.clientX;
            s.ty = e.clientY;
            if (!s.seeded) {
                s.x = s.tx;
                s.y = s.ty;
                s.seeded = true;
            }
            s.ti = 1;
            schedule();
        }
        function onLeave() {
            s.ti = 0;
            schedule();
        }

        stage.addEventListener("pointermove", onMove);
        stage.addEventListener("pointerleave", onLeave);
        const ro = new ResizeObserver(redraw);
        ro.observe(stage);
        // Theme switches change the line color.
        const mo = new MutationObserver(redraw);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
        window.addEventListener("scroll", redraw, { passive: true });
        redraw();

        return () => {
            cancelAnimationFrame(frame);
            stage.removeEventListener("pointermove", onMove);
            stage.removeEventListener("pointerleave", onLeave);
            ro.disconnect();
            mo.disconnect();
            window.removeEventListener("scroll", redraw);
        };
    }, []);

    const meta = preview ? TEMPLATES[preview] : null;

    return (
        <div ref={stageRef}
             className="relative isolate flex min-h-[calc(100dvh-var(--top-bar-h,0px))] flex-col overflow-hidden lg:h-[calc(100dvh-var(--top-bar-h,0px))]">
            <canvas ref={canvasRef} aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 size-full text-foreground/20 [mask-image:radial-gradient(ellipse_75%_70%_at_50%_55%,black_35%,transparent_100%)]"/>

            <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 md:px-8">{header}</div>

            <div className="grid min-h-0 flex-1 grid-cols-1 items-center gap-4 px-4 pb-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
                <div className="mx-auto aspect-[11/7] w-full max-w-[1000px] lg:h-full lg:max-h-[640px] lg:w-auto lg:max-w-full">
                    <TemplatePicker value={value} onConfirm={onConfirm} onPreview={setPreview} svgRef={svgRef}/>
                </div>

                {/* Desktop only: there is no hover on touch screens, and a tap goes straight to the next panel. */}
                <div className="hidden [perspective:900px] lg:block">
                    <div ref={boxRef}
                         className={cn("flex flex-col gap-4 border bg-background/85 p-5 shadow-sm backdrop-blur-sm will-change-transform",
                             "transition-[opacity,border-color] duration-300",
                             meta ? "opacity-100" : "pointer-events-none opacity-0")}
                         style={{
                             borderColor: meta?.color,
                             transform: `translate3d(calc(var(--nx,0) * ${LEAN.shiftX}px), calc(var(--ny,0) * ${LEAN.shiftY}px), 0)
                                         rotateY(calc(var(--nx,0) * ${LEAN.tiltY}deg)) rotateX(calc(var(--ny,0) * ${-LEAN.tiltX}deg))`,
                         }}>
                        {meta && (
                            <div key={meta.id} className="flex flex-col gap-4 animate-in fade-in-0 duration-200">
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs uppercase tracking-widest" style={{ color: meta.color }}>
                                        {value === meta.id ? "Last used" : "Template"}
                                    </span>
                                    <h2 className="text-xl font-semibold">{meta.name}</h2>
                                    <p className="text-sm font-medium">{meta.tagline}</p>
                                    <p className="text-sm text-muted-foreground">{meta.description}</p>
                                </div>
                                <ul className="flex flex-col gap-1.5 text-sm">
                                    {meta.bullets.map(b => (
                                        <li key={b} className="flex items-start gap-2">
                                            <Check className="mt-0.5 size-4 shrink-0" style={{ color: meta.color }}/> {b}
                                        </li>
                                    ))}
                                </ul>
                                <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
                                    Click to set it up <ArrowRight className="size-3.5"/>
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
