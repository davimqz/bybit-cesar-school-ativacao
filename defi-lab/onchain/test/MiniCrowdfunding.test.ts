import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

/**
 * Crowdfunding tudo-ou-nada.
 *
 * O teste que importa e o que tenta sacar sem bater a meta: ele falha, e e por
 * isso que a promessa vale. "Confie em mim" nao passa em teste; um `if` passa.
 */

const { viem } = await network.connect();

const SUPPLY = parseEther("10000000");
const FAUCET_AMOUNT = parseEther("1000");
const FAUCET_COOLDOWN = 60n;

const META = parseEther("1000");
const PRAZO = 600;

const ARRECADANDO = 0;
const META_BATIDA = 1;
const SACADA = 2;
const FALHOU = 3;

async function deployFixture() {
  const [professor, criador, ana, bruno] = await viem.getWalletClients();
  const test = await viem.getTestClient();

  const brlx = await viem.deployContract("ClassroomToken", [
    "CESAR Real",
    "BRLX",
    SUPPLY,
    FAUCET_AMOUNT,
    FAUCET_COOLDOWN,
    professor.account.address,
  ]);

  const crowd = await viem.deployContract("MiniCrowdfunding", [brlx.address]);

  for (const wallet of [criador, ana, bruno]) {
    await brlx.write.mint([wallet.account.address, parseEther("10000")]);
    await brlx.write.approve([crowd.address, SUPPLY], { account: wallet.account });
  }

  async function criarCampanha(prazo = PRAZO) {
    await crowd.write.criar(["Festa de formatura", META, BigInt(prazo)], {
      account: criador.account,
    });
    return 0n;
  }

  async function avancar(segundos: number) {
    await test.increaseTime({ seconds: segundos });
    await test.mine({ blocks: 1 });
  }

  return { professor, criador, ana, bruno, brlx, crowd, criarCampanha, avancar };
}

