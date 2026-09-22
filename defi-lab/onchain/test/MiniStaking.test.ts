import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

/**
 * Staking, conceito por conceito.
 *
 * Aqui o relogio e o personagem principal: quase todo teste avanca o tempo e
 * confere quanto o cofre emitiu. Rode com `npm test` e projete — o bloco de APR
 * imprime o numero caindo quando a baleia entra.
 */

const { viem } = await network.connect();

const SUPPLY = parseEther("10000000");
const FAUCET_AMOUNT = parseEther("1000");
const FAUCET_COOLDOWN = 60n;

/** 1 CSR por segundo: numero redondo para a conta ser conferivel de cabeca. */
const TAXA = parseEther("1");
const RESERVA = parseEther("100000");

const UM_DIA = 86400;
const UM_ANO = 365 * UM_DIA;

async function deployFixture() {
  const [professor, alice, bob] = await viem.getWalletClients();
  const test = await viem.getTestClient();
  const publicClient = await viem.getPublicClient();

  const csr = await viem.deployContract("ClassroomToken", [
    "CESAR Coin",
    "CSR",
    SUPPLY,
    FAUCET_AMOUNT,
    FAUCET_COOLDOWN,
    professor.account.address,
  ]);

  const cofre = await viem.deployContract("MiniStaking", [
    csr.address,
    TAXA,
    professor.account.address,
  ]);

  for (const wallet of [professor, alice, bob]) {
    const to = wallet.account.address;
    if (to !== professor.account.address) {
      await csr.write.mint([to, parseEther("100000")]);
    }
    await csr.write.approve([cofre.address, SUPPLY], { account: wallet.account });
  }

  await cofre.write.abastecer([RESERVA]);

  /** Avanca o relogio e fecha um bloco, para o contrato ver o tempo passar. */
  async function avancar(segundos: number) {
    await test.increaseTime({ seconds: segundos });
    await test.mine({ blocks: 1 });
  }

  return { professor, alice, bob, csr, cofre, avancar, publicClient };
}

/** Compara com folga: o timestamp do bloco varia em alguns segundos. */
function perto(real: bigint, esperado: bigint, folga: bigint, msg: string) {
  const diff = real > esperado ? real - esperado : esperado - real;
  assert.ok(
    diff <= folga,
    `${msg}\n  esperado ~${formatEther(esperado)}, veio ${formatEther(real)}`,
  );
}

