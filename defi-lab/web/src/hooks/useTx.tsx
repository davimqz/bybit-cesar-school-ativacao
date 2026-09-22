"use client";

import { useCallback, useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useConnection,
  useSwitchChain,
} from "wagmi";
import { BaseError } from "viem";
import { linkExplorer } from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";
import { Aviso } from "@/components/ui";

/**
 * Envia uma transação e expõe os quatro estados que importam numa aula:
 * assinando, minerando, confirmada, falhou.
 *
 * O detalhe que mais importa aqui é `traduzirErro`: a MetaMask devolve
 * paredes de texto. Quarenta alunos travados num erro ilegível é o pior
 * cenário possível ao vivo, então traduzimos os casos comuns.
 *
 * Este hook é o único caminho de escrita do app inteiro, e é por isso que a
 * trava de rede mora aqui e não em cada botão: um botão esquecido significaria
 * um aluno gastando ETH de verdade.
 */
export function useTx() {
  const {
    writeContractAsync,
    data: hash,
    isPending: assinando,
    error,
    reset,
  } = useWriteContract();
  const { isLoading: minerando, isSuccess: confirmada } =
    useWaitForTransactionReceipt({
      hash,
      // Espera o recibo na rede da aula, não na que a carteira estiver.
      chainId: activeChain.id,
    });

  /**
   * A rede REAL da carteira — e não `useChainId()`.
   *
   * Existem dois "chainId" no wagmi e eles discordam justamente no caso que
   * importa. `useChainId()` devolve `config.state.chainId`, que é a rede que a
   * *config* considera atual e só assume valores da lista `chains`. Com a
   * carteira na Ethereum (chain 1, fora da lista), ele continua respondendo
   * Sepolia — a comparação dá "tudo certo" e a troca nunca dispara.
   *
   * `useConnection().chainId` é a rede do connector, ou seja, onde a carteira
   * está de verdade. É a única que serve para decidir se precisa trocar.
   */
  const { chainId: chainIdDaCarteira } = useConnection();
  const redeErrada =
    chainIdDaCarteira !== undefined && chainIdDaCarteira !== activeChain.id;

  const { switchChainAsync } = useSwitchChain();
  const [erroRede, setErroRede] = useState<string | undefined>();

  const enviar = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (params: any) => {
      setErroRede(undefined);

      try {
        /**
         * Rede errada: troque ANTES de montar a transação.
         *
         * Sem isto, o wagmi usa a rede em que a carteira estiver. Os endereços
         * do lab só existem na rede da aula, então na mainnet a transação vai
         * para um endereço sem contrato: ela não faz nada e mesmo assim cobra
         * gas — em ETH de verdade. Foi o que aconteceu no faucet.
         */
        if (redeErrada) {
          await switchChainAsync({ chainId: activeChain.id });
        }

        /**
         * E o cinto de segurança: com `chainId` explícito, o wagmi recusa a
         * transação se a carteira ainda estiver em outra rede, em vez de
         * assiná-la. Vale mesmo que a troca acima falhe em silêncio.
         */
        return await writeContractAsync({ ...params, chainId: activeChain.id });
      } catch (e) {
        // Erro de troca de rede não passa pelo `error` do useWriteContract.
        if (redeErrada) {
          setErroRede(
            `A troca para ${activeChain.name} não foi concluída. Se a MetaMask não ` +
              `ofereceu a rede, abra Configurações → Redes e ligue “Mostrar redes de ` +
              `teste”; depois clique de novo.`,
          );
        }
        // O resto já vive em `error`; não estouramos para não derrubar a página.
        void e;
        return undefined;
      }
    },
    [writeContractAsync, switchChainAsync, redeErrada],
  );

  return {
    enviar,
    reset,
    hash,
    assinando,
    minerando,
    confirmada,
    ocupada: assinando || minerando,
    /** True quando a carteira não está na rede da aula. A UI desabilita o botão. */
    redeErrada,
    erro: erroRede ?? (error ? traduzirErro(error) : undefined),
  };
}

export type Tx = ReturnType<typeof useTx>;

