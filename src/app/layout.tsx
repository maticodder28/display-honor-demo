import type { Metadata } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import Progreso from '@/presentacion/componentes/comun/Progreso';
import { DEMO } from '@/config';
import './globals.css';

const sans = Manrope({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Dashboard de Área Display | Honor',
  description: 'Share de exhibiciones, muebles y promotores de Honor por tienda.',
  // La app del equipo es interna y no se indexa; la demo pública sí, para que se pueda encontrar.
  robots: DEMO ? { index: true, follow: true } : { index: false, follow: false },
};

// Aplica el tema guardado antes de pintar, para evitar el parpadeo.
const temaInicial = `try{var t=localStorage.getItem('tema');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: temaInicial }} />
      </head>
      <body>
        <Progreso />
        {children}
      </body>
    </html>
  );
}
