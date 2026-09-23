import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo's CLAUDE.md is our project instructions file; don't let
  // `next dev`/`next build` inject Next.js agent-rules content into it.
  agentRules: false,
};

export default nextConfig;