describe("MiniCrowdfunding — tudo ou nada", () => {
  let fx: Awaited<ReturnType<typeof deployFixture>>;

  beforeEach(async () => {
    fx = await deployFixture();
  });

  describe("Arrecadando", () => {
    it("a campanha nasce vazia, com meta e prazo publicos", async () => {
      const { crowd, criador, criarCampanha } = fx;

      const id = await criarCampanha();
      const c = await crowd.read.campanha([id]);

      assert.equal(c.arrecadado, 0n);
      assert.equal(c.meta, META);
      assert.equal(c.criador.toLowerCase(), criador.account.address.toLowerCase());
      assert.equal(c.sacada, false);
      assert.equal(await crowd.read.situacao([id]), ARRECADANDO);
    });

    it("contribuicoes somam, e quem contribui duas vezes conta como um apoiador", async () => {
      const { crowd, ana, bruno, criarCampanha } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("100")], { account: ana.account });
      await crowd.write.contribuir([id, parseEther("150")], { account: ana.account });
      await crowd.write.contribuir([id, parseEther("50")], { account: bruno.account });

      const c = await crowd.read.campanha([id]);
      assert.equal(c.arrecadado, parseEther("300"));
      assert.equal(c.apoiadores, 2n);
      assert.equal(
        await crowd.read.contribuicoes([id, ana.account.address]),
        parseEther("250"),
      );
    });

    it("o progresso e o que falta sao publicos a qualquer momento", async () => {
      const { crowd, ana, criarCampanha } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("250")], { account: ana.account });

      assert.equal(await crowd.read.progressoBps([id]), 2500n);
      assert.equal(await crowd.read.faltaParaMeta([id]), parseEther("750"));
    });

    it("passado o prazo, ninguem mais contribui", async () => {
      const { crowd, ana, criarCampanha, avancar } = fx;

      const id = await criarCampanha();
      await avancar(PRAZO + 1);

      await assert.rejects(
        crowd.write.contribuir([id, parseEther("100")], { account: ana.account }),
        "o prazo encerrou a arrecadacao",
      );
    });
  });

  describe("A garantia: o criador nao consegue sacar antes da meta", () => {
    it("com a meta em aberto, sacar reverte — e nao ha outro caminho", async () => {
      const { crowd, criador, ana, criarCampanha } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("999")], { account: ana.account });

      await assert.rejects(
        crowd.write.sacar([id], { account: criador.account }),
        "faltando 1 BRLX para a meta, o contrato tinha que recusar",
      );
    });

    it("nem depois do prazo o criador saca uma campanha que falhou", async () => {
      const { crowd, criador, ana, criarCampanha, avancar } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("500")], { account: ana.account });
      await avancar(PRAZO + 1);

      assert.equal(await crowd.read.situacao([id]), FALHOU);
      await assert.rejects(
        crowd.write.sacar([id], { account: criador.account }),
        "campanha falhada nao paga o criador nunca",
      );
    });

    it("so o criador saca, e so uma vez", async () => {
      const { crowd, criador, ana, criarCampanha } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, META], { account: ana.account });

      await assert.rejects(
        crowd.write.sacar([id], { account: ana.account }),
        "quem contribuiu nao saca a campanha",
      );

      await crowd.write.sacar([id], { account: criador.account });
      await assert.rejects(
        crowd.write.sacar([id], { account: criador.account }),
        "segundo saque tinha que reverter",
      );
    });
  });

  describe("Meta batida", () => {
    it("batida a meta, o criador recebe tudo de uma vez", async () => {
      const { crowd, brlx, criador, ana, bruno, criarCampanha } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("600")], { account: ana.account });
      await crowd.write.contribuir([id, parseEther("400")], { account: bruno.account });

      assert.equal(await crowd.read.situacao([id]), META_BATIDA);

      const antes = await brlx.read.balanceOf([criador.account.address]);
      await crowd.write.sacar([id], { account: criador.account });

      assert.equal((await brlx.read.balanceOf([criador.account.address])) - antes, META);
      assert.equal(await crowd.read.situacao([id]), SACADA);
      assert.equal(await brlx.read.balanceOf([crowd.address]), 0n);
    });

    it("quem contribuiu numa campanha bem-sucedida nao tem reembolso", async () => {
      const { crowd, ana, criarCampanha, avancar } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, META], { account: ana.account });
      await avancar(PRAZO + 1);

      await assert.rejects(
        crowd.write.reembolsar([id], { account: ana.account }),
        "meta batida: o dinheiro e do projeto, nao do apoiador",
      );
    });

    it("campanha sacada nao aceita mais contribuicao", async () => {
      const { crowd, criador, ana, bruno, criarCampanha } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, META], { account: ana.account });
      await crowd.write.sacar([id], { account: criador.account });

      await assert.rejects(
        crowd.write.contribuir([id, parseEther("10")], { account: bruno.account }),
        "campanha encerrada",
      );
    });
  });

  describe("Falhou: cada um busca o seu", () => {
    it("passado o prazo sem meta, cada contribuinte saca exatamente o que colocou", async () => {
      const { crowd, brlx, ana, bruno, criarCampanha, avancar } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("300")], { account: ana.account });
      await crowd.write.contribuir([id, parseEther("120")], { account: bruno.account });
      await avancar(PRAZO + 1);

      const anaAntes = await brlx.read.balanceOf([ana.account.address]);
      const brunoAntes = await brlx.read.balanceOf([bruno.account.address]);

      await crowd.write.reembolsar([id], { account: ana.account });
      await crowd.write.reembolsar([id], { account: bruno.account });

      assert.equal(
        (await brlx.read.balanceOf([ana.account.address])) - anaAntes,
        parseEther("300"),
      );
      assert.equal(
        (await brlx.read.balanceOf([bruno.account.address])) - brunoAntes,
        parseEther("120"),
      );
      assert.equal(await brlx.read.balanceOf([crowd.address]), 0n, "o contrato ficou zerado");
    });

    it("reembolso e pull: quem nao vem buscar continua com o dinheiro parado la", async () => {
      const { crowd, brlx, ana, bruno, criarCampanha, avancar } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("300")], { account: ana.account });
      await crowd.write.contribuir([id, parseEther("120")], { account: bruno.account });
      await avancar(PRAZO + 1);

      await crowd.write.reembolsar([id], { account: ana.account });

      // Ninguem devolveu nada para o bruno: o valor dele espera por ele.
      assert.equal(
        await brlx.read.balanceOf([crowd.address]),
        parseEther("120"),
        "o contrato ainda guarda a parte de quem nao sacou",
      );
      assert.equal(
        await crowd.read.contribuicoes([id, bruno.account.address]),
        parseEther("120"),
      );
    });

    it("ninguem se reembolsa duas vezes", async () => {
      const { crowd, ana, criarCampanha, avancar } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("300")], { account: ana.account });
      await avancar(PRAZO + 1);

      await crowd.write.reembolsar([id], { account: ana.account });
      await assert.rejects(
        crowd.write.reembolsar([id], { account: ana.account }),
        "a contribuicao foi zerada antes da transferencia",
      );
    });

    it("antes do prazo nao ha reembolso: a meta ainda pode ser batida", async () => {
      const { crowd, ana, criarCampanha } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("300")], { account: ana.account });

      await assert.rejects(
        crowd.write.reembolsar([id], { account: ana.account }),
        "desistir no meio derrubaria a campanha de quem ainda acredita",
      );
    });

    it("quem nao contribuiu nao tem o que sacar", async () => {
      const { crowd, ana, bruno, criarCampanha, avancar } = fx;

      const id = await criarCampanha();
      await crowd.write.contribuir([id, parseEther("300")], { account: ana.account });
      await avancar(PRAZO + 1);

      await assert.rejects(
        crowd.write.reembolsar([id], { account: bruno.account }),
        "bruno nao colocou nada",
      );
    });
  });
});
