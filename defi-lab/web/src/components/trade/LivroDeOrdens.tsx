"use client";

import { Card, NotaDeAula } from "@/components/ui";
import { acumulado } from "@/hooks/useLivro";
import { encurtar, fmt, fmtBps, fmtPreco, type Ordem } from "@/lib/contracts";

/**
 * O livro, do jeito que uma corretora desenha: vendas em cima, compras
 * embaixo, o spread no meio como uma faixa vazia.
 *
 * A barra atrás de cada linha é a profundidade acumulada. É o que faz a turma
 * enxergar que uma ordem grande não executa num preço — ela desce a escada.
 */
export function LivroDeOrdens({
  vendas,
  compras,
  spreadBps,
  meio,
  selecionada,
  onSelecionar,
  meuEndereco,
}: {
  vendas: readonly Ordem[];
  compras: readonly Ordem[];
  spreadBps?: bigint;
  meio?: bigint;
  selecionada?: bigint;
  onSelecionar: (o: Ordem) => void;
  meuEndereco?: string;
}) {
  const accVendas = acumulado(vendas);
  const accCompras = acumulado(compras);
  const maxAcc = [...accVendas, ...accCompras].reduce(
    (a, b) => (b > a ? b : a),
    1n,
  );

  // Vendas de cima para baixo: a mais cara primeiro, a melhor colada no spread.
  const vendasDeCima = vendas
    .map((o, i) => ({ o, acc: accVendas[i] }))
    .reverse();

  return (
    <Card
      titulo="Livro de ordens"
      subtitulo="CSR / BRLX — clique numa linha para negociar contra ela"
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 border-b border-border bg-muted px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Preço (BRLX)</span>
          <span className="text-right">Quantidade</span>
          <span className="text-right">Acumulado</span>
          <span className="w-20 text-right">Quem</span>
        </div>

        {vendasDeCima.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Ninguém vendendo.
          </p>
        )}
        {vendasDeCima.map(({ o, acc }) => (
          <Linha
            key={String(o.id)}
            ordem={o}
            acumulado={acc}
            maxAcc={maxAcc}
            tom="venda"
            selecionada={selecionada === o.id}
            onSelecionar={onSelecionar}
            meuEndereco={meuEndereco}
          />
        ))}

        <div className="flex items-baseline justify-between border-y border-border bg-secondary px-4 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Spread
          </span>
          <span className="text-sm tabular-nums text-foreground">
            {spreadBps !== undefined && spreadBps > 0n ? (
              <>
                <strong>{fmtBps(spreadBps)}</strong>
                {meio && (
                  <span className="text-muted-foreground">
                    {" "}
                    · meio {fmtPreco(meio)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">falta um dos lados</span>
            )}
          </span>
        </div>

        {compras.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            Ninguém comprando.
          </p>
        )}
        {compras.map((o, i) => (
          <Linha
            key={String(o.id)}
            ordem={o}
            acumulado={accCompras[i]}
            maxAcc={maxAcc}
            tom="compra"
            selecionada={selecionada === o.id}
            onSelecionar={onSelecionar}
            meuEndereco={meuEndereco}
          />
        ))}
      </div>

      <NotaDeAula>
        Cada linha é uma pessoa que já depositou o que prometeu — o contrato
        está segurando o dinheiro de quem compra e a mercadoria de quem vende.
        Por isso nenhuma execução aqui pode falhar por falta de saldo do outro
        lado.
      </NotaDeAula>
    </Card>
  );
}

function Linha({
  ordem,
  acumulado,
  maxAcc,
  tom,
  selecionada,
  onSelecionar,
  meuEndereco,
}: {
  ordem: Ordem;
  acumulado: bigint;
  maxAcc: bigint;
  tom: "compra" | "venda";
  selecionada: boolean;
  onSelecionar: (o: Ordem) => void;
  meuEndereco?: string;
}) {
  const largura = Number((acumulado * 100n) / maxAcc);
  const minha =
    meuEndereco && ordem.dono.toLowerCase() === meuEndereco.toLowerCase();

  const cores =
    tom === "venda"
      ? { texto: "text-down", barra: "bg-down-surface" }
      : { texto: "text-up", barra: "bg-up-surface" };

  return (
    <button
      onClick={() => onSelecionar(ordem)}
      className={`relative grid w-full grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2 text-left text-sm tabular-nums transition hover:bg-muted ${
        selecionada ? "ring-2 ring-inset ring-ring" : ""
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 right-0 ${cores.barra}`}
        style={{ width: `${largura}%` }}
      />
      <span className={`relative font-semibold ${cores.texto}`}>
        {fmtPreco(ordem.preco)}
      </span>
      <span className="relative text-right">{fmt(ordem.quantidade)}</span>
      <span className="relative text-right text-muted-foreground">
        {fmt(acumulado)}
      </span>
      <span className="relative w-20 text-right text-xs text-muted-foreground">
        {minha ? (
          <strong className="text-foreground">você</strong>
        ) : (
          encurtar(ordem.dono)
        )}
      </span>
    </button>
  );
}
