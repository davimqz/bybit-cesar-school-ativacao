"use client";

import { useState } from "react";
import { useConnection, useReadContract } from "wagmi";
import { parseEther } from "viem";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, Stat, NotaDeAula } from "@/components/ui";
import { LivroDeOrdens } from "@/components/trade/LivroDeOrdens";
import { ExecutarOrdem } from "@/components/trade/ExecutarOrdem";
import { OrdemAMercado } from "@/components/trade/OrdemAMercado";
import { OrdemLimitada } from "@/components/trade/OrdemLimitada";
import { MinhasOrdens } from "@/components/trade/MinhasOrdens";
import { useLivro } from "@/hooks/useLivro";
import {
  CONTRACTS,
  abis,
  fmt,
  fmtBps,
  fmtPreco,
  type Ordem,
} from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";

export default function TradePage() {
  const { address, isConnected } = useConnection();
  const [selecionada, setSelecionada] = useState<Ordem | undefined>();
  const livro = useLivro();

  function recarregar() {
    livro.refetch();
    setSelecionada(undefined);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Trade — livro de ordens
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          O outro jeito de formar preço. Aqui não existe fórmula: existe gente
          oferecendo. O preço é o último acordo entre duas pessoas, e o espaço
          entre a melhor compra e a melhor venda — o <strong>spread</strong> — é
          de quem se dispôs a ficar no meio.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Card>
          <Stat
            rotulo="Melhor compra (bid)"
            valor={fmtPreco(livro.bid)}
            sufixo="BRLX"
            tom="bom"
            dica={livro.bidQtd ? `${fmt(livro.bidQtd)} CSR na fila` : undefined}
          />
        </Card>
        <Card>
          <Stat
            rotulo="Melhor venda (ask)"
            valor={fmtPreco(livro.ask)}
            sufixo="BRLX"
            tom="ruim"
            dica={livro.askQtd ? `${fmt(livro.askQtd)} CSR na fila` : undefined}
          />
        </Card>
        <Card>
          <Stat
            rotulo="Spread"
            valor={fmtBps(livro.spreadBps)}
            tom={(livro.spreadBps ?? 0n) > 300n ? "alerta" : "neutro"}
            dica={`${livro.ordensVivas ?? 0} ordens vivas`}
          />
        </Card>
      </div>

      <ComparadorMercados />

      <Card>
        <ConnectBar />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <LivroDeOrdens
          vendas={livro.vendas}
          compras={livro.compras}
          spreadBps={livro.spreadBps}
          meio={livro.meio}
          selecionada={selecionada?.id}
          onSelecionar={setSelecionada}
          meuEndereco={address}
        />
        <div className="space-y-6">
          <ExecutarOrdem ordem={selecionada} onFeito={recarregar} />
          <OrdemAMercado onFeito={recarregar} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OrdemLimitada bid={livro.bid} ask={livro.ask} onFeito={recarregar} />
        <MinhasOrdens
          minhas={livro.minhas}
          conectado={isConnected}
          onFeito={recarregar}
        />
      </div>
    </div>
  );
}

/**
 * O mesmo volume, no livro e no pool, lado a lado.
 *
 * Os dois volumes não são decorativos: 100 CSR cabe no topo do livro, onde o
 * spread de 50 bps bate a taxa de 30 bps do pool mais o deslize da curva. 1200
 * CSR passa de toda a oferta do livro (~900), e aí não é questão de preço — o
 * livro simplesmente não executa, e a curva executa.
 */
function ComparadorMercados() {
  const CABE_NO_LIVRO = parseEther("100");
  const MAIOR_QUE_O_LIVRO = parseEther("1200");

  return (
    <Card
      titulo="Mesma venda, dois mercados"
      subtitulo="Vender CSR agora: no livro e no pool fundo"
    >
      <div className="space-y-5">
        <Comparacao rotulo="Ordem pequena" volume={CABE_NO_LIVRO} />
        <Comparacao rotulo="Ordem grande" volume={MAIOR_QUE_O_LIVRO} />
      </div>
      <NotaDeAula>
        Não existe vencedor fixo, e a razão muda com o tamanho. Na ordem pequena
        o livro ganha: o spread que você paga ao topo é mais barato que a taxa
        do pool somada ao deslize da curva. Na ordem grande o livro nem entra na
        disputa — ele fica sem ofertas e deixa parte da sua venda sem executar,
        enquanto a curva atende qualquer tamanho, cobrando cada vez mais caro.
        Comparar os dois antes de assinar é literalmente o serviço que um
        agregador vende.
      </NotaDeAula>
    </Card>
  );
}

function Comparacao({ rotulo, volume }: { rotulo: string; volume: bigint }) {
  const { data: noLivro } = useReadContract({
    chainId: activeChain.id,
    address: CONTRACTS.orderBook,
    abi: abis.livro,
    functionName: "simularVenda",
    args: [volume],
    query: { refetchInterval: 4000 },
  });

  const { data: noPool } = useReadContract({
    chainId: activeChain.id,
    address: CONTRACTS.poolFundo,
    abi: abis.pool,
    functionName: "previewSwap",
    args: [CONTRACTS.csr, volume],
    query: { refetchInterval: 4000 },
  });

  const l = noLivro as readonly [bigint, bigint, bigint, bigint] | undefined;
  const p = noPool as readonly [bigint, bigint, bigint] | undefined;

  // Um total maior não vence se metade da ordem ficou sem executar: comparar
  // preço com preenchimento parcial é comparar coisas diferentes.
  const livroPreencheu = l !== undefined && l[1] >= volume;
  const livroMelhor = l && p ? livroPreencheu && l[0] > p[0] : undefined;

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-foreground">{rotulo}</h3>
        <span className="text-sm text-muted-foreground">
          vender {fmt(volume, 0)} CSR
        </span>
      </div>
      <dl className="grid gap-5 sm:grid-cols-4">
        <Stat
          rotulo="Livro · você recebe"
          valor={fmt(l?.[0])}
          sufixo="BRLX"
          tom={livroMelhor === true ? "bom" : "neutro"}
          dica={
            l && l[1] < volume ? `só ${fmt(l[1], 0)} CSR caberiam` : undefined
          }
        />
        <Stat rotulo="Livro · slippage" valor={fmtBps(l?.[3])} />
        <Stat
          rotulo="Pool · você recebe"
          valor={fmt(p?.[0])}
          sufixo="BRLX"
          tom={livroMelhor === false ? "bom" : "neutro"}
        />
        <Stat rotulo="Pool · slippage" valor={fmtBps(p?.[2])} />
      </dl>
    </div>
  );
}
