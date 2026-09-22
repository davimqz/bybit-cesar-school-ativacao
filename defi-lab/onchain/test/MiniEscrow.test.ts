import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

/**
 * Escrow: a maquina de estados e o risco de oraculo.
 *
 * O ultimo bloco e o que a aula usa: o arbitro decide contra a evidencia e o
 * contrato obedece. Nenhum teste aqui "falha" — o codigo funciona perfeitamente
 * em todos eles. E esse o desconforto.
 */

const { viem } = await network.connect();

const SUPPLY = parseEther("10000000");
const FAUCET_AMOUNT = parseEther("1000");
const FAUCET_COOLDOWN = 60n;

const VALOR = parseEther("500");
const PRAZO = 600; // 10 min para o vendedor marcar envio
const JANELA_REVISAO = 300; // constante do contrato

/** Os estados, na ordem do enum. */
const FINANCIADO = 0;
const ENVIADO = 1;
const CONCLUIDO = 2;
const REEMBOLSADO = 3;
const EM_DISPUTA = 4;

async function deployFixture() {
  const [professor, comprador, vendedor, estranho] = await viem.getWalletClients();
  const test = await viem.getTestClient();

  const brlx = await viem.deployContract("ClassroomToken", [
    "CESAR Real",
    "BRLX",
    SUPPLY,
    FAUCET_AMOUNT,
    FAUCET_COOLDOWN,
    professor.account.address,
  ]);

  const escrow = await viem.deployContract("MiniEscrow", [brlx.address]);

  for (const wallet of [comprador, vendedor, estranho]) {
    await brlx.write.mint([wallet.account.address, parseEther("10000")]);
    await brlx.write.approve([escrow.address, SUPPLY], { account: wallet.account });
  }

  /** O professor e o arbitro da aula. */
  async function criarAcordo() {
    await escrow.write.criar(
      [vendedor.account.address, professor.account.address, VALOR, BigInt(PRAZO), "Caneca da CESAR"],
      { account: comprador.account },
    );
    return 0n;
  }

  async function avancar(segundos: number) {
    await test.increaseTime({ seconds: segundos });
    await test.mine({ blocks: 1 });
  }

  return { professor, comprador, vendedor, estranho, brlx, escrow, criarAcordo, avancar };
}

