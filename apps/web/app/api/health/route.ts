export const dynamic = 'force-dynamic';

/** Liveness for the web container / Playwright webServer check. */
export function GET() {
  return Response.json({ status: 'ok', version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev' });
}
