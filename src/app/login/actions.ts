'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Solo rutas internas de esta web: rechaza "//otro.com", "/\\otro.com" y URLs completas. */
function destinoSeguro(next: string): string {
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  try {
    const u = new URL(next, 'http://local');
    const ruta = u.pathname + u.search + u.hash;
    return u.origin === 'http://local' && !ruta.startsWith('//') ? ruta : '/';
  } catch {
    return '/';
  }
}

export async function iniciarSesion(form: FormData) {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const destino = destinoSeguro(String(form.get('next') ?? '/'));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const codigo = error.message.includes('Invalid login') ? 'credenciales' : 'otro';
    redirect(`/login?error=${codigo}&next=${encodeURIComponent(destino)}`);
  }
  redirect(destino);
}
