"use client";

import { useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { BaseError } from "viem";
import { linkExplorer } from "@/lib/contracts";
import { Aviso } from "@/components/ui";

/**
 * Envia uma transação e expõe os quatro estados que importam numa aula:
 * assinando, minerando, confirmada, falhou.
 *
 * O detalhe que mais importa aqui é `mensagemDeErro`: a MetaMask devolve
 * paredes de texto. Quarenta alunos travados num erro ilegível é o pior
 * cenário possível ao vivo, então traduzimos os casos comuns.
 */
export function useTx() {
  const { writeContractAsync, data: hash, isPending: assinando, error, reset } = useWriteContract();
  const { isLoading: minerando, isSuccess: confirmada } = useWaitForTransactionReceipt({ hash });

  const enviar = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (params: any) => {
      try {
        return await writeContractAsync(params);
      } catch {
        // O erro já vive em `error`; não estouramos para não derrubar a página.
        return undefined;
      }
    },
    [writeContractAsync],
  );

  return {
    enviar,
    reset,
    hash,
    assinando,
    minerando,
    confirmada,
    ocupada: assinando || minerando,
    erro: error ? traduzirErro(error) : undefined,
  };
}

export type Tx = ReturnType<typeof useTx>;

function traduzirErro(erro: Error): string {
  const bruto = erro instanceof BaseError ? erro.shortMessage : erro.message;

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

  return bruto;
}

export function StatusTx({ tx, sucesso = "Confirmada." }: { tx: Tx; sucesso?: string }) {
  if (tx.erro) return <Aviso tom="erro">{tx.erro}</Aviso>;

  if (tx.assinando) return <Aviso tom="info">Aguardando sua assinatura na MetaMask…</Aviso>;

  if (tx.minerando) {
    return <Aviso tom="info">Transação enviada. Esperando entrar num bloco…</Aviso>;
  }

  if (tx.confirmada && tx.hash) {
    const link = linkExplorer("tx", tx.hash);
    return (
      <Aviso tom="info">
        {sucesso}{" "}
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="font-semibold underline">
            ver no explorador
          </a>
        )}
      </Aviso>
    );
  }

  return null;
}
