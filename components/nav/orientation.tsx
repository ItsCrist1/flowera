export type Orientation = "horizontal" | "vertical";
export const ORIENTATION_COOKIE = "nav-orientation";

export const SIDEBAR_WIDTH_COOKIE = "sidebar-width";
export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 400;
export const SIDEBAR_DEFAULT = 208;
export const SIDEBAR_COLLAPSED = 64;
export const SIDEBAR_SNAP_BELOW = 120;

export function clampSidebarWidth(raw: number) {
    if (!Number.isFinite(raw)) return SIDEBAR_DEFAULT;
    if (raw < SIDEBAR_SNAP_BELOW) return SIDEBAR_COLLAPSED;
    return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, raw));
}