"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { AbiEvent, Address, Hash } from "viem";
import { activeChain } from "@/lib/wagmi";
import {
  CONTRACTS,
  DEPLOY_BLOCK,
  LADO,
  POOLS,
  abis,
  encurtar,
  fmt,
  fmtPreco,
  tokenPorEndereco,
} from "@/lib/contracts";

/**
 * O feed do telão: o que a turma fez, em todos os labs, ao vivo.
 *
 * Substitui os `useWatchContractEvent` que havia aqui antes, por dois motivos
 * que apareceram na aula:
 *
 * 1. **Sem histórico.** `watch` começa a contar do instante em que a página
 *    abre. Quem projetava o telão depois do primeiro exercício via
 *    "Esperando a primeira transação da turma…" com meia hora de blocos já
 *    minerados atrás — a tela mentia sobre a aula estar parada.
 * 2. **Cobertura parcial.** Só pool e livro eram observados. Um aluno podia
 *    depositar no cofre, colher, criar acordo e contribuir na vaquinha sem que
 *    nada disso existisse para o telão.
 *
 * Uma varredura de `getLogs` sobre os seis contratos resolve os dois: a
 * primeira passada traz o que já aconteceu, e as seguintes só pedem os blocos
 * novos. É também *uma* chamada de RPC por ciclo no lugar de um filtro por
 * evento por contrato — o que importa quando o endpoint é compartilhado com a
 * turma inteira.
 */

export type TipoDeEvento = "swap" | "entrou" | "saiu" | "ordem" | "negocio";

export type EventoDaTurma = {
  id: string;
  tipo: TipoDeEvento;
  quem: Address;
  texto: string;
};

/** Quantos blocos para trás na primeira varredura, se o deploy for antigo. */
const JANELA_MAXIMA = 5_000n;

/**
 * Quantas linhas o feed guarda na memória.
 *
 * A tela mostra 50 por vez (ver `POR_PAGINA` no telão); este número é o fundo
 * do histórico que a paginação pode folhear. Dez páginas cobrem a aula inteira
 * sem deixar o array crescer sem limite numa página que fica aberta por horas.
 */
const HISTORICO = 500;

const CONTRATOS = [
  CONTRACTS.poolFundo,
  CONTRACTS.poolRaso,
  CONTRACTS.orderBook,
  CONTRACTS.staking,
  CONTRACTS.escrow,
  CONTRACTS.crowdfunding,
] as const;

/**
 * Os eventos saem das ABIs exportadas, não de assinaturas escritas à mão.
 *
 * Assinatura digitada erra em silêncio: o `topic0` não bate, o filtro não casa
 * com nada e o telão fica vazio sem nenhum erro no console — exatamente o
 * sintoma que este arquivo existe para consertar.
 */
function eventosDe(abi: readonly unknown[]): AbiEvent[] {
  return abi.filter(
    (item): item is AbiEvent =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: string }).type === "event",
  );
}

/**
 * Só o que `descrever` sabe traduzir.
 *
 * Sem este filtro entram no `topic0` do pedido o `Transfer` e o `Approval` do
 * token de LP, o `OwnershipTransferred` do cofre e outros seis que a tela
 * descarta em seguida — lixo que o RPC ainda tem que varrer. Manter a lista ao
 * lado do `switch` também impede que as duas se afastem em silêncio: evento
 * novo no contrato sem linha aqui simplesmente não aparece no telão.
 */
const NO_FEED = new Set([
  "Swap",
  "LiquidityAdded",
  "LiquidityRemoved",
  "OrdemColocada",
  "OrdemExecutada",
  "OrdemCancelada",
  "Depositado",
  "Retirado",
  "Colhido",
  "Reinvestido",
  "Abastecido",
  "AcordoCriado",
  "EnvioMarcado",
  "Liberado",
  "DisputaAberta",
  "DisputaResolvida",
  "CampanhaCriada",
  "Contribuiu",
  "Sacada",
  "Reembolsado",
]);

const EVENTOS: AbiEvent[] = [
  ...eventosDe(abis.pool),
  ...eventosDe(abis.livro),
  ...eventosDe(abis.staking),
  ...eventosDe(abis.escrow),
  ...eventosDe(abis.crowdfunding),
].filter((e) => NO_FEED.has(e.name));

type LogDecodificado = {
  address: Address;
  eventName?: string;
  args?: Record<string, unknown>;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hash | null;
};

const endereco = (v: unknown) => v as Address;
const quantia = (v: unknown) => v as bigint;
const texto = (v: unknown) => (typeof v === "string" ? v : "");

