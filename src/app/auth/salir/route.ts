import { NextResponse, type NextRequest } from 'next/server';
import { DEMO } from '@/config';
import { contenedor } from '@/infraestructura/contenedor';

export async function POST(request: NextRequest) {
  await contenedor().sesion.cerrar();
  // En la demo no hay login: cerrar sesión solo vuelve al inicio.
  return NextResponse.redirect(new URL(DEMO ? '/' : '/login', request.url), { status: 303 });
}