function traduzirErro(erro: Error): string {
  const bruto = erro instanceof BaseError ? erro.shortMessage : erro.message;

  if (
    /chain mismatch|does not match the target chain|chain of the connector/i.test(
      bruto,
    )
  ) {
    return (
      `Sua carteira está em outra rede, e o app não deixa assinar assim. ` +
      `Troque para ${activeChain.name} — na rede errada a transação cobraria ` +
      `gas de verdade sem fazer nada, porque os contratos da aula não existem lá.`
    );
  }
  if (/User rejected|denied transaction/i.test(bruto)) {
    return "Você recusou a transação na MetaMask.";
  }
  if (/insufficient funds/i.test(bruto)) {
    return "Sem ETH para pagar o gas. Pegue mais no faucet da aula.";
  }
  if (/SlippageExceeded/i.test(bruto)) {
    return "O preço mudou entre a sua simulação e o bloco: alguém negociou na sua frente. É exatamente o que o campo de tolerância protege.";
  }
  if (/ERC20InsufficientAllowance|allowance/i.test(bruto)) {
    return "Falta aprovar o contrato para usar seus tokens. Clique em “Aprovar” antes.";
  }
  if (/ERC20InsufficientBalance/i.test(bruto)) {
    return "Saldo de token insuficiente para essa operação.";
  }
  if (/FaucetCooldownActive|CooldownActive/i.test(bruto)) {
    return "Você acabou de sacar. Espere o intervalo e tente de novo.";
  }
  if (/FaucetEmpty/i.test(bruto)) {
    return "O faucet ficou sem saldo. Avise o professor.";
  }

  // --- Livro de ordens ---
  if (/PrecoPiorQueOLimite/i.test(bruto)) {
    return "A travessia do livro passou do seu limite: alguém comeu os melhores níveis antes de você. Aumente a tolerância ou reduza a ordem.";
  }
  if (/OrdemNaoEstaViva/i.test(bruto)) {
    return "Essa ordem não existe mais — outra pessoa executou ela primeiro. No livro, quem chega antes leva.";
  }
  if (/LivroSemLiquidez/i.test(bruto)) {
    return "Não há ordens desse lado do livro. Alguém precisa oferecer antes de alguém poder tomar.";
  }
  if (/AutoNegociacao/i.test(bruto)) {
    return "Você não pode executar a sua própria ordem. Para desfazê-la, use Cancelar.";
  }
  if (/NaoEhDonoDaOrdem/i.test(bruto)) {
    return "Essa ordem não é sua: só quem colocou pode cancelar.";
  }
  if (/LivroCheio/i.test(bruto)) {
    return "O livro está cheio. Cancele uma ordem sua ou espere o mercado girar.";
  }

  // --- Staking ---
  if (/NadaParaColher/i.test(bruto)) {
    return "Não há rendimento para colher ainda. Deposite e espere alguns segundos.";
  }
  if (/SaldoInsuficienteNaPosicao/i.test(bruto)) {
    return "Você está tentando retirar mais do que tem depositado no cofre.";
  }

  // --- Escrow ---
  if (/PrazoAindaNaoVenceu/i.test(bruto)) {
    return "O prazo ainda não venceu. Só o relógio libera essa ação — espere a contagem chegar a zero.";
  }
  if (/EstadoErrado/i.test(bruto)) {
    return "O acordo não está mais no estado que essa ação exige. Alguém agiu antes de você — recarregue a lista.";
  }
  if (/NaoEhOArbitro/i.test(bruto)) {
    return "Só o árbitro do acordo resolve a disputa. Nem o comprador nem o vendedor podem.";
  }
  if (/NaoEhOComprador/i.test(bruto)) {
    return "Só o comprador pode fazer isso: é o dinheiro dele que está em custódia.";
  }
  if (/NaoEhOVendedor/i.test(bruto)) {
    return "Só o vendedor pode marcar o envio.";
  }
  if (/NaoEhParteDoAcordo/i.test(bruto)) {
    return "Você não é parte desse acordo.";
  }
  if (/ParticipantesRepetidos/i.test(bruto)) {
    return "Comprador, vendedor e árbitro têm que ser endereços diferentes.";
  }

  // --- Crowdfunding ---
  if (/MetaNaoBatida/i.test(bruto)) {
    return "A meta não foi batida: o contrato não entrega o dinheiro ao criador. É a garantia do tudo-ou-nada funcionando.";
  }
  if (/MetaFoiBatida/i.test(bruto)) {
    return "A meta foi batida, então não há reembolso — o valor agora é do projeto.";
  }
  if (/AindaPodeBaterAMeta/i.test(bruto)) {
    return "O prazo não venceu: enquanto a campanha pode dar certo, ninguém retira a contribuição.";
  }
  if (/PrazoEncerrado/i.test(bruto)) {
    return "A arrecadação desta campanha já fechou.";
  }
  if (/NadaParaReembolsar/i.test(bruto)) {
    return "Você não tem contribuição nesta campanha (ou já sacou o reembolso).";
  }
  if (/NaoEhOCriador/i.test(bruto)) {
    return "Só quem criou a campanha pode sacar.";
  }
  if (/JaFoiSacada/i.test(bruto)) {
    return "Esta campanha já foi sacada e está encerrada.";
  }

  return bruto;
}

export function StatusTx({
  tx,
  sucesso = "Confirmada.",
}: {
  tx: Tx;
  sucesso?: string;
}) {
  if (tx.erro) return <Aviso tom="erro">{tx.erro}</Aviso>;

  // Antes de o aluno clicar: diga que o botão não vai funcionar, e por quê.
  if (tx.redeErrada) {
    return (
      <Aviso tom="alerta">
        Sua carteira não está na <strong>{activeChain.name}</strong>. Ao clicar,
        o app vai pedir a troca de rede antes de qualquer assinatura — nenhuma
        transação sai na rede errada.
      </Aviso>
    );
  }

  if (tx.assinando)
    return <Aviso tom="info">Aguardando sua assinatura na MetaMask…</Aviso>;

  if (tx.minerando) {
    return (
      <Aviso tom="info">Transação enviada. Esperando entrar num bloco…</Aviso>
    );
  }

  if (tx.confirmada && tx.hash) {
    const link = linkExplorer("tx", tx.hash);
    return (
      <Aviso tom="info">
        {sucesso}{" "}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline"
          >
            ver no explorador
          </a>
        )}
      </Aviso>
    );
  }

  return null;
}
