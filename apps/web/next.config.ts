import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone output needs symlinks (pnpm) — Windows without developer mode cannot create them,
  // so it is enabled only for the Docker/CI build (see apps/web/Dockerfile)
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  transpilePackages: ['@campuslive/contracts', '@campuslive/map-data'],
  experimental: { optimizePackageImports: ['motion'] },
  env: { NEXT_PUBLIC_APP_VERSION: process.env.APP_VERSION ?? '0.1.0' },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
