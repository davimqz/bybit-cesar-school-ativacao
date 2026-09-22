"use client";

import { Card, Botao, Aviso, NotaDeAula } from "@/components/ui";
import { useTx, StatusTx } from "@/hooks/useTx";
import { CONTRACTS, LADO, abis, fmt, fmtPreco, linkExplorer, type Ordem } from "@/lib/contracts";

/**
 * As ordens vivas do aluno, com o botão de cancelar.
 *
 * Cancelar é o momento em que a custódia fica óbvia: o token volta porque
 * estava guardado num contrato, não porque alguém teve boa vontade.
 */
export function MinhasOrdens({
  minhas,
  conectado,
  onFeito,
}: {
  minhas: readonly Ordem[];
  conectado: boolean;
  onFeito: () => void;
}) {
  const tx = useTx();
  const link = linkExplorer("address", CONTRACTS.orderBook);

  return (
    <Card titulo="Suas ordens no livro" subtitulo="O que você ainda tem parado no mercado">
      {!conectado ? (
        <Aviso tom="info">Conecte a carteira para ver suas ordens.</Aviso>
      ) : minhas.length === 0 ? (
        <Aviso tom="info">
          Você não tem ordens no livro. Coloque uma abaixo e ela aparece aqui.
        </Aviso>
      ) : (
        <ul className="divide-y divide-slate-100">
          {minhas.map((o) => {
            const vendendo = Number(o.lado) === LADO.venda;
            return (
              <li key={String(o.id)} className="flex items-center justify-between gap-4 py-3">
                <div className="text-sm">
                  <span
                    className={`font-semibold ${vendendo ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {vendendo ? "Vendendo" : "Comprando"} {fmt(o.quantidade)} CSR
                  </span>
                  <span className="text-slate-500"> a {fmtPreco(o.preco)} BRLX</span>
                  <span className="ml-2 text-xs text-slate-400">#{String(o.id)}</span>
                </div>
                <Botao
                  variante="secundario"
                  disabled={tx.ocupada}
                  onClick={async () => {
                    await tx.enviar({
                      address: CONTRACTS.orderBook,
                      abi: abis.livro,
                      functionName: "cancelar",
                      args: [o.id],
                    });
                    onFeito();
                  }}
                >
                  Cancelar
                </Botao>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3">
        <StatusTx tx={tx} sucesso="Ordem cancelada e custódia devolvida." />
      </div>

      <NotaDeAula>
        O saldo dessas ordens está no contrato do livro
        {link && (
          <>
            {" "}
            (
            <a href={link} target="_blank" rel="noreferrer" className="underline">
              veja no explorador
            </a>
            )
          </>
        )}
        , não na sua carteira. Cancelar devolve na hora — e é o próprio código que garante
        isso, não uma promessa de atendimento.
      </NotaDeAula>
    </Card>
  );
}
