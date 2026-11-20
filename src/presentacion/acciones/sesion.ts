'use server';
import { redirect } from 'next/navigation';
import { contenedor } from '@/infraestructura/contenedor';

export async function iniciarSesion(form: FormData) {
  const r = await contenedor().sesion.iniciar(String(form.get('email') ?? ''), String(form.get('password') ?? ''), String(form.get('next') ?? '/'));
  if (!r.ok) redirect(`/login?error=${r.error}&next=${encodeURIComponent(r.destino)}`);
  redirect(r.destino);
}
