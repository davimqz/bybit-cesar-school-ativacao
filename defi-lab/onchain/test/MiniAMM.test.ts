import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, formatEther } from "viem";

/**
 * Cada teste aqui corresponde a um conceito da Aula 3 (DeFi).
 * Rode com `npm test` e projete a saida: a turma ve a matematica
 * do slide sendo verificada, nao apenas afirmada.
 */

const { viem } = await network.connect();

const SUPPLY = parseEther("10000000");
const FAUCET_AMOUNT = parseEther("1000");
const FAUCET_COOLDOWN = 60n;

async function deployFixture() {
  const [professor, alice, bob] = await viem.getWalletClients();

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

  const pool = await viem.deployContract("MiniAMM", [
    csr.address,
    brlx.address,
    "CESAR LP CSR/BRLX",
    "CLP",
  ]);

  // Todo mundo comeca com estoque e aprovacao — a aula nao para para
  // explicar `approve` em cada teste.
  for (const wallet of [professor, alice, bob]) {
    const to = wallet.account.address;
    if (to !== professor.account.address) {
      await csr.write.mint([to, parseEther("100000")]);
      await brlx.write.mint([to, parseEther("100000")]);
    }
    await csr.write.approve([pool.address, SUPPLY], { account: wallet.account });
    await brlx.write.approve([pool.address, SUPPLY], { account: wallet.account });
  }

  return { professor, alice, bob, csr, brlx, pool };
}

/** Valor de uma cesta (csr, brlx) medida em BRLX, ao preco spot informado. */
function valueInBrlx(amountCsr: bigint, amountBrlx: bigint, spotPrice1e18: bigint): bigint {
  return (amountCsr * spotPrice1e18) / 10n ** 18n + amountBrlx;
}