function nomeDoPool(address: Address): string | undefined {
  const alvo = address.toLowerCase();
  return POOLS.find((p) => p.address.toLowerCase() === alvo)?.nome.toLowerCase();
}

/**
 * Traduz um log para a linha que vai ao projetor.
 *
 * Devolve `undefined` para o que não vale uma linha — o `TaxaConfigurada` do
 * cofre, por exemplo, que é ajuste do professor e não ação de aluno.
 */
function descrever(log: LogDecodificado): Omit<EventoDaTurma, "id"> | undefined {
  const a = log.args ?? {};
  const pool = nomeDoPool(log.address);

  switch (log.eventName) {
    // --- Pool ---------------------------------------------------------------
    case "Swap": {
      const entrada = tokenPorEndereco(endereco(a.tokenIn))?.symbol ?? "?";
      const saida = tokenPorEndereco(endereco(a.tokenOut))?.symbol ?? "?";
      return {
        tipo: "swap",
        quem: endereco(a.trader),
        texto: `trocou ${fmt(quantia(a.amountIn))} ${entrada} por ${fmt(quantia(a.amountOut))} ${saida} · ${pool}`,
      };
    }
    case "LiquidityAdded":
      return {
        tipo: "entrou",
        quem: endereco(a.provider),
        texto: `virou LP com ${fmt(quantia(a.amount0))} CSR + ${fmt(quantia(a.amount1))} BRLX · ${pool}`,
      };
    case "LiquidityRemoved":
      return {
        tipo: "saiu",
        quem: endereco(a.provider),
        texto: `saiu levando ${fmt(quantia(a.amount0))} CSR + ${fmt(quantia(a.amount1))} BRLX · ${pool}`,
      };

    // --- Livro de ordens ----------------------------------------------------
    case "OrdemColocada": {
      const vendendo = Number(a.lado) === LADO.venda;
      return {
        tipo: "ordem",
        quem: endereco(a.dono),
        texto: `ofereceu ${vendendo ? "venda" : "compra"} de ${fmt(quantia(a.quantidade))} CSR a ${fmtPreco(quantia(a.preco))} · livro`,
      };
    }
    case "OrdemExecutada": {
      const makerVendia = Number(a.ladoDoMaker) === LADO.venda;
      return {
        tipo: "negocio",
        quem: endereco(a.taker),
        texto: `${makerVendia ? "comprou" : "vendeu"} ${fmt(quantia(a.quantidade))} CSR a ${fmtPreco(quantia(a.preco))} de ${encurtar(endereco(a.maker))} · livro`,
      };
    }
    case "OrdemCancelada":
      return {
        tipo: "saiu",
        quem: endereco(a.dono),
        texto: `tirou ${fmt(quantia(a.quantidadeDevolvida))} CSR do livro · livro`,
      };

    // --- Cofre de staking ---------------------------------------------------
    case "Depositado":
      return {
        tipo: "entrou",
        quem: endereco(a.quem),
        texto: `depositou ${fmt(quantia(a.quantidade))} CSR no cofre · staking`,
      };
    case "Retirado":
      return {
        tipo: "saiu",
        quem: endereco(a.quem),
        texto: `retirou ${fmt(quantia(a.quantidade))} CSR do cofre · staking`,
      };
    case "Colhido":
      return {
        tipo: "negocio",
        quem: endereco(a.quem),
        texto: `colheu ${fmt(quantia(a.quantidade))} CSR de rendimento · staking`,
      };
    case "Reinvestido":
      return {
        tipo: "entrou",
        quem: endereco(a.quem),
        texto: `reinvestiu ${fmt(quantia(a.quantidade))} CSR · staking`,
      };
    case "Abastecido":
      return {
        tipo: "entrou",
        quem: endereco(a.quem),
        texto: `abasteceu a reserva com ${fmt(quantia(a.quantidade))} CSR · staking`,
      };

    // --- Escrow -------------------------------------------------------------
    case "AcordoCriado":
      return {
        tipo: "entrou",
        quem: endereco(a.comprador),
        texto: `travou ${fmt(quantia(a.valor))} BRLX em custódia para ${encurtar(endereco(a.vendedor))} · escrow`,
      };
    case "EnvioMarcado":
      return {
        tipo: "ordem",
        quem: endereco(a.vendedor),
        texto: `marcou envio do acordo #${a.id} · escrow`,
      };
    case "Liberado":
      return {
        tipo: "negocio",
        quem: endereco(a.para),
        texto: `recebeu ${fmt(quantia(a.valor))} BRLX do acordo #${a.id} (${texto(a.motivo)}) · escrow`,
      };
    case "DisputaAberta":
      return {
        tipo: "ordem",
        quem: endereco(a.quem),
        texto: `abriu disputa no acordo #${a.id} · escrow`,
      };
    case "DisputaResolvida":
      return {
        tipo: "negocio",
        quem: endereco(a.arbitro),
        texto: `decidiu o acordo #${a.id} a favor do ${a.paraVendedor ? "vendedor" : "comprador"} · escrow`,
      };

    // --- Vaquinha -----------------------------------------------------------
    case "CampanhaCriada":
      return {
        tipo: "ordem",
        quem: endereco(a.criador),
        texto: `abriu a vaquinha "${texto(a.titulo)}" com meta de ${fmt(quantia(a.meta))} BRLX · vaquinha`,
      };
    case "Contribuiu":
      return {
        tipo: "entrou",
        quem: endereco(a.quem),
        texto: `contribuiu ${fmt(quantia(a.valor))} BRLX na campanha #${a.id} · vaquinha`,
      };
    case "Sacada":
      return {
        tipo: "negocio",
        quem: endereco(a.criador),
        texto: `sacou ${fmt(quantia(a.valor))} BRLX da campanha #${a.id} · vaquinha`,
      };

    /**
     * `Reembolsado` existe nos dois contratos, com assinaturas diferentes — o
     * do escrow carrega um `motivo`, o da vaquinha não. É o endereço do log que
     * desempata, não o nome.
     */
    case "Reembolsado": {
      const noEscrow =
        log.address.toLowerCase() === CONTRACTS.escrow.toLowerCase();
      return {
        tipo: "saiu",
        quem: endereco(a.para ?? a.quem),
        texto: noEscrow
          ? `recebeu ${fmt(quantia(a.valor))} BRLX de volta do acordo #${a.id} · escrow`
          : `sacou o reembolso de ${fmt(quantia(a.valor))} BRLX da campanha #${a.id} · vaquinha`,
      };
    }

    default:
      return undefined;
  }
}

