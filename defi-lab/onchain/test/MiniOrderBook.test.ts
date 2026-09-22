import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

/**
 * O livro de ordens, conceito por conceito.
 *
 * O ultimo bloco compara o livro com o AMM no mesmo volume: e o ponto
 * da aula que junta os dois labs. Vale projetar a saida.
 */

const { viem } = await network.connect();

const SUPPLY = parseEther("10000000");
const FAUCET_AMOUNT = parseEther("1000");
const FAUCET_COOLDOWN = 60n;

/** O enum `Lado` do contrato. */
const COMPRA = 0;
const VENDA = 1;

async function deployFixture() {
  const [professor, alice, bob, carol] = await viem.getWalletClients();

  const csr = await viem.deployContract("ClassroomToken", [
    "CESAR Coin",
    "CSR",
    SUPPLY,
    FAUCET_AMOUNT,
    FAUCET_COOLDOWN,
    professor.account.address,
  ]);

  const brlx = await viem.deployContract("ClassroomToken", [
    "CESAR Real",
    "BRLX",
    SUPPLY,
    FAUCET_AMOUNT,
    FAUCET_COOLDOWN,
    professor.account.address,
  ]);

  const livro = await viem.deployContract("MiniOrderBook", [csr.address, brlx.address]);

  // Pool com o mesmo preco medio do livro, para a comparacao do fim.
  const pool = await viem.deployContract("MiniAMM", [
    csr.address,
    brlx.address,
    "CESAR LP CSR/BRLX",
    "CLP",
  ]);

  for (const wallet of [professor, alice, bob, carol]) {
    const to = wallet.account.address;
    if (to !== professor.account.address) {
      await csr.write.mint([to, parseEther("100000")]);
      await brlx.write.mint([to, parseEther("100000")]);
    }
    for (const alvo of [livro.address, pool.address]) {
      await csr.write.approve([alvo, SUPPLY], { account: wallet.account });
      await brlx.write.approve([alvo, SUPPLY], { account: wallet.account });
    }
  }

  return { professor, alice, bob, carol, csr, brlx, livro, pool };
}

/** Preco em BRLX por CSR, escalado por 1e18 — como o contrato cota. */
function preco(brlxPorCsr: string): bigint {
  return parseEther(brlxPorCsr);
}

