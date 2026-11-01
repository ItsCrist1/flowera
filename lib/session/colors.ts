/*
 * Categorical colors for answer options and chart slices. Values live in app/globals.css
 * (--series-1…8) with separate light/dark steps, validated for color-vision deficiency.
 * Assigned in fixed order, never cycled: option 1 is always series 1, everywhere.
 * Three light-mode hues are under 3:1 against white, so charts always carry text labels.
 */
export const OPTION_COLORS = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

/** Secondary encoding so options never rely on color alone. */
export const OPTION_SHAPES = ["▲", "◆", "●", "■", "★", "⬟", "⬢", "✚"] as const;

/** "Not answered" is always neutral gray. */
export const NOT_ANSWERED_COLOR = "var(--series-none)";

export function sliceColor(index: number) {
    return OPTION_COLORS[Math.min(index, OPTION_COLORS.length - 1)];
}
