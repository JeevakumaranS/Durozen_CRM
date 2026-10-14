import path from 'node:path';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import type { NextConfig } from 'next';

const nextConfig = (phase: string): NextConfig => ({
  distDir:
    phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next-production',
  outputFileTracingRoot: path.join(__dirname),
});

export default nextConfig;
