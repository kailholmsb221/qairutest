export const dynamic = 'force-dynamic';

/**
 * The demo admin key at runtime, so `pnpm demo` works without rebuilding the web app with
 * NEXT_PUBLIC_ADMIN_API_KEY inlined. Demo only: this hands the key to any visitor, exactly as
 * the NEXT_PUBLIC_ variable does — never set ADMIN_API_KEY on a public deployment.
 */
export function GET() {
  return Response.json({ key: process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? process.env.ADMIN_API_KEY ?? '' });
}
