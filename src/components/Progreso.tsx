'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Barra de carga arriba de la pantalla al cambiar de página.
 * Aparece apenas se toca un enlace interno y se completa cuando la página nueva ya está lista.
 */
export default function Progreso() {
  const ruta = usePathname();
  const [estado, setEstado] = useState<'quieto' | 'cargando' | 'listo'>('quieto');
  const desde = useRef(ruta);
  const fin = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      let url: URL;
      try { url = new URL(a.href, location.href); } catch { return; }
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      desde.current = location.pathname;
      if (fin.current) clearTimeout(fin.current);
      setEstado('cargando');
      // Por si la navegación se cancela: no dejar la barra pegada.
      fin.current = setTimeout(() => setEstado('quieto'), 20000);
    };
    document.addEventListener('click', alTocar, true);
    return () => document.removeEventListener('click', alTocar, true);
  }, []);

  useEffect(() => {
    if (ruta === desde.current) return;
    desde.current = ruta;
    if (fin.current) clearTimeout(fin.current);
    setEstado('listo');
    fin.current = setTimeout(() => setEstado('quieto'), 450);
  }, [ruta]);

  if (estado === 'quieto') return null;
  return <div className={'prog ' + estado} role="progressbar" aria-label="Cargando página" />;
}
