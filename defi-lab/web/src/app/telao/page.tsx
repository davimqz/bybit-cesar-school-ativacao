"use client";

import { useCallback, useState } from "react";
import { useWatchContractEvent, useReadContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import {
  POOLS,
  CONTRACTS,
  LADO,
  abis,
  fmt,
  fmtBps,
  fmtPreco,
  encurtar,
  tokenPorEndereco,
} from "@/lib/contracts";

/**
 * Tela do projetor. Mostra o que a turma está fazendo, ao vivo.
 *
 * Nada aqui pede carteira: é uma página de leitura pura, para ficar aberta
 * num segundo monitor enquanto a aula acontece.
 */

type Evento = {
  id: string;
  tipo: "swap" | "entrou" | "saiu" | "ordem" | "negocio";
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
      <ObservadorDoLivro onEvento={registrar} />

      <Placar />
      <PlacarDoLivro />

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
                    {
                      swap: "bg-slate-900",
                      entrou: "bg-emerald-500",
                      saiu: "bg-rose-500",
                      ordem: "bg-sky-500",
                      negocio: "bg-amber-500",
                    }[e.tipo]
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

/**
 * O livro é o lado "humano" do telão: cada linha aqui é alguém oferecendo ou
 * alguém aceitando. Vale contrastar com os eventos do pool, que nunca dizem
 * "de quem" veio o preço.
 */
function ObservadorDoLivro({ onEvento }: { onEvento: (e: Evento) => void }) {
  const base = { address: CONTRACTS.orderBook, abi: abis.livro } as const;

  useWatchContractEvent({
    ...base,
    eventName: "OrdemColocada",
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args;
        if (!a.dono) continue;
        const vendendo = Number(a.lado) === LADO.venda;
        onEvento({
          id: `${log.transactionHash}-${log.logIndex}`,
          tipo: "ordem",
          quem: a.dono,
          texto: `ofereceu ${vendendo ? "venda" : "compra"} de ${fmt(a.quantidade, 0)} CSR a ${fmtPreco(a.preco)} · livro`,
        });
      }
    },
  });

  useWatchContractEvent({
    ...base,
    eventName: "OrdemExecutada",
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args;
        if (!a.taker) continue;
        const makerVendia = Number(a.ladoDoMaker) === LADO.venda;
        onEvento({
          id: `${log.transactionHash}-${log.logIndex}`,
          tipo: "negocio",
          quem: a.taker,
          texto: `${makerVendia ? "comprou" : "vendeu"} ${fmt(a.quantidade, 0)} CSR a ${fmtPreco(a.preco)} de ${encurtar(a.maker)} · livro`,
        });
      }
    },
  });

  useWatchContractEvent({
    ...base,
    eventName: "OrdemCancelada",
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args;
        if (!a.dono) continue;
        onEvento({
          id: `${log.transactionHash}-${log.logIndex}`,
          tipo: "saiu",
          quem: a.dono,
          texto: `tirou ${fmt(a.quantidadeDevolvida, 0)} CSR do livro · livro`,
        });
      }
    },
  });

  return null;
}

function PlacarDoLivro() {
  const base = { address: CONTRACTS.orderBook, abi: abis.livro } as const;
  const opcoes = { query: { refetchInterval: 3000 } } as const;

  const { data: bid } = useReadContract({ ...base, functionName: "melhorCompra", ...opcoes });
  const { data: ask } = useReadContract({ ...base, functionName: "melhorVenda", ...opcoes });
  const { data: spread } = useReadContract({ ...base, functionName: "spreadBps", ...opcoes });
  const { data: vivas } = useReadContract({ ...base, functionName: "ordensVivas", ...opcoes });

  const b = bid as readonly [bigint, bigint] | undefined;
  const a = ask as readonly [bigint, bigint] | undefined;

  return (
    <dl className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-8 sm:grid-cols-4">
      <Numerao rotulo="Livro · bid" valor={fmtPreco(b?.[0])} sufixo="BRLX" />
      <Numerao rotulo="Livro · ask" valor={fmtPreco(a?.[0])} sufixo="BRLX" />
      <Numerao rotulo="Spread" valor={fmtBps(spread as bigint | undefined)} dica="quem fica no meio, ganha" />
      <Numerao rotulo="Ordens vivas" valor={vivas !== undefined ? String(vivas) : "—"} />
    </dl>
  );
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
