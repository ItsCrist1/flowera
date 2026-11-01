import { flushSync } from "react-dom";
import { pt, TILE_AT, type Point } from "@/components/setup/lattice";
import type { TemplateId } from "@/lib/session/types";

/*
 * Panel 0 → next panel transition: the chosen tile morphs into the next panel's heading block while the
 * rest of panel 0 fades out.
 *
 * How: snapshot the stage (a DOM clone with the canvas pixels copied) into a fixed overlay, render the
 * next panel underneath right away (flushSync), measure its heading, then tween a polygon from the
 * tile's four corners to the heading's four corners and move the template name onto the heading.
 * The heading must carry [data-panel-heading]; the template name inside it, if shown, [data-panel-name];
 * the panel body, [data-panel-body].
 */

const DURATION = 650;
const FADE_OUT = 320;     // the rest of panel 0
const REVEAL_FROM = 0.72; // morph progress at which the real heading starts to show through

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Four points in clockwise screen order, starting with the topmost. */
function clockwiseFromTop(points: Point[]): Point[] {
    const c = { x: points.reduce((s, p) => s + p.x, 0) / 4, y: points.reduce((s, p) => s + p.y, 0) / 4 };
    const sorted = [...points].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
    const top = sorted.reduce((best, p, k) => (p.y < sorted[best].y ? k : best), 0);
    return [...sorted.slice(top), ...sorted.slice(0, top)];
}

export function morphTileIntoPanel(opts: {
    stage: HTMLElement;
    svg: SVGSVGElement;
    template: TemplateId;
    color: string;
    label: string;
    /** Switches to the next panel. Called synchronously. */
    commit: () => void;
}) {
    const { stage, svg, template, color, label, commit } = opts;
    const ctm = svg.getScreenCTM();
    if (!ctm || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        commit();
        return;
    }

    // Where the tile is on screen.
    const m = DOMMatrix.fromMatrix(ctm);
    const scale = Math.hypot(m.a, m.b);
    const [i, j] = TILE_AT[template];
    const toScreen = (p: Point) => {
        const q = m.transformPoint(p);
        return { x: q.x, y: q.y };
    };
    const from = clockwiseFromTop(([[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] as const).map(c => toScreen(pt(c))));
    const fromCenter = toScreen(pt([i + 0.5, j + 0.5]));

    // Snapshot of panel 0, minus the chosen tile (the morph replaces it).
    const rect = stage.getBoundingClientRect();
    const clone = stage.cloneNode(true) as HTMLElement;
    const srcCanvas = stage.querySelector("canvas");
    const dstCanvas = clone.querySelector("canvas");
    if (srcCanvas && dstCanvas) {
        dstCanvas.width = srcCanvas.width;
        dstCanvas.height = srcCanvas.height;
        dstCanvas.getContext("2d")?.drawImage(srcCanvas, 0, 0);
    }
    clone.querySelectorAll<HTMLElement | SVGElement>(`[data-tile="${template}"]`).forEach(el => (el.style.visibility = "hidden"));
    clone.querySelectorAll<HTMLElement | SVGElement>("*").forEach(el => {
        el.style.animation = "none";
        el.removeAttribute("id");
    });
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, {
        position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
        margin: "0", transition: `opacity ${FADE_OUT}ms ease-out`,
    });

    const overlay = document.createElement("div");
    Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "60", pointerEvents: "none" });
    overlay.setAttribute("aria-hidden", "true");

    const NS = "http://www.w3.org/2000/svg";
    const shape = document.createElementNS(NS, "svg");
    Object.assign(shape.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", overflow: "visible" });
    const poly = document.createElementNS(NS, "polygon");
    poly.setAttribute("fill", color);
    poly.setAttribute("fill-opacity", "0.16");
    poly.setAttribute("stroke", color);
    poly.setAttribute("stroke-linejoin", "round");
    shape.append(poly);

    const text = document.createElement("div");
    text.textContent = label;
    Object.assign(text.style, { position: "fixed", left: "0", top: "0", whiteSpace: "nowrap", fontWeight: "600", lineHeight: "1" });
    text.className = "font-mono text-foreground";

    overlay.append(clone, shape, text);
    document.body.append(overlay);

    // Render the next panel underneath and find where the tile should land.
    flushSync(commit);
    const heading = document.querySelector<HTMLElement>("[data-panel-heading]");
    if (!heading) {
        overlay.remove();
        return;
    }
    const target = heading.querySelector<HTMLElement>("[data-panel-name]") ?? heading.querySelector<HTMLElement>("h1") ?? heading;
    const hr = heading.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const to = [{ x: hr.left, y: hr.top }, { x: hr.right, y: hr.top }, { x: hr.right, y: hr.bottom }, { x: hr.left, y: hr.bottom }];
    const fontFrom = 26 * scale;
    const fontTo = parseFloat(getComputedStyle(target).fontSize) || 24;

    heading.style.opacity = "0";
    // Let panel 0 mostly fade before the new panel's body comes in (its entry animation is already queued).
    const body = document.querySelector<HTMLElement>("[data-panel-body]");
    if (body) body.style.animationDelay = `${FADE_OUT}ms`;
    requestAnimationFrame(() => (clone.style.opacity = "0"));

    const start = performance.now();
    const frame = (now: number) => {
        const raw = Math.min(1, (now - start) / DURATION);
        const t = ease(raw);
        poly.setAttribute("points", from.map((p, k) => `${lerp(p.x, to[k].x, t)},${lerp(p.y, to[k].y, t)}`).join(" "));
        poly.setAttribute("stroke-width", String(lerp(7 * scale, 4, t)));

        // The name travels from the tile's center to its place in the heading (left-aligned there).
        const size = lerp(fontFrom, fontTo, t);
        text.style.fontSize = `${size}px`;
        const w = text.offsetWidth;
        const x = lerp(fromCenter.x - w / 2, tr.left, t);
        const y = lerp(fromCenter.y, tr.top + tr.height / 2, t) - text.offsetHeight / 2;
        text.style.transform = `translate(${x}px, ${y}px)`;

        const reveal = Math.max(0, (raw - REVEAL_FROM) / (1 - REVEAL_FROM));
        shape.style.opacity = text.style.opacity = String(1 - reveal);
        heading.style.opacity = String(reveal);

        if (raw < 1) requestAnimationFrame(frame);
        else {
            heading.style.opacity = "";
            overlay.remove();
        }
    };
    requestAnimationFrame(frame);
}
