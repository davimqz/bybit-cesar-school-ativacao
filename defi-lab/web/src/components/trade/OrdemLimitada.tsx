"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { maxUint256 } from "viem";
import { Card, Stat, Botao, CampoValor, Aviso, NotaDeAula } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { useSaldosEAprovacoes } from "@/hooks/usePool";
import { paraWei } from "@/components/pool/SwapCard";
import { CONTRACTS, LADO, TOKENS, abis, fmt, fmtPreco } from "@/lib/contracts";

/**
 * Virar maker: colocar uma ordem e esperar.
 *
 * O contraste com o AMM é direto. Aqui você escolhe o preço e não paga
 * slippage nenhum — mas também não ganha nada até alguém aparecer. No pool,
 * você é contraparte de todo mundo automaticamente, e o preço é que você não
 * escolhe.
 */
export function OrdemLimitada({
  bid,
  ask,
  onFeito,
}: {
  bid?: bigint;
  ask?: bigint;
  onFeito: () => void;
}) {
  const { isConnected } = useConnection();
  const [vendendo, setVendendo] = useState(false);
  const [preco, setPreco] = useState("");
  const [quantia, setQuantia] = useState("50");

  const { saldoCsr, saldoBrlx, allowanceCsr, allowanceBrlx, refetch } = useSaldosEAprovacoes(
    CONTRACTS.orderBook,
  );

  const txAprovar = useTx();
  const txColocar = useTx();

  const precoWei = paraWei(preco);
  const qtd = paraWei(quantia);
  const custoQuote = precoWei !== undefined && qtd !== undefined ? (qtd * precoWei) / 10n ** 18n : undefined;

  // Vendedor deposita CSR; comprador deposita BRLX. Sempre no ato.
  const tokenEmCustodia = vendendo ? TOKENS.csr : TOKENS.brlx;
  const valorEmCustodia = vendendo ? qtd : custoQuote;
  const allowance = vendendo ? allowanceCsr : allowanceBrlx;
  const saldo = vendendo ? saldoCsr : saldoBrlx;

  const precisaAprovar = valorEmCustodia !== undefined && (allowance ?? 0n) < valorEmCustodia;
  const semSaldo = valorEmCustodia !== undefined && (saldo ?? 0n) < valorEmCustodia;

  // Uma ordem que já cruza o spread executaria na hora numa bolsa real. Este
  // livro não casa na entrada, então ela ficaria parada oferecendo dinheiro
  // de graça — vale avisar antes de a turma perder tokens sem entender.
  const cruzaOSpread =
    precoWei !== undefined &&
    ((vendendo && bid !== undefined && bid > 0n && precoWei <= bid) ||
      (!vendendo && ask !== undefined && ask > 0n && precoWei >= ask));

  return (
    <Card titulo="Colocar uma ordem" subtitulo="Virar o outro lado do balcão: você define o preço">
      <div className="space-y-4">
        <div className="flex gap-2">
          {[
            { rotulo: "Comprar CSR", valor: false },
            { rotulo: "Vender CSR", valor: true },
          ].map((op) => (
            <button
              key={op.rotulo}
              onClick={() => setVendendo(op.valor)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                vendendo === op.valor
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {op.rotulo}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoValor
            rotulo="Preço por CSR"
            valor={preco}
            onChange={setPreco}
            sufixo="BRLX"
            disponivel={
              vendendo
                ? ask
                  ? `melhor venda: ${fmtPreco(ask)}`
                  : undefined
                : bid
                  ? `melhor compra: ${fmtPreco(bid)}`
                  : undefined
            }
          />
          <CampoValor
            rotulo="Quantidade"
            valor={quantia}
            onChange={setQuantia}
            sufixo="CSR"
            disponivel={fmt(saldo)}
          />
        </div>

        {valorEmCustodia !== undefined && valorEmCustodia > 0n && (
          <dl className="grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4">
            <Stat
              rotulo="Vai ficar em custódia agora"
              valor={fmt(valorEmCustodia)}
              sufixo={tokenEmCustodia.symbol}
              dica="o contrato segura até executar ou você cancelar"
            />
          </dl>
        )}

        {cruzaOSpread && (
          <Aviso tom="alerta">
            Esse preço cruza o spread: você está {vendendo ? "vendendo mais barato" : "pagando mais caro"}{" "}
            que o melhor preço que já está no livro. Numa bolsa de verdade a ordem executaria
            na hora; aqui ela fica parada, esperando alguém pegar o presente.
          </Aviso>
        )}

        {semSaldo && (
          <Aviso tom="alerta">
            Saldo de {tokenEmCustodia.symbol} insuficiente. Uma ordem sem lastro não existe
            neste contrato: o depósito acontece na mesma transação.
          </Aviso>
        )}

        <div className="flex flex-wrap gap-3">
          {precisaAprovar && (
            <Botao
              disabled={!isConnected || txAprovar.ocupada}
              onClick={async () => {
                await txAprovar.enviar({
                  address: tokenEmCustodia.address,
                  abi: abis.token,
                  functionName: "approve",
                  args: [CONTRACTS.orderBook, maxUint256],
                });
                refetch();
              }}
            >
              {txAprovar.ocupada ? "Processando…" : `Aprovar ${tokenEmCustodia.symbol}`}
            </Botao>
          )}
          <Botao
            disabled={
              !isConnected ||
              !precoWei ||
              !qtd ||
              precisaAprovar ||
              semSaldo ||
              txColocar.ocupada
            }
            onClick={async () => {
              if (!precoWei || !qtd) return;
              await txColocar.enviar({
                address: CONTRACTS.orderBook,
                abi: abis.livro,
                functionName: "colocar",
                args: [vendendo ? LADO.venda : LADO.compra, precoWei, qtd],
              });
              refetch();
              onFeito();
            }}
          >
            {txColocar.ocupada ? "Enviando…" : "Colocar no livro"}
          </Botao>
        </div>

        <StatusTx tx={txAprovar} sucesso="Aprovado." />
        <StatusTx tx={txColocar} sucesso="Sua ordem está no livro. Ela aparece na lista ao lado." />

        <NotaDeAula>
          Você não paga slippage nenhum: o preço é seu. Em troca, não ganha nada até alguém
          aparecer — e se o mercado andar, a sua ordem vira a única barata da tela e é a
          primeira a ser comida. É esse o risco de quem faz mercado.
        </NotaDeAula>
      </div>
    </Card>
  );
}