describe("MiniAMM — o pool de liquidez da aula", () => {
  let fx: Awaited<ReturnType<typeof deployFixture>>;

  beforeEach(async () => {
    fx = await deployFixture();
  });

  describe("x * y = k", () => {
    it("o primeiro LP define o preco inicial do pool do nada", async () => {
      const { pool, alice } = fx;

      // 2000 BRLX para 1000 CSR => o pool passa a dizer que 1 CSR vale 2 BRLX.
      await pool.write.addLiquidity(
        [parseEther("1000"), parseEther("2000"), 0n, 0n],
        { account: alice.account },
      );

      const spot = await pool.read.spotPrice0In1();
      assert.equal(formatEther(spot), "2");
    });

    it("k nunca diminui num swap — ele cresce, e o que cresce e a taxa", async () => {
      const { pool, csr, alice, bob } = fx;

      await pool.write.addLiquidity(
        [parseEther("1000"), parseEther("1000"), 0n, 0n],
        { account: alice.account },
      );
      const kAntes = await pool.read.invariant();

      await pool.write.swap([csr.address, parseEther("100"), 0n], { account: bob.account });
      const kDepois = await pool.read.invariant();

      assert.ok(kDepois > kAntes, "k deveria crescer: os 0,3% ficam dentro do pool");
    });

    it("quem compra empurra o preco contra si mesmo", async () => {
      const { pool, csr, alice, bob } = fx;

      await pool.write.addLiquidity(
        [parseEther("1000"), parseEther("1000"), 0n, 0n],
        { account: alice.account },
      );

      const precoAntes = await pool.read.spotPrice0In1();
      await pool.write.swap([csr.address, parseEther("200"), 0n], { account: bob.account });
      const precoDepois = await pool.read.spotPrice0In1();

      // Bob vendeu CSR ao pool: sobra CSR, falta BRLX, CSR fica mais barato.
      assert.ok(precoDepois < precoAntes, "vender CSR no pool tem que baratear CSR");
    });
  });

  describe("Slippage", () => {
    it("ordem grande executa a um preco medio pior que a pequena", async () => {
      const { pool, csr, alice } = fx;

      await pool.write.addLiquidity(
        [parseEther("10000"), parseEther("10000"), 0n, 0n],
        { account: alice.account },
      );

      const [, , slippagePequena] = await pool.read.previewSwap([csr.address, parseEther("10")]);
      const [, , slippageGrande] = await pool.read.previewSwap([csr.address, parseEther("3000")]);

      assert.ok(
        slippageGrande > slippagePequena * 50n,
        `slippage deveria explodir com o tamanho da ordem (${slippagePequena} bps -> ${slippageGrande} bps)`,
      );
    });

    it("o MESMO swap sofre muito mais slippage num pool raso", async () => {
      const { csr, brlx, alice } = fx;

      const poolFundo = await viem.deployContract("MiniAMM", [
        csr.address, brlx.address, "LP Fundo", "CLPF",
      ]);
      const poolRaso = await viem.deployContract("MiniAMM", [
        csr.address, brlx.address, "LP Raso", "CLPR",
      ]);

      for (const p of [poolFundo, poolRaso]) {
        await csr.write.approve([p.address, SUPPLY], { account: alice.account });
        await brlx.write.approve([p.address, SUPPLY], { account: alice.account });
      }

      await poolFundo.write.addLiquidity(
        [parseEther("50000"), parseEther("50000"), 0n, 0n], { account: alice.account },
      );
      await poolRaso.write.addLiquidity(
        [parseEther("500"), parseEther("500"), 0n, 0n], { account: alice.account },
      );

      const [, , slipFundo] = await poolFundo.read.previewSwap([csr.address, parseEther("100")]);
      const [, , slipRaso] = await poolRaso.read.previewSwap([csr.address, parseEther("100")]);

      assert.ok(
        slipRaso > slipFundo * 10n,
        `pool raso deveria doer muito mais (fundo ${slipFundo} bps, raso ${slipRaso} bps)`,
      );
    });

    it("minAmountOut protege o trader: se o preco andar, a tx reverte", async () => {
      const { pool, csr, alice, bob } = fx;

      await pool.write.addLiquidity(
        [parseEther("1000"), parseEther("1000"), 0n, 0n], { account: alice.account },
      );

      const [esperado] = await pool.read.previewSwap([csr.address, parseEther("100")]);

      // Alguem entra na frente e move o preco (front-running, na pratica).
      await pool.write.swap([csr.address, parseEther("300"), 0n], { account: alice.account });

      await assert.rejects(
        pool.write.swap([csr.address, parseEther("100"), esperado], { account: bob.account }),
        "o swap tinha que reverter: o trader exigiu o preco antigo",
      );
    });
  });

  describe("Ser LP", () => {
    it("as taxas da turma engordam a posicao do LP", async () => {
      const { pool, csr, brlx, alice, bob } = fx;

      await pool.write.addLiquidity(
        [parseEther("10000"), parseEther("10000"), 0n, 0n], { account: alice.account },
      );

      const [csr0, brlx0] = await pool.read.positionValue([alice.account.address]);

      // A turma negocia: vai e volta, sem mudar muito o preco final.
      for (let i = 0; i < 10; i++) {
        await pool.write.swap([csr.address, parseEther("100"), 0n], { account: bob.account });
        await pool.write.swap([brlx.address, parseEther("100"), 0n], { account: bob.account });
      }

      const [csr1, brlx1] = await pool.read.positionValue([alice.account.address]);

      assert.ok(
        csr1 + brlx1 > csr0 + brlx0,
        "depois de 20 swaps a posicao do LP tem que valer mais: as taxas ficaram no pool",
      );
    });

    it("impermanent loss: com o preco divergindo, o LP perde para quem so guardou", async () => {
      const { pool, csr, alice, bob } = fx;

      const aporteCsr = parseEther("10000");
      const aporteBrlx = parseEther("10000");
      await pool.write.addLiquidity([aporteCsr, aporteBrlx, 0n, 0n], { account: alice.account });

      // Whale swap: o preco diverge de verdade (o botao do painel do professor).
      await pool.write.swap([csr.address, parseEther("10000"), 0n], { account: bob.account });

      const spot = await pool.read.spotPrice0In1();
      const [csrLp, brlxLp] = await pool.read.positionValue([alice.account.address]);

      const valorLp = valueInBrlx(csrLp, brlxLp, spot);
      const valorHold = valueInBrlx(aporteCsr, aporteBrlx, spot);

      assert.ok(
        valorLp < valorHold,
        `IL nao apareceu: LP ${formatEther(valorLp)} vs hold ${formatEther(valorHold)}`,
      );
    });

    it("sair do pool devolve a fatia proporcional das reservas", async () => {
      const { pool, alice } = fx;

      await pool.write.addLiquidity(
        [parseEther("1000"), parseEther("1000"), 0n, 0n], { account: alice.account },
      );

      const shares = await pool.read.balanceOf([alice.account.address]);
      const [esperado0, esperado1] = await pool.read.positionValue([alice.account.address]);

      await pool.write.removeLiquidity([shares, esperado0, esperado1], { account: alice.account });

      assert.equal(await pool.read.balanceOf([alice.account.address]), 0n);
    });

    it("o pool exige o aporte na proporcao atual — o excedente nao entra", async () => {
      const { pool, alice, bob } = fx;

      // Pool a 1 CSR = 2 BRLX.
      await pool.write.addLiquidity(
        [parseEther("1000"), parseEther("2000"), 0n, 0n], { account: alice.account },
      );

      // Bob tenta entrar 1:1. O pool so aceita 100 CSR + 200 BRLX.
      const { result } = await pool.simulate.addLiquidity(
        [parseEther("100"), parseEther("1000"), 0n, 0n],
        { account: bob.account },
      );

      assert.equal(formatEther(result[0]), "100");
      assert.equal(formatEther(result[1]), "200");
    });
  });
});
