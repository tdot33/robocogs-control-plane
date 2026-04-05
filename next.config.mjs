import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: repoRoot,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3001'],
    },
  },
}

export default nextConfig
