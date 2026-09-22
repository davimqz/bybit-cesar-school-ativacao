"use client";

import { useConnection, useBalance, useReadContract } from "wagmi";
import { ConnectBar } from "@/components/ConnectBar";
import { Card, Stat, Botao, NotaDeAula, Aviso } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { CONTRACTS, TOKENS, abis, fmt } from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";

/**
 * Sem gas o aluno não faz nada. Esta página existe para que "não consigo
 * assinar" nunca seja o motivo de alguém ficar de fora da aula.
 */
export default function FaucetPage() {
  const { address, isConnected } = useConnection();

  const txGas = useTx();
  const txCsr = useTx();
  const txBrlx = useTx();

  const { data: saldoEth } = useBalance({ chainId: activeChain.id, address });

  const { data: saldoCsr } = useReadContract({
    chainId: activeChain.id,
    address: CONTRACTS.csr,
    abi: abis.token,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: saldoBrlx } = useReadContract({
    chainId: activeChain.id,
    address: CONTRACTS.brlx,
    abi: abis.token,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: saquesRestantes } = useReadContract({
    chainId: activeChain.id,
    address: CONTRACTS.gasFaucet,
    abi: abis.gasFaucet,
    functionName: "remainingClaims",
  });

  const semGas = saldoEth?.value === 0n;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Faucet da aula
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Gas para pagar as transações e tokens para operar nos labs. Tudo de
          rede de teste: não vale nada, e é essa a graça — dá para errar à
          vontade.
        </p>
      </div>

      <Card titulo="Sua carteira">
        <ConnectBar />
      </Card>

      {isConnected && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <Stat
                rotulo="Gas (ETH)"
                valor={fmt(saldoEth?.value, 4)}
                tom={semGas ? "ruim" : "bom"}
                dica="Paga a execução de cada transação"
              />
            </Card>
            <Card>
              <Stat
                rotulo="CSR"
                valor={fmt(saldoCsr as bigint | undefined)}
                dica="O ativo volátil da aula"
              />
            </Card>
            <Card>
              <Stat
                rotulo="BRLX"
                valor={fmt(saldoBrlx as bigint | undefined)}
                dica="A 'stablecoin' da aula"
              />
            </Card>
          </div>

          <Card
            titulo="1. Pegue gas"
            subtitulo="Sem isto, nenhuma das outras ações funciona"
          >
            <div className="flex flex-wrap items-center gap-4">
              <Botao
                onClick={() =>
                  txGas.enviar({
                    address: CONTRACTS.gasFaucet,
                    abi: abis.gasFaucet,
                    functionName: "claim",
                  })
                }
                disabled={txGas.ocupada}
              >
                {txGas.ocupada ? "Processando…" : "Receber ETH de teste"}
              </Botao>
              <span className="text-sm text-muted-foreground">
                o faucet ainda atende{" "}
                <strong className="tabular-nums">
                  {saquesRestantes !== undefined
                    ? String(saquesRestantes)
                    : "—"}
                </strong>{" "}
                saques
              </span>
            </div>
            <div className="mt-3">
              <StatusTx tx={txGas} sucesso="Gas na conta." />
            </div>
            <NotaDeAula>
              Esse ETH sai de um contrato que o professor abasteceu antes da
              aula. Repare que o faucet é apenas mais um contrato — com regras
              públicas e um saldo que acaba.
            </NotaDeAula>
          </Card>

          <Card
            titulo="2. Pegue os tokens"
            subtitulo="Cada saque libera 1.000 unidades"
          >
            {semGas && (
              <div className="mb-4">
                <Aviso tom="alerta">
                  Pegue o gas primeiro — estas duas ações também são transações
                  e precisam ser pagas.
                </Aviso>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Botao
                variante="secundario"
                disabled={txCsr.ocupada || semGas}
                onClick={() =>
                  txCsr.enviar({
                    address: TOKENS.csr.address,
                    abi: abis.token,
                    functionName: "claim",
                  })
                }
              >
                {txCsr.ocupada ? "Processando…" : "Receber 1.000 CSR"}
              </Botao>
              <Botao
                variante="secundario"
                disabled={txBrlx.ocupada || semGas}
                onClick={() =>
                  txBrlx.enviar({
                    address: TOKENS.brlx.address,
                    abi: abis.token,
                    functionName: "claim",
                  })
                }
              >
                {txBrlx.ocupada ? "Processando…" : "Receber 1.000 BRLX"}
              </Botao>
            </div>
            <div className="mt-3 space-y-2">
              <StatusTx tx={txCsr} sucesso="CSR recebido." />
              <StatusTx tx={txBrlx} sucesso="BRLX recebido." />
            </div>
            <NotaDeAula>
              Qualquer pessoa pode chamar <code>claim()</code> e criar tokens do
              nada. Num token de verdade isso seria uma falha grave de design —
              aqui é proposital. Pergunte-se sempre: quem pode emitir? Em que
              ritmo? Com qual limite?
            </NotaDeAula>
          </Card>
        </>
      )}
    </div>
  );
}
