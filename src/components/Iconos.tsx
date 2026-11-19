/** Iconos SVG en linea: reemplazan simbolos de texto para que la interfaz no dependa de caracteres especiales. */

type P = { className?: string; titulo?: string };

const base = (titulo?: string) => ({
  viewBox: '0 0 16 16',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  role: titulo ? 'img' : undefined,
  'aria-hidden': titulo ? undefined : true,
  'aria-label': titulo,
  style: { verticalAlign: '-0.125em' },
});

export function Sol({ className, titulo }: P) {
  return (
    <svg {...base(titulo)} className={className}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </svg>
  );
}

export function Luna({ className, titulo }: P) {
  return (
    <svg {...base(titulo)} className={className}>
      <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" />
    </svg>
  );
}

export function Check({ className, titulo }: P) {
  return (
    <svg {...base(titulo)} className={className} strokeWidth={2.2}>
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

/** Flecha "de A a B" entre dos valores. */
export function Flecha({ className, titulo }: P) {
  return (
    <svg {...base(titulo)} className={className} style={{ verticalAlign: '-0.125em', margin: '0 0.3em' }}>
      <path d="M2.5 8h11M9.5 4l4 4-4 4" />
    </svg>
  );
}
