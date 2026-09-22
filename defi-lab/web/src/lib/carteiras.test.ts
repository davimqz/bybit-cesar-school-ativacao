import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { carteirasDisponiveis, type CarteiraDisponivel } from "./carteiras.ts";

/**
 * Os cenários de navegador que a turma vai trazer para a sala.
 *
 * Roda sem navegador e sem build: `node --test --experimental-strip-types
 * "src/lib/*.test.ts"` a partir de `web/`.
 */

const c = (id: string, name: string): CarteiraDisponivel => ({
  id,
  name,
  uid: `uid:${id}`,
});

const GENERICO = c("injected", "Browser Wallet");
const METAMASK = c("io.metamask", "MetaMask");
const BRAVE = c("com.brave.wallet", "Brave Wallet");
const RABBY = c("io.rabby", "Rabby");

const nomes = (lista: CarteiraDisponivel[]) => lista.map((x) => x.name);

describe("qual carteira oferecer ao aluno", () => {
  it("MetaMask sozinha e moderna: um botão, o dela", () => {
    assert.deepEqual(nomes(carteirasDisponiveis([GENERICO, METAMASK])), [
      "MetaMask",
    ]);
  });

  it("carteira antiga que não anuncia por EIP-6963 ainda tem botão", () => {
    // Este é o aluno que a versão anterior deixava sem NADA para clicar.
    assert.deepEqual(nomes(carteirasDisponiveis([GENERICO])), [
      "Browser Wallet",
    ]);
  });

  it("Brave com carteira própria + MetaMask: as duas aparecem, MetaMask primeiro", () => {
    assert.deepEqual(nomes(carteirasDisponiveis([GENERICO, BRAVE, METAMASK])), [
      "MetaMask",
      "Brave Wallet",
    ]);
  });

  it("três carteiras instaladas: nenhuma some, MetaMask lidera", () => {
    const r = nomes(carteirasDisponiveis([GENERICO, BRAVE, RABBY, METAMASK]));
    assert.equal(r[0], "MetaMask");
    assert.equal(r.length, 3);
    for (const esperada of ["Brave Wallet", "Rabby"])
      assert.ok(r.includes(esperada));
  });

  it("o genérico nunca aparece junto com as descobertas", () => {
    const r = nomes(carteirasDisponiveis([GENERICO, METAMASK, BRAVE]));
    assert.ok(!r.includes("Browser Wallet"));
  });

  it("nomes repetidos não viram dois botões iguais", () => {
    const duplicada = {
      id: "io.metamask.flask",
      name: "MetaMask",
      uid: "uid:flask",
    };
    assert.equal(carteirasDisponiveis([METAMASK, duplicada]).length, 1);
  });

  it("navegador sem carteira nenhuma devolve lista vazia", () => {
    assert.deepEqual(carteirasDisponiveis([]), []);
  });

  it("a ordem em que o navegador anuncia não muda o resultado", () => {
    const a = nomes(carteirasDisponiveis([METAMASK, BRAVE, GENERICO]));
    const b = nomes(carteirasDisponiveis([BRAVE, GENERICO, METAMASK]));
    assert.deepEqual(a, b);
  });
});
