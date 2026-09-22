"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { activeChain } from "@/lib/wagmi";
import { useFeedDaTurma } from "@/hooks/useFeedDaTurma";
import { Button } from "@/components/ui/button";
import {
  CONTRACTS,
  abis,
  fmt,
  fmtBps,
  fmtPreco,
  encurtar,
} from "@/lib/contracts";

/**
 * Tela do projetor. Mostra o que a turma está fazendo, ao vivo.
 *
 * Nada aqui pede carteira: é uma página de leitura pura, para ficar aberta
 * num segundo monitor enquanto a aula acontece.
 */

/**
 * Quantas transações a tela mostra de uma vez.
 *
 * O feed guarda bem mais do que isso (`HISTORICO`, no hook): numa turma cheia
 * a lista passava de cem linhas e o projetor só mostrava o topo, sem nenhuma
 * pista de que havia mais embaixo. Cinquenta por página dão rolagem curta e um
 * contador que diz onde a aula está.
 */
const POR_PAGINA = 50;

export default function TelaoPage() {
  const { eventos, carregando, erro } = useFeedDaTurma();
  const [pagina, setPagina] = useState(1);

  const totalPaginas = Math.max(1, Math.ceil(eventos.length / POR_PAGINA));

  // A página vive presa ao intervalo válido em vez de ser corrigida por um
  // efeito: o feed encolhe quando o histórico satura, e quem estivesse na
  // última página veria uma lista vazia por um ciclo.
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visiveis = eventos.slice(inicio, inicio + POR_PAGINA);

  const irPara = (n: number) =>
    setPagina(Math.min(Math.max(n, 1), totalPaginas));

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-semibold tracking-tight">Ao vivo</h1>

      <Placar />
      <PlacarDoLivro />

      <div className="rounded-2xl border border-border bg-card">
        {erro ? (
          <p className="p-10 text-center text-lg text-down">
            Não consegui ler a rede: {erro}
          </p>
        ) : carregando ? (
          <p className="p-10 text-center text-lg text-muted-foreground">
            Procurando o que a turma já fez…
          </p>
        ) : eventos.length === 0 ? (
          <p className="p-10 text-center text-lg text-muted-foreground">
            Esperando a primeira transação da turma…
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border px-6 py-4">
              <p className="text-lg text-muted-foreground">
                <span className="font-mono tabular-nums text-foreground">
                  {inicio + 1}–{inicio + visiveis.length}
                </span>{" "}
                de{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {eventos.length}
                </span>{" "}
                transações
                {paginaAtual > 1 && " · as novas entram na página 1"}
              </p>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => irPara(paginaAtual - 1)}
                  disabled={paginaAtual === 1}
                >
                  Anterior
                </Button>
                <span className="font-mono text-lg tabular-nums text-foreground">
                  Página {paginaAtual} de {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => irPara(paginaAtual + 1)}
                  disabled={paginaAtual === totalPaginas}
                >
                  Próxima
                </Button>
              </div>
            </div>

            <ul className="divide-y divide-border">
              {visiveis.map((e) => (
                <li key={e.id} className="flex items-baseline gap-4 px-6 py-4">
                  <span
                    className={`h-2 w-2 shrink-0 self-center rounded-full ${
                      {
                        swap: "bg-primary",
                        entrou: "bg-up",
                        saiu: "bg-down",
                        ordem: "bg-muted-foreground",
                        negocio: "bg-signal",
                      }[e.tipo]
                    }`}
                  />
                  <span className="font-mono text-lg text-muted-foreground">
                    {encurtar(e.quem)}
                  </span>
                  <span className="text-lg text-foreground">{e.texto}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function PlacarDoLivro() {
  const base = {
    address: CONTRACTS.orderBook,
    abi: abis.livro,
    chainId: activeChain.id,
  } as const;
  const opcoes = { query: { refetchInterval: 3000 } } as const;

  const { data: bid } = useReadContract({
    ...base,
    functionName: "melhorCompra",
    ...opcoes,
  });
  const { data: ask } = useReadContract({
    ...base,
    functionName: "melhorVenda",
    ...opcoes,
  });
  const { data: spread } = useReadContract({
    ...base,
    functionName: "spreadBps",
    ...opcoes,
  });
  const { data: vivas } = useReadContract({
    ...base,
    functionName: "ordensVivas",
    ...opcoes,
  });

  const b = bid as readonly [bigint, bigint] | undefined;
  const a = ask as readonly [bigint, bigint] | undefined;

  return (
    <dl className="grid gap-6 rounded-2xl border border-border bg-card p-8 sm:grid-cols-4">
      <Numerao rotulo="Livro · bid" valor={fmtPreco(b?.[0])} sufixo="BRLX" />
      <Numerao rotulo="Livro · ask" valor={fmtPreco(a?.[0])} sufixo="BRLX" />
      <Numerao
        rotulo="Spread"
        valor={fmtBps(spread as bigint | undefined)}
        dica="quem fica no meio, ganha"
      />
      <Numerao
        rotulo="Ordens vivas"
        valor={vivas !== undefined ? String(vivas) : "—"}
      />
    </dl>
  );
}

function Placar() {
  const base = {
    address: CONTRACTS.poolFundo,
    abi: abis.pool,
    chainId: activeChain.id,
  } as const;
  const opcoes = { query: { refetchInterval: 3000 } } as const;

  const { data: reservas } = useReadContract({
    ...base,
    functionName: "getReserves",
    ...opcoes,
  });
  const { data: k } = useReadContract({
    ...base,
    functionName: "invariant",
    ...opcoes,
  });
  const { data: spot } = useReadContract({
    ...base,
    functionName: "spotPrice0In1",
    ...opcoes,
  });

  const r = reservas as readonly [bigint, bigint] | undefined;

  return (
    <dl className="grid gap-6 rounded-2xl border border-border bg-card p-8 sm:grid-cols-4">
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
      <dt className="text-sm uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </dt>
      <dd className="mt-1 text-4xl font-semibold tabular-nums text-foreground">
        {valor}
        {sufixo && (
          <span className="ml-2 text-xl font-normal text-muted-foreground">
            {sufixo}
          </span>
        )}
      </dd>
      {dica && <p className="mt-1 text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}
