import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  let rawPath = url.pathname;
  try {
    rawPath = decodeURIComponent(url.pathname);
  } catch {}

  // Handle combined demo routes like /controls && /audit, /cases & /ledger, etc.
  if (rawPath.includes('&') || rawPath.includes('&&') || rawPath.includes(' ') || rawPath.includes('+')) {
    const cleanPath = rawPath.toLowerCase();

    if (cleanPath.includes('control') && cleanPath.includes('audit')) {
      url.pathname = '/controls';
      return NextResponse.redirect(url);
    }
    if (cleanPath.includes('case') && cleanPath.includes('ledger')) {
      url.pathname = '/cases';
      return NextResponse.redirect(url);
    }
    if (cleanPath.includes('pricing') && cleanPath.includes('gtm')) {
      url.pathname = '/pricing';
      return NextResponse.redirect(url);
    }

    // Generic split on &&, &, or +
    const parts = rawPath.split(/\s*(&&|&|\+)\s*/);
    const candidate = (parts[0] || '').trim();
    if (candidate.startsWith('/')) {
      url.pathname = candidate;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