describe("MiniEscrow — custodia condicional e risco de oraculo", () => {
  let fx: Awaited<ReturnType<typeof deployFixture>>;

  beforeEach(async () => {
    fx = await deployFixture();
  });

  describe("O dinheiro sai da carteira na hora", () => {
    it("criar o acordo ja trava o valor no contrato", async () => {
      const { escrow, brlx, comprador, criarAcordo } = fx;

      const antes = await brlx.read.balanceOf([comprador.account.address]);
      await criarAcordo();

      assert.equal(antes - (await brlx.read.balanceOf([comprador.account.address])), VALOR);
      assert.equal(await brlx.read.balanceOf([escrow.address]), VALOR);
      assert.equal(await escrow.read.emCustodia(), VALOR);
    });

    it("o acordo nasce financiado, com as tres partes registradas", async () => {
      const { escrow, professor, comprador, vendedor, criarAcordo } = fx;

      const id = await criarAcordo();
      const a = await escrow.read.acordo([id]);

      assert.equal(a.estado, FINANCIADO);
      assert.equal(a.comprador.toLowerCase(), comprador.account.address.toLowerCase());
      assert.equal(a.vendedor.toLowerCase(), vendedor.account.address.toLowerCase());
      assert.equal(a.arbitro.toLowerCase(), professor.account.address.toLowerCase());
      assert.equal(a.valor, VALOR);
    });

    it("arbitro nao pode ser parte interessada — o contrato recusa o caso obvio", async () => {
      const { escrow, comprador, vendedor } = fx;

      await assert.rejects(
        escrow.write.criar(
          [vendedor.account.address, vendedor.account.address, VALOR, BigInt(PRAZO), "x"],
          { account: comprador.account },
        ),
        "arbitro igual ao vendedor tinha que ser recusado",
      );

      await assert.rejects(
        escrow.write.criar(
          [comprador.account.address, comprador.account.address, VALOR, BigInt(PRAZO), "x"],
          { account: comprador.account },
        ),
        "comprador nao pode ser o proprio vendedor",
      );
    });
  });

  describe("Caminho feliz: ninguem precisa de arbitro", () => {
    it("vendedor marca envio, comprador libera, vendedor recebe", async () => {
      const { escrow, brlx, comprador, vendedor, criarAcordo } = fx;

      const id = await criarAcordo();
      await escrow.write.marcarEnviado([id], { account: vendedor.account });
      assert.equal((await escrow.read.acordo([id])).estado, ENVIADO);

      const antes = await brlx.read.balanceOf([vendedor.account.address]);
      await escrow.write.liberar([id], { account: comprador.account });

      assert.equal((await brlx.read.balanceOf([vendedor.account.address])) - antes, VALOR);
      assert.equal((await escrow.read.acordo([id])).estado, CONCLUIDO);
      assert.equal(await escrow.read.emCustodia(), 0n);
    });

    it("o comprador pode liberar antes mesmo do envio ser marcado", async () => {
      const { escrow, comprador, criarAcordo } = fx;

      const id = await criarAcordo();
      await escrow.write.liberar([id], { account: comprador.account });

      assert.equal((await escrow.read.acordo([id])).estado, CONCLUIDO);
    });

    it("so o comprador libera — nem o vendedor nem um estranho", async () => {
      const { escrow, vendedor, estranho, criarAcordo } = fx;

      const id = await criarAcordo();

      await assert.rejects(escrow.write.liberar([id], { account: vendedor.account }));
      await assert.rejects(escrow.write.liberar([id], { account: estranho.account }));
    });

    it("um acordo concluido nao paga duas vezes", async () => {
      const { escrow, comprador, criarAcordo } = fx;

      const id = await criarAcordo();
      await escrow.write.liberar([id], { account: comprador.account });

      await assert.rejects(
        escrow.write.liberar([id], { account: comprador.account }),
        "o estado final tinha que bloquear o segundo pagamento",
      );
    });
  });

  describe("Os prazos: o relogio decide quando ninguem decide", () => {
    it("vendedor sumiu: passado o prazo, o comprador recupera o dinheiro", async () => {
      const { escrow, brlx, comprador, criarAcordo, avancar } = fx;

      const id = await criarAcordo();
      const antes = await brlx.read.balanceOf([comprador.account.address]);

      await avancar(PRAZO + 1);
      await escrow.write.cancelarPorPrazo([id], { account: comprador.account });

      assert.equal((await brlx.read.balanceOf([comprador.account.address])) - antes, VALOR);
      assert.equal((await escrow.read.acordo([id])).estado, REEMBOLSADO);
    });

    it("antes do prazo o comprador nao cancela — senao o vendedor nunca teria seguranca", async () => {
      const { escrow, comprador, criarAcordo } = fx;

      const id = await criarAcordo();

      await assert.rejects(
        escrow.write.cancelarPorPrazo([id], { account: comprador.account }),
        "o prazo ainda nao venceu",
      );
    });

    it("comprador sumiu depois do envio: o vendedor cobra pelo silencio", async () => {
      const { escrow, brlx, vendedor, estranho, criarAcordo, avancar } = fx;

      const id = await criarAcordo();
      await escrow.write.marcarEnviado([id], { account: vendedor.account });

      const antes = await brlx.read.balanceOf([vendedor.account.address]);
      await avancar(JANELA_REVISAO + 1);

      // Qualquer um pode chamar: e so o relogio, nao um favor.
      await escrow.write.liberarPorPrazo([id], { account: estranho.account });

      assert.equal((await brlx.read.balanceOf([vendedor.account.address])) - antes, VALOR);
      assert.equal((await escrow.read.acordo([id])).estado, CONCLUIDO);
    });

    it("dentro da janela de revisao, o silencio ainda nao paga ninguem", async () => {
      const { escrow, vendedor, criarAcordo, avancar } = fx;

      const id = await criarAcordo();
      await escrow.write.marcarEnviado([id], { account: vendedor.account });
      await avancar(JANELA_REVISAO - 60);

      await assert.rejects(
        escrow.write.liberarPorPrazo([id], { account: vendedor.account }),
        "a janela do comprador ainda esta aberta",
      );
    });

    it("so o vendedor marca envio", async () => {
      const { escrow, comprador, estranho, criarAcordo } = fx;

      const id = await criarAcordo();

      await assert.rejects(escrow.write.marcarEnviado([id], { account: comprador.account }));
      await assert.rejects(escrow.write.marcarEnviado([id], { account: estranho.account }));
    });
  });

  describe("Risco de oraculo: o contrato obedece, nao julga", () => {
    it("disputa aberta congela o acordo — nem prazo resolve mais", async () => {
      const { escrow, comprador, vendedor, criarAcordo, avancar } = fx;

      const id = await criarAcordo();
      await escrow.write.marcarEnviado([id], { account: vendedor.account });
      await escrow.write.abrirDisputa([id], { account: comprador.account });

      assert.equal((await escrow.read.acordo([id])).estado, EM_DISPUTA);

      await avancar(JANELA_REVISAO * 10);
      await assert.rejects(
        escrow.write.liberarPorPrazo([id], { account: vendedor.account }),
        "em disputa, o relogio para de mandar",
      );
      await assert.rejects(
        escrow.write.liberar([id], { account: comprador.account }),
        "nem o comprador libera sozinho depois de disputar",
      );
    });

    it("os dois lados podem abrir disputa; um estranho nao", async () => {
      const { escrow, comprador, vendedor, estranho, criarAcordo } = fx;

      const id = await criarAcordo();
      await assert.rejects(escrow.write.abrirDisputa([id], { account: estranho.account }));

      await escrow.write.abrirDisputa([id], { account: vendedor.account });
      assert.equal((await escrow.read.acordo([id])).estado, EM_DISPUTA);
    });

    it("so o arbitro resolve — nem as partes, nem quem passava por ali", async () => {
      const { escrow, comprador, vendedor, estranho, criarAcordo } = fx;

      const id = await criarAcordo();
      await escrow.write.abrirDisputa([id], { account: comprador.account });

      await assert.rejects(escrow.write.resolver([id, true], { account: comprador.account }));
      await assert.rejects(escrow.write.resolver([id, false], { account: vendedor.account }));
      await assert.rejects(escrow.write.resolver([id, true], { account: estranho.account }));
    });

    it("O PONTO DA AULA: o arbitro decide contra o comprador e o contrato paga o vendedor", async () => {
      const { escrow, brlx, professor, comprador, vendedor, criarAcordo } = fx;

      const id = await criarAcordo();

      // O comprador abre disputa porque nada chegou. O vendedor nem marcou envio.
      await escrow.write.abrirDisputa([id], { account: comprador.account });

      const compradorAntes = await brlx.read.balanceOf([comprador.account.address]);
      const vendedorAntes = await brlx.read.balanceOf([vendedor.account.address]);

      // O arbitro resolve pelo vendedor. Nenhuma prova foi apresentada ao
      // contrato — nem poderia ser.
      await escrow.write.resolver([id, true], { account: professor.account });

      assert.equal(
        await brlx.read.balanceOf([comprador.account.address]),
        compradorAntes,
        "o comprador nao recebeu nada de volta",
      );
      assert.equal(
        (await brlx.read.balanceOf([vendedor.account.address])) - vendedorAntes,
        VALOR,
        "o dinheiro foi para o vendedor, por decisao humana",
      );
      assert.equal((await escrow.read.acordo([id])).estado, CONCLUIDO);

      console.log(
        "\n      O contrato executou a regra exatamente como escrita.\n" +
          "      O comprador perdeu 500 BRLX e nao ha recurso: o arbitro era,\n" +
          "      desde a criacao do acordo, quem decidia. Estava no codigo.\n",
      );
    });

    it("e o mesmo poder resolve para o outro lado, com a mesma facilidade", async () => {
      const { escrow, brlx, professor, comprador, vendedor, criarAcordo } = fx;

      const id = await criarAcordo();
      await escrow.write.marcarEnviado([id], { account: vendedor.account });
      await escrow.write.abrirDisputa([id], { account: vendedor.account });

      const antes = await brlx.read.balanceOf([comprador.account.address]);
      await escrow.write.resolver([id, false], { account: professor.account });

      assert.equal((await brlx.read.balanceOf([comprador.account.address])) - antes, VALOR);
      assert.equal((await escrow.read.acordo([id])).estado, REEMBOLSADO);
    });
  });

  describe("Leitura para a tela", () => {
    it("cada parte encontra os acordos dela", async () => {
      const { escrow, professor, comprador, vendedor, estranho, criarAcordo } = fx;

      await criarAcordo();

      for (const quem of [comprador, vendedor, professor]) {
        const ids = await escrow.read.acordosDe([quem.account.address]);
        assert.equal(ids.length, 1, "comprador, vendedor e arbitro veem o acordo");
      }

      assert.equal(
        (await escrow.read.acordosDe([estranho.account.address])).length,
        0,
        "quem nao e parte nao ve nada",
      );
    });

    it("venceEm aponta o prazo que vale no estado atual", async () => {
      const { escrow, vendedor, criarAcordo } = fx;

      const id = await criarAcordo();
      const a = await escrow.read.acordo([id]);
      assert.equal(await escrow.read.venceEm([id]), a.prazoEnvio);

      await escrow.write.marcarEnviado([id], { account: vendedor.account });
      const b = await escrow.read.acordo([id]);
      assert.equal(await escrow.read.venceEm([id]), b.momentoEnvio + BigInt(JANELA_REVISAO));
    });
  });
});
