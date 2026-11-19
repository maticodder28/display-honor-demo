'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap">
      <section className="card state">
        <h2>No se pudo cargar el dashboard</h2>
        <p>{error.message || 'Ocurrió un error inesperado.'} Si el problema sigue, revisa las variables de entorno de Supabase.</p>
        <button className="abtn" type="button" onClick={reset}>Reintentar</button>
      </section>
    </main>
  );
}
