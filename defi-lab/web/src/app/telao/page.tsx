"use client";

import { useCallback, useState } from "react";
import { useWatchContractEvent, useReadContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import { POOLS, CONTRACTS, abis, fmt, encurtar, tokenPorEndereco } from "@/lib/contracts";

/**
 * Tela do projetor. Mostra o que a turma está fazendo, ao vivo.
 *
 * Nada aqui pede carteira: é uma página de leitura pura, para ficar aberta
 * num segundo monitor enquanto a aula acontece.
 */

type Evento = {
  id: string;
  tipo: "swap" | "entrou" | "saiu";
  quem: Address;
  texto: string;
};

export default function TelaoPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);

  const registrar = useCallback((novo: Evento) => {
    setEventos((antes) => [novo, ...antes.filter((e) => e.id !== novo.id)].slice(0, 14));
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-semibold tracking-tight">Ao vivo</h1>

      {/* Um observador por pool: hooks em quantidade fixa, do jeito certo. */}
      {POOLS.map((pool) => (
        <ObservadorDePool key={pool.key} pool={pool} onEvento={registrar} />
      ))}

      <Placar />

      <div className="rounded-2xl border border-slate-200 bg-white">
        {eventos.length === 0 ? (
          <p className="p-10 text-center text-lg text-slate-400">
            Esperando a primeira transação da turma…
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {eventos.map((e) => (
              <li key={e.id} className="flex items-baseline gap-4 px-6 py-4">
                <span
                  className={`h-2 w-2 shrink-0 self-center rounded-full ${
                    e.tipo === "swap"
                      ? "bg-slate-900"
                      : e.tipo === "entrou"
                        ? "bg-emerald-500"
                        : "bg-rose-500"
                  }`}
                />
                <span className="font-mono text-lg text-slate-500">{encurtar(e.quem)}</span>
                <span className="text-lg text-slate-900">{e.texto}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ObservadorDePool({
  pool,
  onEvento,
}: {
  pool: (typeof POOLS)[number];
  onEvento: (e: Evento) => void;
}) {
  const nome = pool.nome.toLowerCase();

  useWatchContractEvent({
    address: pool.address,
    abi: abis.pool,
    eventName: "Swap",
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args;
        if (!a.trader) continue;
        const entrada = tokenPorEndereco(a.tokenIn)?.symbol ?? "?";
        const saida = tokenPorEndereco(a.tokenOut)?.symbol ?? "?";
        onEvento({
          id: `${log.transactionHash}-${log.logIndex}`,
          tipo: "swap",
          quem: a.trader,
          texto: `trocou ${fmt(a.amountIn, 0)} ${entrada} por ${fmt(a.amountOut, 0)} ${saida} · ${nome}`,
        });
      }
    },
  });

  useWatchContractEvent({
    address: pool.address,
    abi: abis.pool,
    eventName: "LiquidityAdded",
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args;
        if (!a.provider) continue;
        onEvento({
          id: `${log.transactionHash}-${log.logIndex}`,
          tipo: "entrou",
          quem: a.provider,
          texto: `virou LP com ${fmt(a.amount0, 0)} CSR + ${fmt(a.amount1, 0)} BRLX · ${nome}`,
        });
      }
    },
  });

  useWatchContractEvent({
    address: pool.address,
    abi: abis.pool,
    eventName: "LiquidityRemoved",
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args;
        if (!a.provider) continue;
        onEvento({
          id: `${log.transactionHash}-${log.logIndex}`,
          tipo: "saiu",
          quem: a.provider,
          texto: `saiu levando ${fmt(a.amount0, 0)} CSR + ${fmt(a.amount1, 0)} BRLX · ${nome}`,
        });
      }
    },
  });

  return null;
}

function Placar() {
  const base = { address: CONTRACTS.poolFundo, abi: abis.pool } as const;
  const opcoes = { query: { refetchInterval: 3000 } } as const;

  const { data: reservas } = useReadContract({ ...base, functionName: "getReserves", ...opcoes });
  const { data: k } = useReadContract({ ...base, functionName: "invariant", ...opcoes });
  const { data: spot } = useReadContract({ ...base, functionName: "spotPrice0In1", ...opcoes });

  const r = reservas as readonly [bigint, bigint] | undefined;

  return (
    <dl className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-8 sm:grid-cols-4">
      <Numerao rotulo="Preço CSR" valor={fmt(spot, 4)} sufixo="BRLX" />
      <Numerao rotulo="Reserva CSR" valor={fmt(r?.[0], 0)} />
      <Numerao rotulo="Reserva BRLX" valor={fmt(r?.[1], 0)} />
      <Numerao
        rotulo="k"
        valor={
          k !== undefined
            ? // k está em 1e36 (produto de dois valores de 18 casas).
              Number(formatUnits(k as bigint, 36)).toLocaleString("pt-BR", {
                maximumFractionDigits: 0,
              })
            : "—"
        }
        dica="só cresce, pelas taxas"
      />
    </dl>
  );
}

function Numerao({
  rotulo,
  valor,
  sufixo,
  dica,
}: {
  rotulo: string;
  valor: string;
  sufixo?: string;
  dica?: string;
}) {
  return (
    <div>
      <dt className="text-sm uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="mt-1 text-4xl font-semibold tabular-nums text-slate-900">
        {valor}
        {sufixo && <span className="ml-2 text-xl font-normal text-slate-400">{sufixo}</span>}
      </dd>
      {dica && <p className="mt-1 text-xs text-slate-400">{dica}</p>}
    </div>
  );
}
