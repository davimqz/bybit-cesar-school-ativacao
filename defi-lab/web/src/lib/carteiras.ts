/**
 * Qual carteira oferecer ao aluno, e por que não basta pegar a primeira.
 *
 * Numa sala onde não dá para padronizar navegador nem extensão, esta função é
 * o que decide se o aluno consegue entrar. Ela é pura e não importa nada do
 * wagmi de propósito: dá para testá-la sem navegador (veja `carteiras.test.ts`).
 *
 * São dois caminhos, e os dois precisam existir:
 *
 *  1. EIP-6963 (moderno) — cada extensão se anuncia com id próprio, no formato
 *     rdns (`io.metamask`, `com.brave.wallet`). Nenhuma toca `window.ethereum`,
 *     então duas carteiras instaladas convivem sem se embrulhar num Proxy.
 *
 *  2. `injected` (antigo) — um único connector genérico que lê
 *     `window.ethereum`. É o que sobra para carteira desatualizada que não
 *     anuncia por 6963.
 *
 * Preferimos sempre o caminho 1 e só caímos no 2 quando a descoberta não achou
 * ninguém — assim quem tem carteira moderna nunca passa pela propriedade
 * disputada, e quem tem carteira velha ainda tem um botão para clicar.
 */

/** Só o que esta decisão precisa saber de um connector do wagmi. */
export type CarteiraDisponivel = {
  id: string;
  name: string;
  uid: string;
};

/** O id do connector genérico do wagmi. Os do EIP-6963 usam rdns. */
const ID_GENERICO = "injected";

export function carteirasDisponiveis<T extends CarteiraDisponivel>(
  connectors: readonly T[],
): T[] {
  const descobertas = connectors.filter((c) => c.id !== ID_GENERICO);

  // Duas extensões podem anunciar o mesmo nome; o aluno não deve ver dois
  // botões idênticos e ter que adivinhar qual é qual.
  const vistas = new Set<string>();
  const unicas = descobertas.filter((c) => {
    const chave = c.name.trim().toLowerCase();
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });

  if (unicas.length > 0) {
    // MetaMask primeiro — é a que o guia da aula manda instalar. É só ordem na
    // tela: nenhuma carteira é escondida, e nada aqui depende do navegador.
    return [...unicas].sort((a, b) => posicao(a) - posicao(b));
  }

  const generico = connectors.find((c) => c.id === ID_GENERICO);
  return generico ? [generico] : [];
}

function posicao(c: CarteiraDisponivel): number {
  return c.name.toLowerCase().includes("metamask") ? 0 : 1;
}
