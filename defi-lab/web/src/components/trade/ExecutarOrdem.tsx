"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { formatUnits, maxUint256 } from "viem";
import {
  Card,
  Stat,
  Botao,
  CampoValor,
  Aviso,
  NotaDeAula,
} from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { useSaldosEAprovacoes } from "@/hooks/usePool";
import { paraWei } from "@/components/pool/SwapCard";
import {
  CONTRACTS,
  LADO,
  TOKENS,
  abis,
  fmt,
  fmtPreco,
  type Ordem,
} from "@/lib/contracts";

/**
 * Executar contra UMA ordem escolhida a dedo.
 *
 * É o gesto que não existe num AMM: você vê o preço, vê de quem é, e sabe
 * exatamente quanto vai pagar antes de assinar. Nenhuma curva no meio.
 */
export function ExecutarOrdem({
  ordem,
  onFeito,
}: {
  ordem?: Ordem;
  onFeito: () => void;
}) {
  const { address, isConnected } = useConnection();
  const [quantia, setQuantia] = useState("");
  const { saldoCsr, saldoBrlx, allowanceCsr, allowanceBrlx, refetch } =
    useSaldosEAprovacoes(CONTRACTS.orderBook);

  const txAprovar = useTx();
  const txExecutar = useTx();

  // Ordem nova selecionada: o campo já vem com a quantidade inteira dela.
  // `formatUnits` e não `fmt`: o campo precisa de um número que o parser aceite
  // de volta, não de um número formatado para leitura humana.
  //
  // Ajuste durante a renderização, não num efeito: um efeito só rodaria depois
  // de pintar, então o aluno veria por um quadro a quantidade da ordem anterior
  // no campo — exatamente o número que ele não quer assinar.
  const [ordemNoCampo, setOrdemNoCampo] = useState(ordem?.id);
  if (ordem && ordem.id !== ordemNoCampo) {
    setOrdemNoCampo(ordem.id);
    setQuantia(formatUnits(ordem.quantidade, 18));
  }

  if (!ordem) {
    return (
      <Card titulo="Executar uma ordem" subtitulo="Você escolhe a contraparte">
        <Aviso tom="info">
          Clique numa linha do livro ao lado para negociar contra aquela ordem.
        </Aviso>
      </Card>
    );
  }

  const makerVende = Number(ordem.lado) === LADO.venda;
  const minha = !!address && ordem.dono.toLowerCase() === address.toLowerCase();

  const pedida = paraWei(quantia);
  const qtd =
    pedida !== undefined && pedida > ordem.quantidade
      ? ordem.quantidade
      : pedida;
  const valorQuote =
    qtd !== undefined ? (qtd * ordem.preco) / 10n ** 18n : undefined;

  // Quem toma uma ordem de venda paga BRLX; quem toma uma de compra entrega CSR.
  const tokenQueSai = makerVende ? TOKENS.brlx : TOKENS.csr;
  const tokenQueEntra = makerVende ? TOKENS.csr : TOKENS.brlx;
  const quantiaQueSai = makerVende ? valorQuote : qtd;
  const quantiaQueEntra = makerVende ? qtd : valorQuote;

  const allowance = makerVende ? allowanceBrlx : allowanceCsr;
  const saldo = makerVende ? saldoBrlx : saldoCsr;
  const precisaAprovar =
    quantiaQueSai !== undefined && (allowance ?? 0n) < quantiaQueSai;
  const semSaldo = quantiaQueSai !== undefined && (saldo ?? 0n) < quantiaQueSai;

  return (
    <Card
      titulo="Executar uma ordem"
      subtitulo={`Ordem #${ordem.id} · ${makerVende ? "alguém vendendo" : "alguém comprando"} CSR`}
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 rounded-xl bg-muted p-4">
          <Stat
            rotulo="Preço da ordem"
            valor={fmtPreco(ordem.preco)}
            sufixo="BRLX"
          />
          <Stat
            rotulo="Disponível nela"
            valor={fmt(ordem.quantidade)}
            sufixo="CSR"
          />
        </dl>

        {minha ? (
          <Aviso tom="alerta">
            Esta ordem é sua. O contrato bloqueia auto-negociação — trocar com
            você mesmo não move mercado, só simula volume. Para desfazer,
            cancele na lista abaixo.
          </Aviso>
        ) : (
          <>
            <CampoValor
              rotulo="Quantidade"
              valor={quantia}
              onChange={setQuantia}
              sufixo="CSR"
              disponivel={fmt(saldo)}
            />

            {qtd !== undefined && qtd > 0n && (
              <dl className="grid grid-cols-2 gap-4">
                <Stat
                  rotulo="Você entrega"
                  valor={fmt(quantiaQueSai)}
                  sufixo={tokenQueSai.symbol}
                  tom="ruim"
                />
                <Stat
                  rotulo="Você recebe"
                  valor={fmt(quantiaQueEntra)}
                  sufixo={tokenQueEntra.symbol}
                  tom="bom"
                />
              </dl>
            )}

            {semSaldo && (
              <Aviso tom="alerta">
                Saldo de {tokenQueSai.symbol} insuficiente para essa quantidade.
                Pegue mais no faucet ou reduza a ordem.
              </Aviso>
            )}

            {/*
              Duas transacoes, duas etapas visiveis. O botao de aprovar NAO some
              depois de usado: quando ele sumia, o aluno assinava o `approve`,
              via o aviso verde e achava que tinha executado a ordem — mas
              `approve` nao fecha negocio nenhum, e a ordem continuava no livro.
            */}
            <p className="text-sm text-muted-foreground">
              Executar são <strong>duas transações</strong>: a aprovação apenas
              escreve uma permissão, e é o passo 2 que fecha o negócio.
            </p>

            <div className="flex flex-wrap gap-3">
              <Botao
                variante={precisaAprovar ? "primario" : "secundario"}
                disabled={
                  !isConnected || !precisaAprovar || txAprovar.ocupada
                }
                onClick={async () => {
                  await txAprovar.enviar({
                    address: tokenQueSai.address,
                    abi: abis.token,
                    functionName: "approve",
                    args: [CONTRACTS.orderBook, maxUint256],
                  });
                  refetch();
                }}
              >
                {txAprovar.ocupada
                  ? "Processando…"
                  : precisaAprovar
                    ? `Passo 1 de 2 · Aprovar ${tokenQueSai.symbol}`
                    : `Passo 1 de 2 · ${tokenQueSai.symbol} aprovado ✓`}
              </Botao>
              <Botao
                disabled={
                  !isConnected ||
                  !qtd ||
                  qtd === 0n ||
                  precisaAprovar ||
                  semSaldo ||
                  txExecutar.ocupada
                }
                onClick={async () => {
                  if (!qtd) return;
                  await txExecutar.enviar({
                    address: CONTRACTS.orderBook,
                    abi: abis.livro,
                    functionName: "executar",
                    args: [ordem.id, qtd],
                  });
                  refetch();
                  onFeito();
                }}
              >
                {txExecutar.ocupada
                  ? "Executando…"
                  : "Passo 2 de 2 · Executar"}
              </Botao>
            </div>

            {!txExecutar.hash && (
              <StatusTx
                tx={txAprovar}
                sucesso="Aprovado — e nenhum token saiu da sua carteira ainda. Falta o passo 2: clique em Executar."
              />
            )}
            <StatusTx
              tx={txExecutar}
              sucesso="Negócio fechado no preço que estava na tela."
            />
          </>
        )}

        <NotaDeAula>
          Repare no que <em>não</em> aparece aqui: nenhum campo de tolerância.
          Você está executando no preço exato de uma ordem que já existe, e ele
          não desliza. O risco é outro — alguém pode tomar essa mesma ordem
          antes de você, e a sua transação reverte ou executa menos do que você
          pediu.
        </NotaDeAula>
      </div>
    </Card>
  );
}
