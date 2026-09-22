"use client";

import { useState } from "react";
import { useConnection, useReadContract } from "wagmi";
import { maxUint256 } from "viem";
import { Card, Stat, Botao, CampoValor, Aviso, NotaDeAula } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { useSaldosEAprovacoes } from "@/hooks/usePool";
import { paraWei } from "@/components/pool/SwapCard";
import { CONTRACTS, TOKENS, abis, fmt, fmtBps, fmtPreco } from "@/lib/contracts";

const TOLERANCIAS = [100, 300, 1000];

/**
 * Ordem a mercado: atravessa o livro consumindo um nível por vez.
 *
 * É o gêmeo do swap do AMM, e a comparação é o ponto da aula. Aqui o preço
 * médio piora em degraus — e cada degrau tem um nome e um endereço do outro
 * lado. Na curva, piora continuamente contra ninguém em particular.
 */
export function OrdemAMercado({ onFeito }: { onFeito: () => void }) {
  const { isConnected } = useConnection();
  const [comprando, setComprando] = useState(true);
  const [quantia, setQuantia] = useState("150");
  const [toleranciaBps, setToleranciaBps] = useState(300);

  const { saldoCsr, saldoBrlx, allowanceCsr, allowanceBrlx, refetch } = useSaldosEAprovacoes(
    CONTRACTS.orderBook,
  );

  const txAprovar = useTx();
  const txOrdem = useTx();

  const valor = paraWei(quantia);

  const { data: simulacao } = useReadContract({
    address: CONTRACTS.orderBook,
    abi: abis.livro,
    functionName: comprando ? "simularCompra" : "simularVenda",
    args: valor ? [valor] : undefined,
    query: { enabled: !!valor, refetchInterval: 4000 },
  });

  const s = simulacao as readonly [bigint, bigint, bigint, bigint] | undefined;
  const [total, preenchido, precoMedio, slippageBps] = s ?? [];

  const naoCoube = valor !== undefined && preenchido !== undefined && preenchido < valor;

  // Comprando: o teto do que aceito gastar. Vendendo: o piso do que aceito receber.
  const limite =
    total !== undefined
      ? comprando
        ? (total * BigInt(10_000 + toleranciaBps)) / 10_000n
        : (total * BigInt(10_000 - toleranciaBps)) / 10_000n
      : undefined;

  const tokenQueSai = comprando ? TOKENS.brlx : TOKENS.csr;
  const quantiaQueSai = comprando ? limite : valor;
  const allowance = comprando ? allowanceBrlx : allowanceCsr;
  const saldo = comprando ? saldoBrlx : saldoCsr;

  const precisaAprovar = quantiaQueSai !== undefined && (allowance ?? 0n) < quantiaQueSai;
  const semSaldo = quantiaQueSai !== undefined && (saldo ?? 0n) < quantiaQueSai;
  const semLiquidez = preenchido === 0n;

  return (
    <Card titulo="Ordem a mercado" subtitulo="Atravessar o livro, nível por nível">
      <div className="space-y-4">
        <div className="flex gap-2">
          {[
            { rotulo: "Comprar CSR", valor: true },
            { rotulo: "Vender CSR", valor: false },
          ].map((op) => (
            <button
              key={op.rotulo}
              onClick={() => setComprando(op.valor)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                comprando === op.valor
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {op.rotulo}
            </button>
          ))}
        </div>

        <CampoValor
          rotulo="Quantidade"
          valor={quantia}
          onChange={setQuantia}
          sufixo="CSR"
          disponivel={fmt(saldo)}
        />

        {s && preenchido !== undefined && preenchido > 0n && (
          <>
            <dl className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
              <Stat
                rotulo={comprando ? "Custo total" : "Você recebe"}
                valor={fmt(total)}
                sufixo="BRLX"
                tom={comprando ? "ruim" : "bom"}
              />
              <Stat rotulo="Preço médio" valor={fmtPreco(precoMedio)} sufixo="BRLX" />
              <Stat
                rotulo="Slippage"
                valor={fmtBps(slippageBps)}
                tom={(slippageBps ?? 0n) > 300n ? "ruim" : (slippageBps ?? 0n) > 100n ? "alerta" : "neutro"}
                dica="contra o topo do livro"
              />
              <Stat rotulo="Preenchido" valor={fmt(preenchido)} sufixo="CSR" />
            </dl>

            {naoCoube && (
              <Aviso tom="alerta">
                O livro não tem profundidade para a ordem inteira: só {fmt(preenchido)} CSR
                seriam executados. O resto não vira nada — ordem a mercado não descansa no
                livro, ela só consome o que existe.
              </Aviso>
            )}

            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Tolerância — {comprando ? "gasto máximo" : "recebimento mínimo"}{" "}
                <strong className="tabular-nums text-slate-700">{fmt(limite)} BRLX</strong>
              </span>
              <div className="mt-2 flex gap-2">
                {TOLERANCIAS.map((bps) => (
                  <button
                    key={bps}
                    onClick={() => setToleranciaBps(bps)}
                    className={`rounded-lg border px-3 py-1 text-sm transition ${
                      toleranciaBps === bps
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {bps / 100}%
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {semLiquidez && <Aviso tom="alerta">Não há ordens desse lado do livro para executar.</Aviso>}
        {semSaldo && (
          <Aviso tom="alerta">
            Saldo de {tokenQueSai.symbol} insuficiente — a tolerância reserva um pouco mais
            que o valor simulado.
          </Aviso>
        )}

        <div className="flex flex-wrap gap-3">
          {precisaAprovar && (
            <Botao
              disabled={!isConnected || txAprovar.ocupada}
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
              {txAprovar.ocupada ? "Processando…" : `Aprovar ${tokenQueSai.symbol}`}
            </Botao>
          )}
          <Botao
            disabled={
              !isConnected ||
              !valor ||
              precisaAprovar ||
              semSaldo ||
              semLiquidez ||
              limite === undefined ||
              txOrdem.ocupada
            }
            onClick={async () => {
              if (!valor || limite === undefined) return;
              await txOrdem.enviar({
                address: CONTRACTS.orderBook,
                abi: abis.livro,
                functionName: comprando ? "comprarAMercado" : "venderAMercado",
                args: [valor, limite],
              });
              refetch();
              onFeito();
            }}
          >
            {txOrdem.ocupada ? "Executando…" : comprando ? "Comprar a mercado" : "Vender a mercado"}
          </Botao>
        </div>

        <StatusTx tx={txAprovar} sucesso="Aprovado." />
        <StatusTx tx={txOrdem} sucesso="Livro atravessado. Veja quais linhas desapareceram." />

        <NotaDeAula>
          Compare este slippage com o do mesmo volume no pool, no card acima. Os dois
          mercados cobram de você por tamanho — mas aqui o custo é a escada que alguém
          construiu, e no pool é uma fórmula que não depende de ninguém aparecer.
        </NotaDeAula>
      </div>
    </Card>
  );
}