describe("MiniStaking — o cofre de rendimento da aula", () => {
  let fx: Awaited<ReturnType<typeof deployFixture>>;

  beforeEach(async () => {
    fx = await deployFixture();
  });

  describe("De onde vem o rendimento", () => {
    it("o rendimento sai de uma reserva que alguem depositou — e ela diminui", async () => {
      const { cofre, alice, avancar } = fx;

      const reservaAntes = await cofre.read.reservaDeRecompensa();
      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await avancar(UM_DIA);

      // Um saque qualquer forca o contrato a contabilizar o periodo.
      await cofre.write.colher({ account: alice.account });
      const reservaDepois = await cofre.read.reservaDeRecompensa();

      assert.ok(reservaDepois < reservaAntes, "a reserva tinha que ter sido consumida");
      perto(
        reservaAntes - reservaDepois,
        TAXA * BigInt(UM_DIA),
        TAXA * 5n,
        "o consumo tinha que ser a emissao de um dia",
      );
    });

    it("cofre vazio nao emite: a reserva espera por quem chegar", async () => {
      const { cofre, alice, avancar } = fx;

      // Um dia inteiro sem ninguem depositado.
      await avancar(UM_DIA);

      const reserva = await cofre.read.reservaDeRecompensa();
      assert.equal(reserva, RESERVA, "sem depositantes, nada pode ter sido emitido");

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      assert.equal(
        await cofre.read.pendente([alice.account.address]),
        0n,
        "quem acabou de entrar nao herda o rendimento do periodo vazio",
      );
    });

    it("reserva seca = rendimento zero, por mais que o APR prometesse outra coisa", async () => {
      const { cofre, alice, avancar } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });

      // A reserva de 100.000 CSR a 1 CSR/s dura 100.000 s. Passamos bem disso.
      await avancar(200_000);
      await cofre.write.colher({ account: alice.account });

      assert.equal(await cofre.read.reservaDeRecompensa(), 0n);
      assert.equal(await cofre.read.aprBps(), 0n, "sem reserva, o APR honesto e zero");

      await avancar(UM_DIA);
      assert.equal(
        await cofre.read.pendente([alice.account.address]),
        0n,
        "nao ha de onde pagar: o rendimento para",
      );
    });

    it("a reserva tem prazo de validade, e o contrato diz qual", async () => {
      const { cofre } = fx;

      // 100.000 CSR de reserva a 1 CSR por segundo.
      assert.equal(await cofre.read.segundosDeReserva(), 100_000n);
    });
  });

  describe("APR: o numero que muda debaixo de voce", () => {
    it("o APR cai quando entra mais gente — o bolo e o mesmo", async () => {
      const { cofre, alice, bob } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      const aprSozinha = await cofre.read.aprBps();

      await cofre.write.depositar([parseEther("9000")], { account: bob.account });
      const aprComBaleia = await cofre.read.aprBps();

      console.log(
        `\n      APR com 1.000 CSR no cofre:  ${Number(aprSozinha) / 100}%\n` +
          `      APR depois da baleia (10.000): ${Number(aprComBaleia) / 100}%\n`,
      );

      assert.ok(aprComBaleia < aprSozinha, "mais depositado, menos APR");
      // Dez vezes mais depositado, um decimo do APR.
      perto(aprComBaleia * 10n, aprSozinha, 10n, "o APR tinha que cair na proporcao");
    });

    it("quem divide o cofre divide a emissao na proporcao do deposito", async () => {
      const { cofre, alice, bob, avancar } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await cofre.write.depositar([parseEther("3000")], { account: bob.account });

      await avancar(UM_DIA);

      const daAlice = await cofre.read.pendente([alice.account.address]);
      const doBob = await cofre.read.pendente([bob.account.address]);

      // Bob depositou 3x mais, entao recebe ~3x mais.
      perto(doBob, daAlice * 3n, TAXA * 5n, "a divisao tinha que seguir a proporcao");
      assert.equal(await cofre.read.fatiaBps([bob.account.address]), 7500n);
    });

    it("o APR nao e promessa: o dono muda a emissao e o numero muda junto", async () => {
      const { cofre, alice } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      const antes = await cofre.read.aprBps();

      await cofre.write.configurarTaxa([TAXA / 2n]);
      const depois = await cofre.read.aprBps();

      perto(depois * 2n, antes, 10n, "metade da emissao, metade do APR");
    });

    it("so o dono mexe na emissao", async () => {
      const { cofre, alice } = fx;

      await assert.rejects(
        cofre.write.configurarTaxa([TAXA * 100n], { account: alice.account }),
        "um aluno nao pode subir o proprio rendimento",
      );
    });
  });

  describe("Depositar, colher, retirar", () => {
    it("o rendimento so comeca a contar quando o deposito entra", async () => {
      const { cofre, alice, bob, avancar } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await avancar(UM_DIA);
      await cofre.write.depositar([parseEther("1000")], { account: bob.account });

      assert.equal(
        await cofre.read.pendente([bob.account.address]),
        0n,
        "bob nao pode receber pelo dia em que nao estava no cofre",
      );
      assert.ok(
        (await cofre.read.pendente([alice.account.address])) > 0n,
        "alice, que estava, recebeu",
      );
    });

    it("colher move o token para a carteira e zera o pendente", async () => {
      const { cofre, csr, alice, avancar } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await avancar(UM_DIA);

      const antes = await csr.read.balanceOf([alice.account.address]);
      await cofre.write.colher({ account: alice.account });
      const depois = await csr.read.balanceOf([alice.account.address]);

      perto(depois - antes, TAXA * BigInt(UM_DIA), TAXA * 5n, "recebeu a emissao do dia");
      assert.equal(await cofre.read.pendente([alice.account.address]), 0n);
    });

    it("retirar o principal nao queima o rendimento ja fechado", async () => {
      const { cofre, alice, avancar } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await avancar(UM_DIA);

      await cofre.write.retirar([parseEther("1000")], { account: alice.account });

      assert.equal((await cofre.read.posicoes([alice.account.address]))[0], 0n);
      assert.ok(
        (await cofre.read.pendente([alice.account.address])) > 0n,
        "o que rendeu enquanto estava dentro continua sendo dela",
      );

      await cofre.write.colher({ account: alice.account });
    });

    it("ninguem retira mais do que depositou", async () => {
      const { cofre, alice } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });

      await assert.rejects(
        cofre.write.retirar([parseEther("1001")], { account: alice.account }),
        "o contrato tinha que recusar",
      );
    });

    it("quem nunca depositou nao tem o que colher — e o contrato recusa", async () => {
      const { cofre, alice, bob, avancar } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await avancar(UM_DIA);

      await assert.rejects(
        cofre.write.colher({ account: bob.account }),
        "bob nunca entrou no cofre: nao ha rendimento dele para sacar",
      );
    });

    it("colher duas vezes seguidas nao paga o mesmo periodo duas vezes", async () => {
      const { cofre, csr, alice, avancar } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await avancar(UM_DIA);

      await cofre.write.colher({ account: alice.account });
      const depoisDaPrimeira = await csr.read.balanceOf([alice.account.address]);

      // Sem avancar o relogio: no maximo os poucos segundos dos proprios blocos.
      await cofre.write.colher({ account: alice.account });
      const depoisDaSegunda = await csr.read.balanceOf([alice.account.address]);

      perto(
        depoisDaSegunda - depoisDaPrimeira,
        0n,
        TAXA * 5n,
        "a segunda colheita nao pode repagar o dia inteiro",
      );
    });
  });

  describe("APR contra APY: quem reinveste", () => {
    it("reinvestir aumenta a propria fatia sem token nenhum se mover", async () => {
      const { cofre, csr, alice, avancar } = fx;

      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await avancar(UM_DIA);

      const naCarteira = await csr.read.balanceOf([alice.account.address]);
      const noCofreAntes = (await cofre.read.posicoes([alice.account.address]))[0];

      await cofre.write.reinvestir({ account: alice.account });

      const noCofreDepois = (await cofre.read.posicoes([alice.account.address]))[0];

      assert.equal(
        await csr.read.balanceOf([alice.account.address]),
        naCarteira,
        "reinvestir nao passa pela carteira: o token ja estava no contrato",
      );
      perto(
        noCofreDepois - noCofreAntes,
        TAXA * BigInt(UM_DIA),
        TAXA * 5n,
        "a posicao cresceu pelo rendimento do dia",
      );
    });

    it("reinvestindo, o ganho do ano passa do APR — e isso vem de quem nao reinveste", async () => {
      const { cofre, alice, bob, avancar } = fx;

      // A taxa da fixture (1 CSR/s) seca a reserva em 28 horas. Para simular um
      // ano inteiro, o ritmo tem que caber no ano: 2.000 CSR emitidos em 365
      // dias, sobre 2.000 CSR depositados, dao um APR de 100% — numero redondo
      // que deixa a diferenca entre APR e APY obvia na saida.
      await cofre.write.configurarTaxa([parseEther("2000") / BigInt(UM_ANO)]);

      // Duas posicoes iguais. Alice reinveste todo mes, Bob nunca.
      await cofre.write.depositar([parseEther("1000")], { account: alice.account });
      await cofre.write.depositar([parseEther("1000")], { account: bob.account });

      for (let mes = 0; mes < 12; mes++) {
        await avancar(UM_ANO / 12);
        await cofre.write.reinvestir({ account: alice.account });
      }

      const posicaoAlice = (await cofre.read.posicoes([alice.account.address]))[0];
      const posicaoBob = (await cofre.read.posicoes([bob.account.address]))[0];
      const pendenteBob = await cofre.read.pendente([bob.account.address]);

      const totalAlice = posicaoAlice;
      const totalBob = posicaoBob + pendenteBob;

      console.log(
        `\n      depois de 1 ano, partindo de 1.000 CSR cada:\n` +
          `        alice (reinvestiu todo mes): ${Number(formatEther(totalAlice)).toFixed(2)} CSR\n` +
          `        bob   (nao reinvestiu):      ${Number(formatEther(totalBob)).toFixed(2)} CSR\n`,
      );

      assert.ok(
        totalAlice > totalBob,
        "reinvestir tinha que render mais: e a diferenca entre APR e APY",
      );
    });
  });
});
