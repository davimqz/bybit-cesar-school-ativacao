"use client";

import {
  useConnection,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useBalance,
  type Connector,
} from "wagmi";
import { activeChain } from "@/lib/wagmi";
import { TOKENS, encurtar, fmt } from "@/lib/contracts";
import { carteirasDisponiveis } from "@/lib/carteiras";
import { Botao, Aviso } from "./ui";

/**
 * Barra de conexão. É a primeira coisa que 40 alunos vão usar ao mesmo tempo,
 * então ela precisa falhar de forma legível: cada estado tem uma frase que
 * diz exatamente o que fazer em seguida.
 */
export function ConnectBar() {
  const {
    address,
    isConnected,
    connector: conectada,
    chainId: chainIdDaCarteira,
  } = useConnection();
  const { connect, connectors, isPending, error, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: saldo } = useBalance({ chainId: activeChain.id, address });

  const carteiras = carteirasDisponiveis(connectors);

  /**
   * A rede da CARTEIRA, não a da config.
   *
   * `useChainId()` só devolve valores da lista `chains`, então com a carteira
   * na Ethereum ele responderia Sepolia e este aviso — o mais importante da
   * tela — nunca apareceria. `useConnection().chainId` é a rede de verdade.
   */
  const redeErrada =
    isConnected && chainIdDaCarteira !== undefined && chainIdDaCarteira !== activeChain.id;

  if (!isConnected) {
    return (
      <div className="space-y-3">
        {carteiras.length === 0 ? (
          <Aviso tom="erro">
            Nenhuma carteira detectada no navegador. Instale a extensão MetaMask
            em metamask.io, recarregue a página e tente de novo.
          </Aviso>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {carteiras.map((c) => (
                <Botao
                  key={c.uid}
                  onClick={() => connect({ connector: c })}
                  disabled={isPending}
                >
                  {isPending && variables?.connector === c
                    ? "Abrindo a carteira…"
                    : `Conectar ${c.name}`}
                </Botao>
              ))}
            </div>

            <p className="text-muted-foreground text-sm">
              A extensão vai abrir uma janela. Aprove a conexão.
            </p>

            {carteiras.length > 1 && (
              <Aviso tom="alerta">
                Você tem mais de uma carteira instalada neste navegador. Clique
                na <strong>MetaMask</strong> — é a da aula. Se outra extensão
                abrir sozinha, desative-a e recarregue a página.
              </Aviso>
            )}
          </>
        )}

        {error && <Aviso tom="erro">{error.message}</Aviso>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <span className="text-muted-foreground text-sm">Carteira</span>
          <p className="font-mono text-sm">{encurtar(address)}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-sm">Gas</span>
          <p className="font-mono text-sm tabular-nums">
            {saldo ? `${fmt(saldo.value, 4)} ETH` : "—"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <AdicionarTokens connector={conectada} />
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
            className="font-semibold underline underline-offset-2"
          >
            Trocar agora
          </button>
        </Aviso>
      )}

      {saldo?.value === 0n && (
        <Aviso tom="alerta">
          Você está sem ETH — sem gas, nenhuma transação é assinada. Pegue no{" "}
          <a
            href="/faucet"
            className="font-semibold underline underline-offset-2"
          >
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
 *
 * Pede o provider ao connector em vez de ler `window.ethereum`: com duas
 * extensões instaladas, `window.ethereum` pode ser a outra carteira — o token
 * apareceria na carteira errada, ou em nenhuma.
 */
function AdicionarTokens({ connector }: { connector?: Connector }) {
  async function adicionar() {
    if (!connector) return;

    const provider = (await connector.getProvider()) as
      { request: (a: unknown) => Promise<unknown> } | undefined;
    if (!provider?.request) return;

    for (const token of Object.values(TOKENS)) {
      try {
        await provider.request({
          method: "wallet_watchAsset",
          params: {
            type: "ERC20",
            options: {
              address: token.address,
              symbol: token.symbol,
              decimals: 18,
            },
          },
        });
      } catch {
        // Aluno recusou o popup — segue o jogo, não trava a página.
      }
    }
  }

  return (
    <Botao variante="secundario" onClick={adicionar} disabled={!connector}>
      Mostrar CSR e BRLX na carteira
    </Botao>
  );
}