export function useFeedDaTurma(intervaloMs = 4000) {
  const client = usePublicClient({ chainId: activeChain.id });
  const [eventos, setEventos] = useState<EventoDaTurma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | undefined>();

  // `ref` e não `state`: o cursor avança a cada ciclo e não deve reiniciar o
  // intervalo nem redesenhar a tela quando muda.
  const proximoBloco = useRef<bigint | undefined>(undefined);
  const ocupado = useRef(false);

  const varrer = useCallback(async () => {
    if (!client || ocupado.current) return;
    ocupado.current = true;

    try {
      const ultimo = await client.getBlockNumber();

      if (proximoBloco.current === undefined) {
        const janela = ultimo > JANELA_MAXIMA ? ultimo - JANELA_MAXIMA : 0n;
        proximoBloco.current =
          DEPLOY_BLOCK > janela ? DEPLOY_BLOCK : janela;
      }
      if (proximoBloco.current > ultimo) return;

      const logs = (await client.getLogs({
        address: [...CONTRATOS],
        events: EVENTOS,
        fromBlock: proximoBloco.current,
        toBlock: ultimo,
      })) as unknown as LogDecodificado[];

      proximoBloco.current = ultimo + 1n;
      setErro(undefined);

      const novos: EventoDaTurma[] = [];
      for (const log of logs) {
        const linha = descrever(log);
        if (!linha || !linha.quem) continue;
        novos.push({
          id: `${log.transactionHash}-${log.logIndex}`,
          ...linha,
        });
      }
      if (novos.length === 0) return;

      // `getLogs` devolve do mais antigo para o mais novo; o telão mostra o
      // contrário, porque a linha que importa numa aula é a que acabou de sair.
      novos.reverse();
      setEventos((antes) => {
        const vistos = new Set(novos.map((e) => e.id));
        return [...novos, ...antes.filter((e) => !vistos.has(e.id))].slice(
          0,
          HISTORICO,
        );
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao ler a rede");
    } finally {
      ocupado.current = false;
      setCarregando(false);
    }
  }, [client]);

  useEffect(() => {
    // A primeira varredura sai por um timer de 0 em vez de direto no corpo do
    // efeito: `varrer` é assíncrona e só chama `setState` depois do await, mas
    // a regra do lint não consegue ver isso e barraria o arquivo.
    const inicial = setTimeout(() => void varrer(), 0);
    const ciclo = setInterval(() => void varrer(), intervaloMs);
    return () => {
      clearTimeout(inicial);
      clearInterval(ciclo);
    };
  }, [varrer, intervaloMs]);

  return { eventos, carregando, erro };
}
