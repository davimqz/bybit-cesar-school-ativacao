"use client";

import { formatUnits, type Address } from "viem";
import { Card, Stat, NotaDeAula, Aviso } from "@/components/ui";
import { usePoolData, useDepositosDoAluno } from "@/hooks/usePool";

/**
 * Impermanent loss, medido ao vivo na posição do próprio aluno.
 *
 * A conta é a comparação honesta: o que você tiraria do pool agora contra
 * o que a cesta que você depositou valeria se tivesse ficado na carteira —
 * ambas avaliadas ao MESMO preço, o de agora. Se a segunda for maior, a
 * diferença é a perda impermanente.
 */
export function PainelIL({ pool }: { pool: Address }) {
  const { spot, minhaPosicao0, minhaPosicao1, minhasShares } =
    usePoolData(pool);
  const { data: depositos } = useDepositosDoAluno(pool);

  if (!minhasShares || minhasShares === 0n) {
    return (
      <Card titulo="Sua posição de LP">
        <Aviso tom="info">
          Deposite no pool para acompanhar taxas e perda impermanente aqui.
        </Aviso>
      </Card>
    );
  }

  if (
    !depositos ||
    !spot ||
    minhaPosicao0 === undefined ||
    minhaPosicao1 === undefined
  ) {
    return (
      <Card titulo="Sua posição de LP">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </Card>
    );
  }

  const preco = Number(formatUnits(spot, 18));
  const num = (v: bigint) => Number(formatUnits(v, 18));

  const valorNoPool = num(minhaPosicao0) * preco + num(minhaPosicao1);
  const valorSeTivesseGuardado =
    num(depositos.total0) * preco + num(depositos.total1);
  const diferenca = valorNoPool - valorSeTivesseGuardado;
  const diferencaPct =
    valorSeTivesseGuardado > 0 ? (diferenca / valorSeTivesseGuardado) * 100 : 0;

  const perdendo = diferenca < 0;

  return (
    <Card
      titulo="Sua posição de LP"
      subtitulo="Tudo medido em BRLX, ao preço deste instante"
      destaque={perdendo}
    >
      <dl className="grid gap-5 sm:grid-cols-2">
        <Stat
          rotulo="No pool agora"
          valor={valorNoPool.toLocaleString("pt-BR", {
            maximumFractionDigits: 2,
          })}
          sufixo="BRLX"
          dica={`${num(minhaPosicao0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} CSR + ${num(minhaPosicao1).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} BRLX`}
        />
        <Stat
          rotulo="Se tivesse só guardado"
          valor={valorSeTivesseGuardado.toLocaleString("pt-BR", {
            maximumFractionDigits: 2,
          })}
          sufixo="BRLX"
          dica={`${num(depositos.total0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} CSR + ${num(depositos.total1).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} BRLX`}
        />
        <div className="sm:col-span-2">
          <Stat
            rotulo={perdendo ? "Perda impermanente" : "Resultado vs. guardar"}
            valor={`${diferenca >= 0 ? "+" : ""}${diferenca.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`}
            sufixo={`BRLX (${diferencaPct >= 0 ? "+" : ""}${diferencaPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`}
            tom={perdendo ? "ruim" : "bom"}
          />
        </div>
      </dl>

      <NotaDeAula>
        {perdendo ? (
          <>
            Enquanto o preço divergir, ser LP rende menos que ter ficado parado.
            As taxas trabalham a seu favor e a divergência contra — o saldo
            entre as duas é o que você vê aí em cima. “Impermanente” só
            significa que a conta volta se o preço voltar. Se você sair antes,
            ela virou permanente.
          </>
        ) : (
          <>
            No momento as taxas cobrem a divergência de preço. Peça ao professor
            um swap grande e olhe este número de novo.
          </>
        )}
        {depositos.aportes > 1 && (
          <>
            {" "}
            <em>
              (Você fez {depositos.aportes} aportes em preços diferentes — a
              comparação vira uma aproximação.)
            </em>
          </>
        )}
      </NotaDeAula>
    </Card>
  );
}