describe("MiniOrderBook — o livro de ordens da aula", () => {
  let fx: Awaited<ReturnType<typeof deployFixture>>;

  beforeEach(async () => {
    fx = await deployFixture();
  });

  describe("O preco nasce das pessoas", () => {
    it("livro vazio nao tem preco nenhum — ninguem ofereceu nada ainda", async () => {
      const { livro } = fx;

      const [bid] = await livro.read.melhorCompra();
      const [ask] = await livro.read.melhorVenda();

      assert.equal(bid, 0n);
      assert.equal(ask, 0n);
      assert.equal(await livro.read.spreadBps(), 0n);
    });

    it("o spread e a distancia entre o melhor comprador e o melhor vendedor", async () => {
      const { livro, alice, bob } = fx;

      await livro.write.colocar([COMPRA, preco("1.9"), parseEther("100")], { account: alice.account });
      await livro.write.colocar([VENDA, preco("2.1"), parseEther("100")], { account: bob.account });

      const [bid] = await livro.read.melhorCompra();
      const [ask] = await livro.read.melhorVenda();

      assert.equal(formatEther(bid), "1.9");
      assert.equal(formatEther(ask), "2.1");

      // (2,1 - 1,9) / 2,0 = 10% = 1000 bps
      assert.equal(await livro.read.spreadBps(), 1000n);
    });

    it("um livro so com compradores nao tem spread — tem esperanca", async () => {
      const { livro, alice } = fx;

      await livro.write.colocar([COMPRA, preco("1.9"), parseEther("100")], { account: alice.account });

      assert.equal(await livro.read.spreadBps(), 0n);
    });
  });

  describe("Custodia: nao existe ordem sem lastro", () => {
    it("quem vende deposita a mercadoria no ato de colocar a ordem", async () => {
      const { livro, csr, alice } = fx;

      const antes = await csr.read.balanceOf([alice.account.address]);
      await livro.write.colocar([VENDA, preco("2"), parseEther("500")], { account: alice.account });
      const depois = await csr.read.balanceOf([alice.account.address]);

      assert.equal(antes - depois, parseEther("500"));
      assert.equal(await csr.read.balanceOf([livro.address]), parseEther("500"));
    });

    it("quem compra deposita o dinheiro no ato de colocar a ordem", async () => {
      const { livro, brlx, alice } = fx;

      const antes = await brlx.read.balanceOf([alice.account.address]);
      await livro.write.colocar([COMPRA, preco("2"), parseEther("500")], { account: alice.account });
      const depois = await brlx.read.balanceOf([alice.account.address]);

      // 500 CSR a 2 BRLX = 1000 BRLX travados.
      assert.equal(antes - depois, parseEther("1000"));
      assert.equal(await brlx.read.balanceOf([livro.address]), parseEther("1000"));
    });

    it("cancelar devolve exatamente o que estava em custodia", async () => {
      const { livro, brlx, alice } = fx;

      const antes = await brlx.read.balanceOf([alice.account.address]);
      const id = await livro.write.colocar([COMPRA, preco("2"), parseEther("500")], {
        account: alice.account,
      });
      assert.ok(id);

      await livro.write.cancelar([0n], { account: alice.account });

      assert.equal(await brlx.read.balanceOf([alice.account.address]), antes);
      assert.equal(await brlx.read.balanceOf([livro.address]), 0n);
      assert.equal(await livro.read.ordensVivas(), 0n);
    });

    it("ninguem cancela a ordem de outra pessoa", async () => {
      const { livro, alice, bob } = fx;

      await livro.write.colocar([VENDA, preco("2"), parseEther("100")], { account: alice.account });

      await assert.rejects(
        livro.write.cancelar([0n], { account: bob.account }),
        "o contrato tinha que recusar: a ordem nao e do bob",
      );
    });
  });

  describe("Executar contra o livro", () => {
    it("o taker escolhe a contraparte e paga o preco que estava na tela", async () => {
      const { livro, csr, brlx, alice, bob } = fx;

      await livro.write.colocar([VENDA, preco("2"), parseEther("100")], { account: alice.account });

      const csrAntes = await csr.read.balanceOf([bob.account.address]);
      const brlxAntes = await brlx.read.balanceOf([bob.account.address]);

      await livro.write.executar([0n, parseEther("100")], { account: bob.account });

      assert.equal((await csr.read.balanceOf([bob.account.address])) - csrAntes, parseEther("100"));
      assert.equal(brlxAntes - (await brlx.read.balanceOf([bob.account.address])), parseEther("200"));
    });

    it("o maker recebe o preco que pediu — quem paga o estrago e o taker", async () => {
      const { livro, brlx, alice, bob } = fx;

      await livro.write.colocar([VENDA, preco("2"), parseEther("100")], { account: alice.account });

      const antes = await brlx.read.balanceOf([alice.account.address]);
      await livro.write.executar([0n, parseEther("100")], { account: bob.account });

      // Exatamente 100 x 2. Nenhum desconto, nenhuma curva no caminho.
      assert.equal((await brlx.read.balanceOf([alice.account.address])) - antes, parseEther("200"));
    });

    it("execucao parcial deixa a ordem viva com o resto", async () => {
      const { livro, alice, bob } = fx;

      await livro.write.colocar([VENDA, preco("2"), parseEther("100")], { account: alice.account });
      await livro.write.executar([0n, parseEther("30")], { account: bob.account });

      const o = await livro.read.ordem([0n]);
      assert.equal(o.viva, true);
      assert.equal(o.quantidade, parseEther("70"));
      assert.equal(await livro.read.ordensVivas(), 1n);
    });

    it("prioridade preco-tempo: empatou o preco, executa quem chegou antes", async () => {
      const { livro, alice, bob, carol } = fx;

      // Mesmo preco, ordens diferentes. Alice chegou primeiro.
      await livro.write.colocar([VENDA, preco("2"), parseEther("50")], { account: alice.account });
      await livro.write.colocar([VENDA, preco("2"), parseEther("50")], { account: bob.account });

      await livro.write.comprarAMercado([parseEther("50"), parseEther("1000")], {
        account: carol.account,
      });

      assert.equal((await livro.read.ordem([0n])).viva, false, "a ordem da alice tinha que sair primeiro");
      assert.equal((await livro.read.ordem([1n])).viva, true, "a do bob tinha que continuar de pe");
    });

    it("auto-negociacao e bloqueada: trocar com voce mesmo nao e mercado", async () => {
      const { livro, alice } = fx;

      await livro.write.colocar([VENDA, preco("2"), parseEther("100")], { account: alice.account });

      await assert.rejects(
        livro.write.executar([0n, parseEther("100")], { account: alice.account }),
        "o contrato tinha que recusar a auto-negociacao",
      );
    });
  });

  describe("Atravessar o livro", () => {
    /** Tres niveis de venda: 2,00 / 2,10 / 2,30, 100 CSR em cada. */
    async function livroComTresNiveis() {
      const { livro, alice, bob, carol } = fx;
      await livro.write.colocar([VENDA, preco("2"), parseEther("100")], { account: alice.account });
      await livro.write.colocar([VENDA, preco("2.1"), parseEther("100")], { account: bob.account });
      await livro.write.colocar([VENDA, preco("2.3"), parseEther("100")], { account: carol.account });
    }

    it("ordem pequena executa no topo do livro, sem slippage nenhum", async () => {
      const { livro } = fx;
      await livroComTresNiveis();

      const [, , precoMedio, slippageBps] = await livro.read.simularCompra([parseEther("50")]);

      assert.equal(formatEther(precoMedio), "2");
      assert.equal(slippageBps, 0n, "cabendo no primeiro nivel, nao ha o que escorregar");
    });

    it("ordem grande come os niveis de cima e o preco medio piora", async () => {
      const { livro } = fx;
      await livroComTresNiveis();

      const [custoTotal, preenchido, precoMedio, slippageBps] = await livro.read.simularCompra([
        parseEther("250"),
      ]);

      // 100 a 2,00 + 100 a 2,10 + 50 a 2,30 = 525 BRLX por 250 CSR = 2,10 medio
      assert.equal(formatEther(custoTotal), "525");
      assert.equal(formatEther(preenchido), "250");
      assert.equal(formatEther(precoMedio), "2.1");
      assert.equal(slippageBps, 500n, "2,10 contra 2,00 no topo = 5% = 500 bps");
    });

    it("o livro pode nao ter profundidade: preenche o que da e para", async () => {
      const { livro, professor } = fx;
      await livroComTresNiveis();

      const [, preenchido] = await livro.read.simularCompra([parseEther("1000")]);
      assert.equal(formatEther(preenchido), "300", "so existem 300 CSR ofertados");

      await livro.write.comprarAMercado([parseEther("1000"), parseEther("100000")], {
        account: professor.account,
      });

      assert.equal(await livro.read.ordensVivas(), 0n, "a travessia limpou o livro");
    });

    it("o teto de custo protege o taker: travessia caro demais reverte", async () => {
      const { livro, professor } = fx;
      await livroComTresNiveis();

      // Sabemos que 250 CSR custam 525 BRLX. Exigir no maximo 500 tem que falhar.
      await assert.rejects(
        livro.write.comprarAMercado([parseEther("250"), parseEther("500")], {
          account: professor.account,
        }),
        "a ordem tinha que reverter: a travessia passou do teto",
      );

      assert.equal(await livro.read.ordensVivas(), 3n, "e o livro continua intacto");
    });

    it("vender a mercado desce pelos bids, do melhor para o pior", async () => {
      const { livro, alice, bob, professor } = fx;

      await livro.write.colocar([COMPRA, preco("2"), parseEther("100")], { account: alice.account });
      await livro.write.colocar([COMPRA, preco("1.8"), parseEther("100")], { account: bob.account });

      const [recebido, preenchido, precoMedio] = await livro.read.simularVenda([parseEther("200")]);

      assert.equal(formatEther(recebido), "380", "100 a 2,00 + 100 a 1,80");
      assert.equal(formatEther(preenchido), "200");
      assert.equal(formatEther(precoMedio), "1.9");

      await livro.write.venderAMercado([parseEther("200"), parseEther("380")], {
        account: professor.account,
      });
      assert.equal(await livro.read.ordensVivas(), 0n);
    });
  });

  describe("Livro contra AMM — o mesmo trade, nos dois mercados", () => {
    it("o livro nao tem curva: o preco anda em degraus, e cada degrau tem dono", async () => {
      const { livro, pool, csr, alice, bob, carol, professor } = fx;

      // Pool com 1.000 CSR / 2.000 BRLX: preco de vitrine 2,00.
      await pool.write.addLiquidity([parseEther("1000"), parseEther("2000"), 0n, 0n], {
        account: professor.account,
      });

      // Livro com a MESMA oferta total no mesmo preco de topo.
      await livro.write.colocar([COMPRA, preco("2"), parseEther("100")], { account: alice.account });
      await livro.write.colocar([COMPRA, preco("1.95"), parseEther("100")], { account: bob.account });
      await livro.write.colocar([COMPRA, preco("1.9"), parseEther("100")], { account: carol.account });

      const VOLUME = parseEther("200");

      const [recebidoLivro, , , slippageLivro] = await livro.read.simularVenda([VOLUME]);
      const [recebidoPool, , slippagePool] = await pool.read.previewSwap([csr.address, VOLUME]);

      console.log(
        `\n      vender ${formatEther(VOLUME)} CSR:\n` +
          `        livro -> ${formatEther(recebidoLivro)} BRLX, slippage ${Number(slippageLivro) / 100}%\n` +
          `        pool  -> ${formatEther(recebidoPool)} BRLX, slippage ${Number(slippagePool) / 100}%\n`,
      );

      // No livro o resultado e a soma de ordens humanas; no pool, uma formula.
      // Os dois cobram do taker por atravessar — por caminhos diferentes.
      assert.ok(slippageLivro > 0n, "atravessar dois niveis do livro tem custo");
      assert.ok(slippagePool > 0n, "escorregar pela curva tambem tem custo");
      assert.ok(
        recebidoLivro > 0n && recebidoPool > 0n,
        "os dois mercados entregam — a diferenca esta em quem forma o preco",
      );
    });

    it("no livro a ordem some do livro; no pool a liquidez continua la", async () => {
      const { livro, pool, csr, alice, professor } = fx;

      await pool.write.addLiquidity([parseEther("1000"), parseEther("2000"), 0n, 0n], {
        account: professor.account,
      });
      await livro.write.colocar([COMPRA, preco("2"), parseEther("100")], { account: alice.account });

      await livro.write.venderAMercado([parseEther("100"), 0n], { account: professor.account });
      await pool.write.swap([csr.address, parseEther("100"), 0n], { account: professor.account });

      assert.equal(await livro.read.ordensVivas(), 0n, "o livro esvaziou: a contraparte era uma pessoa");

      const [r0] = await pool.read.getReserves();
      assert.ok(r0 > 0n, "o pool segue cotando preco, sem ninguem do outro lado");
    });
  });
});
