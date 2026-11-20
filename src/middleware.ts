import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { DEMO } from '@/config';
import { updateSession } from '@/infraestructura/supabase/middleware';

export function middleware(request: NextRequest) {
  // En modo demo no hay sesión: todo es público y /login lleva al dashboard.
  if (DEMO) return request.nextUrl.pathname === '/login' ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  return updateSession(request);
}

export const config = {
  // Todo salvo archivos estáticos e imágenes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xlsx)$).*)'],
};
