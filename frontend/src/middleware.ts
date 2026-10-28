import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_EXACT_PATHS = new Set([
  '/login',
  '/register',
  '/accept-invite',
  '/verify-certificate',
  '/trust',
  '/help',
]);

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  let rawPath = url.pathname;
  try {
    rawPath = decodeURIComponent(url.pathname);
  } catch {}

  // 1. Handle combined demo routes like /controls && /audit, /cases & /ledger, etc.
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

  // 2. Authentication Enforcement for ZoikoShield Platform
  // Auth is signaled by the presence of zoiko_auth or access token cookies
  const isAuth =
    request.cookies.has('zoiko_auth') ||
    request.cookies.has('zoiko_shield_access_token') ||
    request.cookies.has('shield_access_token');

  const isPublicRoute =
    PUBLIC_EXACT_PATHS.has(url.pathname) ||
    url.pathname.startsWith('/accept-invite') ||
    url.pathname.startsWith('/verify-certificate');

  // If unauthenticated and requesting a protected route (including root '/'):
  if (!isAuth && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    if (url.pathname !== '/') {
      loginUrl.searchParams.set('redirect', url.pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 3. Handle explicit logout on /login: clean auth cookies immediately
  if (url.pathname === '/login' && request.nextUrl.searchParams.get('logout') === 'true') {
    const cleanLoginRes = NextResponse.next();
    cleanLoginRes.cookies.set('zoiko_auth', '', { maxAge: 0, path: '/', expires: new Date(0) });
    cleanLoginRes.cookies.set('zoiko_shield_access_token', '', { maxAge: 0, path: '/', expires: new Date(0) });
    cleanLoginRes.cookies.set('shield_access_token', '', { maxAge: 0, path: '/', httpOnly: true, expires: new Date(0) });
    cleanLoginRes.cookies.set('zoiko_shield_tenant_id', '', { maxAge: 0, path: '/', expires: new Date(0) });
    cleanLoginRes.cookies.set('zoiko_shield_user_email', '', { maxAge: 0, path: '/', expires: new Date(0) });
    cleanLoginRes.headers.set('Cache-Control', 'no-store, max-age=0');
    return cleanLoginRes;
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
     * - images (public assets, e.g. the login page artwork)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|images|favicon.ico).*)',
  ],
};
