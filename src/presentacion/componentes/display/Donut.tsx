'use client';
import { arc as d3arc, pie as d3pie } from 'd3-shape';
import { useState } from 'react';
import type { Agregado } from '@/dominio/display/share';
import { num, pct, pct0 } from '@/dominio/comun/formato';

const PALETA: Record<string, string> = {
  Honor: 'var(--acc)', Samsung: '#3b82f6', Apple: '#a1a1aa', Xiaomi: '#f43f5e', Motorola: '#2dd4bf',
  Oppo: '#22c55e', Vivo: '#8b5cf6', Infinix: '#eab308', ZTE: '#38bdf8', Huawei: '#d946ef',
};
const EXTRA = ['#f472b6', '#84cc16', '#fb923c', '#c084fc', '#14b8a6', '#facc15'];
export const colorMarca = (m: string, i: number) => PALETA[m] ?? EXTRA[i % EXTRA.length];

export default function Donut({ grupo, marcas, unidad }: { grupo: Agregado[]; marcas: string[]; unidad: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; d: Agregado } | null>(null);
  const data = grupo.filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor);
  if (!data.length) return <div className="empty">Sin datos para este filtro.</div>;

  const S = 230, R = S / 2, r0 = R * 0.6;
  const arcs = d3pie<Agregado>().sort(null).value((d) => d.valor).padAngle(0.012)(data);
  const arc = d3arc<(typeof arcs)[number]>().innerRadius(r0).outerRadius(R - 4).cornerRadius(3);
  const mid = d3arc<(typeof arcs)[number]>().innerRadius((r0 + R) / 2).outerRadius((r0 + R) / 2);
  const h = data.find((d) => d.marca === 'Honor');

  return (
    <div className="donut" onMouseLeave={() => setTip(null)}>
      <svg width={S} height={S} viewBox={`${-R} ${-R} ${S} ${S}`} role="img" aria-label="Mix por marca">
        {arcs.map((a) => (
          <path
            key={a.data.marca}
            d={arc(a) ?? ''}
            fill={colorMarca(a.data.marca, marcas.indexOf(a.data.marca))}
            stroke="var(--panel)"
            strokeWidth={1.5}
            onMouseMove={(e) => {
              const box = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
              setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top + 12, d: a.data });
            }}
          />
        ))}
        {arcs.filter((a) => (a.data.share ?? 0) >= 0.06).map((a) => {
          const [x, y] = mid.centroid(a);
          return (
            <text key={'l' + a.data.marca} x={x} y={y} dy=".35em" textAnchor="middle" fontSize={11} fontWeight={800} fill="#0b0b0e" pointerEvents="none">
              {pct0(a.data.share)}
            </text>
          );
        })}
        {h && (
          <>
            <text textAnchor="middle" dy="-.05em" fontSize={26} fontWeight={800} fill="var(--acc)">{pct(h.share)}</text>
            <text textAnchor="middle" dy="1.7em" fontSize={10.5} fontWeight={800} fill="var(--mut)" letterSpacing=".14em">HONOR</text>
          </>
        )}
      </svg>
      <div className="leg">
        {data.map((d) => {
          const hon = d.marca === 'Honor';
          return (
            <div key={d.marca}>
              <i style={{ background: colorMarca(d.marca, marcas.indexOf(d.marca)) }} />
              <span className={hon ? 'h' : undefined}>{d.marca}</span>
              <span className={'p' + (hon ? ' h' : '')}>{pct(d.share)}</span>
              <span className="v">{num(d.valor)}</span>
            </div>
          );
        })}
      </div>
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          <div className="t">{tip.d.marca}</div>
          <div>{pct(tip.d.share)} | {num(tip.d.valor)} {unidad}</div>
        </div>
      )}
    </div>
  );
}
