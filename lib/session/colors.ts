/** Answer-option colors, shared by the editor, the student answer buttons and the charts. */
export const OPTION_COLORS = [
    "oklch(0.63 0.22 25)",   // red
    "oklch(0.6 0.2 255)",    // blue
    "oklch(0.75 0.17 85)",   // amber
    "oklch(0.64 0.18 150)",  // green
    "oklch(0.6 0.22 305)",   // purple
    "oklch(0.7 0.15 200)",   // cyan
    "oklch(0.68 0.2 350)",   // pink
    "oklch(0.62 0.13 60)",   // brown
] as const;

export const OPTION_SHAPES = ["▲", "◆", "●", "■", "★", "⬟", "⬢", "✚"] as const;

export const CORRECT_COLOR = "oklch(0.66 0.18 150)";
export const WRONG_COLOR = "oklch(0.63 0.22 25)";
export const NEUTRAL_COLOR = "oklch(0.6 0 0 / 0.35)";

/** A stable color for an arbitrary chart slice. */
export function sliceColor(index: number) {
    return OPTION_COLORS[index % OPTION_COLORS.length];
}
