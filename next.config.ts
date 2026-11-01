import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // The Next.js dev indicator overlaps the student UI on phones; keep it out of the way.
    devIndicators: { position: "bottom-right" },
};

export default nextConfig;
