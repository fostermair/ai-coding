import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling native Node.js packages that use browser
  // globals (DOMMatrix etc.) – they must remain as external CommonJS modules.
  serverExternalPackages: ["better-sqlite3", "pdf-parse"],
};

export default nextConfig;
