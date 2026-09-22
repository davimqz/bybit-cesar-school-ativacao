"use client";

import { useConnection } from "wagmi";
import { Card, Stat, Botao, Aviso, NotaDeAula } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { useAgora } from "@/hooks/useEscrow";
import {
  CONTRACTS,
  ESTADO,
  ESTADOS,
  abis,
  encurtar,
  fmt,
  fmtRestante,
  linkExplorer,
  type Acordo,
} from "@/lib/contracts";

/**
 * Um acordo e só os botões que fazem sentido para quem está olhando.
 *
 * Mostrar a ação de outra pessoa desabilitada seria pior que não mostrar: o
 * aluno tentaria, a transação reverteria, e a aula pararia para explicar um erro
 * que não ensina nada. O papel de cada um fica escrito no topo do cartão.
 */
export function CartaoAcordo({ acordo, onFeito }: { acordo: Acordo; onFeito: () => void }) {
  const { address } = useConnection();
  const agora = useAgora();

  const tx = useTx();
  const eu = address?.toLowerCase();
  const souComprador = eu === acordo.comprador.toLowerCase();
  const souVendedor = eu === acordo.vendedor.toLowerCase();
  const souArbitro = eu === acordo.arbitro.toLowerCase();

  const estado = Number(acordo.estado);
  const info = ESTADOS[estado];
  const encerrado = estado === ESTADO.concluido || estado === ESTADO.reembolsado;

  // Qual prazo vale agora: o do envio, ou o da janela de revisão.
  const prazo =
    estado === ESTADO.financiado
      ? acordo.prazoEnvio
      : estado === ESTADO.enviado
        ? acordo.momentoEnvio + 300n
        : undefined;
  const venceu = prazo !== undefined && Number(prazo) <= agora;

  async function chamar(functionName: string, args: unknown[] = [acordo.id]) {
    await tx.enviar({ address: CONTRACTS.escrow, abi: abis.escrow, functionName, args });
    onFeito();
  }

  const meuPapel = souComprador
    ? "você é o comprador"
    : souVendedor
      ? "você é o vendedor"
      : souArbitro
        ? "você é o árbitro"
        : "você está só olhando";

  return (
    <Card
      titulo={acordo.descricao || `Acordo #${acordo.id}`}
      subtitulo={`#${acordo.id} · ${meuPapel}`}
      destaque={estado === ESTADO.emDisputa}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              {
                neutro: "bg-slate-100 text-slate-700",
                bom: "bg-emerald-100 text-emerald-700",
                ruim: "bg-rose-100 text-rose-700",
                alerta: "bg-amber-100 text-amber-800",
              }[info.tom]
            }`}
          >
            {info.rotulo}
          </span>
          <span className="text-sm text-slate-500">{info.explicacao}</span>
        </div>

        <dl className="grid gap-5 sm:grid-cols-4">
          <Stat rotulo="Valor em custódia" valor={fmt(acordo.valor)} sufixo="BRLX" />
          <Stat rotulo="Comprador" valor={encurtar(acordo.comprador)} />
          <Stat rotulo="Vendedor" valor={encurtar(acordo.vendedor)} />
          <Stat
            rotulo="Árbitro"
            valor={encurtar(acordo.arbitro)}
            dica="quem decide se houver disputa"
          />
        </dl>

        {prazo !== undefined && (
          <Stat
            rotulo={estado === ESTADO.financiado ? "Prazo para o envio" : "Janela de revisão"}
            valor={fmtRestante(prazo, agora)}
            tom={venceu ? "ruim" : "neutro"}
            dica={
              estado === ESTADO.financiado
                ? "vencido, o comprador pode cancelar"
                : "vencida, o vendedor recebe pelo silêncio"
            }
          />
        )}

        {!encerrado && (
          <div className="flex flex-wrap gap-3">
            {souVendedor && estado === ESTADO.financiado && (
              <Botao disabled={tx.ocupada} onClick={() => chamar("marcarEnviado")}>
                Marcar como enviado
              </Botao>
            )}

            {souComprador && (estado === ESTADO.financiado || estado === ESTADO.enviado) && (
              <Botao disabled={tx.ocupada} onClick={() => chamar("liberar")}>
                Liberar pagamento
              </Botao>
            )}

            {souComprador && estado === ESTADO.financiado && venceu && (
              <Botao variante="secundario" disabled={tx.ocupada} onClick={() => chamar("cancelarPorPrazo")}>
                Cancelar e ser reembolsado
              </Botao>
            )}

            {estado === ESTADO.enviado && venceu && (
              <Botao variante="secundario" disabled={tx.ocupada} onClick={() => chamar("liberarPorPrazo")}>
                Liberar por prazo vencido
              </Botao>
            )}

            {(souComprador || souVendedor) &&
              (estado === ESTADO.financiado || estado === ESTADO.enviado) && (
                <Botao variante="perigo" disabled={tx.ocupada} onClick={() => chamar("abrirDisputa")}>
                  Abrir disputa
                </Botao>
              )}

            {souArbitro && estado === ESTADO.emDisputa && (
              <>
                <Botao disabled={tx.ocupada} onClick={() => chamar("resolver", [acordo.id, true])}>
                  Decidir pelo vendedor
                </Botao>
                <Botao
                  variante="secundario"
                  disabled={tx.ocupada}
                  onClick={() => chamar("resolver", [acordo.id, false])}
                >
                  Decidir pelo comprador
                </Botao>
              </>
            )}
          </div>
        )}

        <StatusTx tx={tx} sucesso="Estado do acordo mudou." />

        {estado === ESTADO.emDisputa && !souArbitro && (
          <Aviso tom="alerta">
            A partir daqui você não tem mais nenhum poder sobre esse dinheiro. Quem decide é{" "}
            {encurtar(acordo.arbitro)} — e essa escolha foi feita quando o acordo nasceu.
          </Aviso>
        )}

        {encerrado && (
          <NotaDeAula>
            Acordo encerrado e imutável. O histórico inteiro — quem criou, quem enviou, quem
            decidiu — está{" "}
            {linkExplorer("address", CONTRACTS.escrow) ? (
              <a
                href={linkExplorer("address", CONTRACTS.escrow)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                gravado no contrato
              </a>
            ) : (
              "gravado no contrato"
            )}
            . Transparência total do processo não garante que a decisão tenha sido justa.
          </NotaDeAula>
        )}
      </div>
    </Card>
  );
}
