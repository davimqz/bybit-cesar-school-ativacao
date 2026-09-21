"use client";

import { formatUnits } from "viem";

/**
 * A curva x · y = k, com o ponto atual do pool em cima dela.
 *
 * Quando há uma simulação em andamento, desenha também onde o pool vai
 * parar depois do swap. Ver o ponto escorregar pela curva é o momento em
 * que "slippage" deixa de ser uma palavra e vira uma distância.
 */
export function CurvaXY({
  reserve0,
  reserve1,
  previsto,
}: {
  reserve0?: bigint;
  reserve1?: bigint;
  previsto?: { x: number; y: number };
}) {
  if (!reserve0 || !reserve1 || reserve0 === 0n || reserve1 === 0n) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Pool ainda sem liquidez.
      </div>
    );
  }

  const x0 = Number(formatUnits(reserve0, 18));
  const y0 = Number(formatUnits(reserve1, 18));
  const k = x0 * y0;

  // Janela em torno do ponto atual. Se há previsão, garante que ela caiba.
  const xs = [x0 * 0.4, x0 * 2.2, previsto?.x ?? x0];
  const xMin = Math.min(...xs) * 0.9;
  const xMax = Math.max(...xs) * 1.1;
  const yMin = k / xMax;
  const yMax = k / xMin;

  const W = 520;
  const H = 260;
  const PAD = 28;

  const px = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD);
  const py = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin)) * (H - 2 * PAD);

  const pontos: string[] = [];
  const PASSOS = 120;
  for (let i = 0; i <= PASSOS; i++) {
    const x = xMin + ((xMax - xMin) * i) / PASSOS;
    pontos.push(`${px(x).toFixed(2)},${py(k / x).toFixed(2)}`);
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Curva x vezes y igual a k">
        {/* eixos */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#cbd5e1" strokeWidth="1" />

        <polyline points={pontos.join(" ")} fill="none" stroke="#0f172a" strokeWidth="2" />

        {/* deslocamento previsto */}
        {previsto && (
          <>
            <line
              x1={px(x0)}
              y1={py(y0)}
              x2={px(previsto.x)}
              y2={py(previsto.y)}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <circle cx={px(previsto.x)} cy={py(previsto.y)} r="6" fill="#f59e0b" />
            <text
              x={px(previsto.x)}
              y={py(previsto.y) - 12}
              textAnchor="middle"
              className="fill-amber-600 text-[10px] font-medium"
            >
              depois do swap
            </text>
          </>
        )}

        <circle cx={px(x0)} cy={py(y0)} r="6" fill="#0f172a" />
        <text x={px(x0)} y={py(y0) - 12} textAnchor="middle" className="fill-slate-900 text-[10px] font-medium">
          agora
        </text>

        <text x={W - PAD} y={H - 8} textAnchor="end" className="fill-slate-400 text-[10px]">
          CSR no pool →
        </text>
        <text x={8} y={PAD} className="fill-slate-400 text-[10px]">
          ↑ BRLX
        </text>
      </svg>
    </div>
  );
}
