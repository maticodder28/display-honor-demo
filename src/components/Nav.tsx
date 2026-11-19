'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DEMO } from '@/lib/modo';
import { Luna, Sol } from './Iconos';

const REPO = process.env.NEXT_PUBLIC_REPO_URL;

interface Props {
  usuario: { nombre: string; esAdmin: boolean; cargo?: string | null; rol?: string | null };
  actualizado?: string | null;
  corte?: string | null;
  vista: 'dashboard' | 'admin' | 'bitacora' | 'historial' | 'foto';
}

const ROL: Record<string, string> = { admin: 'Administrador', registro: 'Registro', viewer: 'Solo lectura', promotor: 'Promotor' };

export default function Nav({ usuario, actualizado, corte, vista }: Props) {
  const [tema, setTema] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    setTema(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const cambiarTema = () => {
    const t = tema === 'dark' ? 'light' : 'dark';
    if (t === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('tema', t); } catch {}
    setTema(t);
  };
  const [hoja, setHoja] = useState<null | 'display' | 'cuenta'>(null);
  // Marca al instante la sección tocada, mientras la página nueva carga.
  const [yendo, setYendo] = useState<Props['vista'] | null>(null);
  useEffect(() => { setYendo(null); }, [vista]);
  const actual = yendo ?? vista;
  const ir = (v: Props['vista']) => () => { if (v !== vista) setYendo(v); };
  useEffect(() => {
    if (!hoja) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHoja(null); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [hoja]);
  const conLinks = usuario.rol !== 'promotor';
  const cargo = usuario.cargo || ROL[usuario.rol ?? ''] || 'Usuario';
  const iniciales = usuario.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('') || 'U';

  return (
    <>
    {DEMO && (
      <div className="demo-bar" role="note">
        <b>Demo</b> con datos ficticios: puedes navegar y filtrar, pero nada se guarda.
        {REPO && <> <a href={REPO} target="_blank" rel="noreferrer">Ver el código</a></>}
      </div>
    )}
    <nav className="nb">
      <div className="nb-in">
        <Link className="brand" href={usuario.rol === 'promotor' ? '/foto' : '/'}>
          <span className="dot" />HONOR <small>{usuario.nombre} | {cargo}</small>
        </Link>
        <button className="nb-yo" type="button" aria-label="Cuenta y opciones" aria-expanded={hoja === 'cuenta'} onClick={() => setHoja(hoja === 'cuenta' ? null : 'cuenta')}>
          {iniciales}
        </button>
        {vista !== 'admin' && usuario.rol !== 'promotor' && (
          <div className="links">
            <MenuDisplay activo={vista === 'dashboard'} marcado={actual === 'dashboard'} alIr={ir('dashboard')} />
            <Link href="/historial" className={actual === 'historial' ? 'on' : undefined} aria-current={vista === 'historial' ? 'page' : undefined} onClick={ir('historial')}>Historial</Link>
            <Link href="/bitacora" className={actual === 'bitacora' ? 'on' : undefined} aria-current={vista === 'bitacora' ? 'page' : undefined} onClick={ir('bitacora')}>Bitácora</Link>
            <Link href="/foto" className={actual === 'foto' ? 'on' : undefined} aria-current={vista === 'foto' ? 'page' : undefined} onClick={ir('foto')}>Foto del Éxito</Link>
          </div>
        )}
        <div className="nb-r">
          {actualizado && (
            <span className="upd">
              Actualizado <b>{new Date(actualizado).toLocaleDateString('es-CL')}</b>
              {corte ? ` | levantamiento ${corte}` : ''}
            </span>
          )}
          <button className="ibtn" type="button" onClick={cambiarTema} aria-label="Cambiar tema">
            {tema === 'dark' ? <><Sol /> Claro</> : <><Luna /> Oscuro</>}
          </button>
          {usuario.esAdmin && (
            vista === 'admin' ? (
              <Link className="abtn ghost" href="/">Dashboard</Link>
            ) : (
              <Link className="abtn" href="/admin">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                </svg>
                Admin
              </Link>
            )
          )}
          {!DEMO && (
            <form action="/auth/salir" method="post">
              <button className="ibtn" type="submit" title={`Sesión de ${usuario.nombre}`}>Salir</button>
            </form>
          )}
        </div>
      </div>
    </nav>

      {/* Celular: barra inferior al alcance del pulgar y hojas que suben desde abajo. */}
      {conLinks && (
        <div className="tb" role="navigation" aria-label="Secciones">
          <button type="button" className={actual === 'dashboard' ? 'on' : undefined} aria-expanded={hoja === 'display'} onClick={() => setHoja(hoja === 'display' ? null : 'display')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></svg>
            Display
          </button>
          <Link href="/historial" className={actual === 'historial' ? 'on' : undefined} aria-current={vista === 'historial' ? 'page' : undefined} onClick={ir('historial')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M7 16V10M12 16V5M17 16v-4" /></svg>
            Historial
          </Link>
          <Link href="/bitacora" className={actual === 'bitacora' ? 'on' : undefined} aria-current={vista === 'bitacora' ? 'page' : undefined} onClick={ir('bitacora')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 8.5h6M9 12h6M9 15.5h3.5" /></svg>
            Bitácora
          </Link>
          <Link href="/foto" className={actual === 'foto' ? 'on' : undefined} aria-current={vista === 'foto' ? 'page' : undefined} onClick={ir('foto')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5.5a2.5 2.5 0 0 0 2.6 3.4M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3.4M12 13.5V17M8.5 19.5h7M10 17h4" /></svg>
            Éxito Entel
          </Link>
        </div>
      )}
      {hoja && (
        <>
          <div className="sh-fondo" onClick={() => setHoja(null)} />
          <div className="sh" role="dialog" aria-modal="true" aria-label={hoja === 'display' ? 'Display' : 'Cuenta'}>
            <div className="sh-asa" />
            {hoja === 'display' ? (
              <>
                <div className="sh-t">Display</div>
                {([['resumen', 'Resumen', 'KPIs y share por marca'], ['clientes', 'Clientes', 'Share por cadena'], ['tiendas', 'Tiendas', 'Detalle tienda por tienda']] as const).map(([a, l, d]) => (
                  <a key={a} className="sh-i" href={vista === 'dashboard' ? `#${a}` : `/#${a}`} onClick={() => { setHoja(null); ir('dashboard')(); }}>
                    <b>{l}</b><span>{d}</span>
                  </a>
                ))}
              </>
            ) : (
              <>
                <div className="sh-yo"><span className="nb-yo">{iniciales}</span><div><b>{usuario.nombre}</b><span>{cargo}</span></div></div>
                {actualizado && (
                  <div className="sh-nota">Actualizado <b>{new Date(actualizado).toLocaleDateString('es-CL')}</b>{corte ? ` | levantamiento ${corte}` : ''}</div>
                )}
                <button className="sh-i" type="button" onClick={cambiarTema}><b>{tema === 'dark' ? <><Sol /> Tema claro</> : <><Luna /> Tema oscuro</>}</b></button>
                {usuario.esAdmin && (vista === 'admin'
                  ? <Link className="sh-i" href="/" onClick={() => setHoja(null)}><b>Volver al dashboard</b></Link>
                  : <Link className="sh-i" href="/admin" onClick={() => setHoja(null)}><b>Admin</b><span>Cargas, usuarios y ejecutivos</span></Link>)}
                {DEMO
                  ? <div className="sh-nota">Demo con datos ficticios: nada se guarda.</div>
                  : <form action="/auth/salir" method="post"><button className="sh-i sh-salir" type="submit"><b>Cerrar sesión</b></button></form>}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Botón "Display" con las tres partes del dashboard: Resumen, Clientes y Tiendas. */
function MenuDisplay({ activo, marcado, alIr }: { activo: boolean; marcado: boolean; alIr: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);
  const ir = (ancla: string) => (activo ? `#${ancla}` : `/#${ancla}`);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={'dd-btn' + (marcado ? ' on' : '')} aria-haspopup="true" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        Display
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
      </button>
      {abierto && (
        <div className="dd-menu">
          {([['resumen', 'Resumen'], ['clientes', 'Clientes'], ['tiendas', 'Tiendas']] as const).map(([a, l]) => (
            <a key={a} href={ir(a)} onClick={() => { setAbierto(false); alIr(); }}>{l}</a>
          ))}
        </div>
      )}
    </div>
  );
}
