import { iniciarSesion } from '@/presentacion/acciones/sesion';

export const metadata = { title: 'Ingresar | Display Honor' };

const ERRORES: Record<string, string> = {
  credenciales: 'Correo o contraseña incorrectos.',
  otro: 'No se pudo iniciar sesión. Intenta de nuevo.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="login">
      <form className="card" action={iniciarSesion}>
        <div className="brand"><span className="dot" />HONOR <small>Display {process.env.NEXT_PUBLIC_ZONA || 'Norte'}</small></div>
        <h1 style={{ fontSize: 22 }}>Ingresar</h1>
        <p className="sub" style={{ marginTop: -6 }}>Usa el correo y la contraseña que te entregó el administrador.</p>
        <input type="hidden" name="next" value={typeof next === 'string' ? next : '/'} />
        <label>Correo<input type="email" name="email" id="email" required autoComplete="email" /></label>
        <label>Contraseña<input type="password" name="password" id="password" required autoComplete="current-password" /></label>
        {error && <div className="msg e">{ERRORES[error] ?? ERRORES.otro}</div>}
        <button className="abtn" type="submit">Ingresar</button>
      </form>
    </main>
  );
}
