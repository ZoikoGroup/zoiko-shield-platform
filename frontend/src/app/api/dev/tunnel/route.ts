import { NextResponse } from "next/server";
import { authorizeTunnelRequest } from "@/lib/tunnel-access";
import { TunnelError, getTunnelState, startTunnel, stopTunnel, type TunnelState } from "@/lib/tunnel-manager";

/**
 * DEVELOPMENT ONLY: start/stop the ngrok test link for webhook connectors.
 * authorizeTunnelRequest() refuses everything (404) in a production build.
 */
export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  NGROK_NOT_INSTALLED: 424,
  NGROK_NO_AUTHTOKEN: 424,
  NGROK_BUSY: 409,
  NOT_MANAGED: 409,
  PORT_IN_USE: 409,
  NGROK_TIMEOUT: 504,
  NGROK_FAILED: 502,
};

async function handle(req: Request, run: () => Promise<TunnelState>) {
  const access = await authorizeTunnelRequest(req);
  if (!access.ok) return NextResponse.json({ message: access.message }, { status: access.status });
  try {
    return NextResponse.json(await run(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TunnelError) {
      return NextResponse.json({ message: error.message, code: error.code }, { status: STATUS[error.code] ?? 500 });
    }
    return NextResponse.json({ message: "The test link could not be changed." }, { status: 500 });
  }
}

export const GET = (req: Request) => handle(req, getTunnelState);
export const POST = (req: Request) => handle(req, startTunnel);
export const DELETE = (req: Request) => handle(req, stopTunnel);
