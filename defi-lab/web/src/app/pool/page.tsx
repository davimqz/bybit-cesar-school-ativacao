"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { parseEther } from "viem";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, Stat, NotaDeAula } from "@/components/ui";
import { CurvaXY } from "@/components/pool/CurvaXY";
import { SwapCard } from "@/components/pool/SwapCard";
import { LiquidezCard } from "@/components/pool/LiquidezCard";
import { PainelIL } from "@/components/pool/PainelIL";
import { usePoolData } from "@/hooks/usePool";
import {
  POOLS,
  CONTRACTS,
  abis,
  fmt,
  fmtBps,
  type PoolKey,
} from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";

export default function PoolPage() {
  const [poolKey, setPoolKey] = useState<PoolKey>("fundo");
  const [previsto, setPrevisto] = useState<
    { x: number; y: number } | undefined
  >();

  const pool = POOLS.find((p) => p.key === poolKey)!;
  const dados = usePoolData(pool.address);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Pool de liquidez
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Um caixa coletivo e uma fórmula. Sem livro de ordens, sem contraparte
          do outro lado — só a curva <strong>x · y = k</strong> e as reservas
          que você mesmo pode mover.
        </p>
      </div>

      <ComparadorDePools />

      <Card>
        <ConnectBar />
      </Card>

      <div className="flex gap-2">
        {POOLS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPoolKey(p.key)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              poolKey === p.key
                ? "border-foreground bg-card shadow-sm"
                : "border-border bg-card/60 hover:border-input"
            }`}
          >
            <span className="block text-sm font-semibold">{p.nome}</span>
            <span className="block text-xs text-muted-foreground">
              {p.descricao}
            </span>
          </button>
        ))}
      </div>

      <Card titulo={`Estado do ${pool.nome.toLowerCase()}`}>
        <dl className="mb-6 grid gap-5 sm:grid-cols-4">
          <Stat rotulo="Reserva CSR" valor={fmt(dados.reserve0)} />
          <Stat rotulo="Reserva BRLX" valor={fmt(dados.reserve1)} />
          <Stat
            rotulo="Preço spot"
            valor={fmt(dados.spot, 4)}
            sufixo="BRLX/CSR"
            dica="reserve1 ÷ reserve0"
          />
          <Stat
            rotulo="Shares emitidas"
            valor={fmt(dados.totalShares)}
            dica="o token de LP deste pool"
          />
        </dl>

        <CurvaXY
          reserve0={dados.reserve0}
          reserve1={dados.reserve1}
          previsto={previsto}
        />

        <NotaDeAula>
          O ponto preto é o pool agora. Digite um valor no swap ao lado e o
          ponto laranja mostra onde ele vai parar. Quanto mais longe, mais você
          mesmo empurrou o preço contra você.
        </NotaDeAula>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <SwapCard pool={pool.address} onPrevisto={setPrevisto} />
        <div className="space-y-6">
          <LiquidezCard pool={pool.address} />
          <PainelIL pool={pool.address} />
        </div>
      </div>
    </div>
  );
}

/**
 * O mesmo swap, nos dois pools, lado a lado. É a demonstração mais direta
 * de que profundidade de liquidez é preço — e ela roda sozinha, sem ninguém
 * precisar assinar nada.
 */
function ComparadorDePools() {
  const VOLUME = parseEther("100");

  const { data: fundo } = useReadContract({
    chainId: activeChain.id,
    address: CONTRACTS.poolFundo,
    abi: abis.pool,
    functionName: "previewSwap",
    args: [CONTRACTS.csr, VOLUME],
    query: { refetchInterval: 4000 },
  });

  const { data: raso } = useReadContract({
    chainId: activeChain.id,
    address: CONTRACTS.poolRaso,
    abi: abis.pool,
    functionName: "previewSwap",
    args: [CONTRACTS.csr, VOLUME],
    query: { refetchInterval: 4000 },
  });

  const f = fundo as readonly [bigint, bigint, bigint] | undefined;
  const r = raso as readonly [bigint, bigint, bigint] | undefined;

  return (
    <Card
      titulo="Mesmo swap, dois pools"
      subtitulo="Vender 100 CSR agora, neste instante"
    >
      <dl className="grid gap-5 sm:grid-cols-4">
        <Stat
          rotulo="Pool fundo · você recebe"
          valor={fmt(f?.[0])}
          sufixo="BRLX"
          tom="bom"
        />
        <Stat
          rotulo="Pool fundo · slippage"
          valor={fmtBps(f?.[2])}
          tom="neutro"
        />
        <Stat
          rotulo="Pool raso · você recebe"
          valor={fmt(r?.[0])}
          sufixo="BRLX"
          tom="ruim"
        />
        <Stat rotulo="Pool raso · slippage" valor={fmtBps(r?.[2])} tom="ruim" />
      </dl>
      <NotaDeAula>
        Mesma fórmula, mesmo preço de vitrine, mesma ordem. A única diferença é
        o tamanho do caixa. Profundidade de liquidez não é detalhe técnico: é
        quanto custa negociar.
      </NotaDeAula>
    </Card>
  );
}
