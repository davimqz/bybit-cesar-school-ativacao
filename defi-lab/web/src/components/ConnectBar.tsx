"use client";

import { useConnection, useConnect, useDisconnect, useChainId, useSwitchChain, useBalance } from "wagmi";
import { activeChain } from "@/lib/wagmi";
import { TOKENS, encurtar, fmt } from "@/lib/contracts";
import { Botao, Aviso } from "./ui";

/**
 * Barra de conexão. É a primeira coisa que 40 alunos vão usar ao mesmo tempo,
 * então ela precisa falhar de forma legível: cada estado tem uma frase que
 * diz exatamente o que fazer em seguida.
 */
export function ConnectBar() {
  const { address, isConnected } = useConnection();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: saldo } = useBalance({ address });

  const injetada = connectors.find((c) => c.type === "injected") ?? connectors[0];
  const redeErrada = isConnected && chainId !== activeChain.id;

  if (!isConnected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Botao onClick={() => connect({ connector: injetada })} disabled={isPending || !injetada}>
            {isPending ? "Abrindo a MetaMask…" : "Conectar MetaMask"}
          </Botao>
          <span className="text-sm text-slate-500">
            A MetaMask vai abrir uma janela. Aprove a conexão.
          </span>
        </div>
        {!injetada && (
          <Aviso tom="erro">
            Nenhuma carteira detectada no navegador. Instale a extensão MetaMask
            (metamask.io), recarregue a página e tente de novo.
          </Aviso>
        )}
        {error && <Aviso tom="erro">{error.message}</Aviso>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <span className="text-xs uppercase tracking-wide text-slate-400">carteira</span>
          <p className="font-mono text-sm text-slate-900">{encurtar(address)}</p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-wide text-slate-400">gas</span>
          <p className="text-sm tabular-nums text-slate-900">
            {saldo ? `${fmt(saldo.value, 4)} ETH` : "—"}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <AdicionarTokens />
          <Botao variante="secundario" onClick={() => disconnect()}>
            Sair
          </Botao>
        </div>
      </div>

      {redeErrada && (
        <Aviso tom="alerta">
          Você está em outra rede. Os contratos da aula vivem na{" "}
          <strong>{activeChain.name}</strong>.{" "}
          <button
            onClick={() => switchChain({ chainId: activeChain.id })}
            className="font-semibold underline"
          >
            Trocar agora
          </button>
        </Aviso>
      )}

      {saldo?.value === 0n && (
        <Aviso tom="alerta">
          Você está sem ETH — sem gas, nenhuma transação é assinada. Pegue no{" "}
          <a href="/faucet" className="font-semibold underline">
            faucet da aula
          </a>
          .
        </Aviso>
      )}
    </div>
  );
}

/**
 * `wallet_watchAsset`: sem isto, o aluno faz um swap e jura que não recebeu
 * nada, porque a MetaMask não mostra token que ela não conhece.
 */
function AdicionarTokens() {
  async function adicionar() {
    const ethereum = (window as unknown as { ethereum?: { request: (a: unknown) => Promise<unknown> } })
      .ethereum;
    if (!ethereum) return;

    for (const token of Object.values(TOKENS)) {
      try {
        await ethereum.request({
          method: "wallet_watchAsset",
          params: {
            type: "ERC20",
            options: { address: token.address, symbol: token.symbol, decimals: 18 },
          },
        });
      } catch {
        // Aluno recusou o popup — segue o jogo, não trava a página.
      }
    }
  }

  return (
    <Botao variante="secundario" onClick={adicionar}>
      Mostrar CSR e BRLX na carteira
    </Botao>
  );
}
