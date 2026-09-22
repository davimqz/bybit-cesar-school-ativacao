# Checklist do professor

Contado de trás para frente a partir do dia da aula (D-0).

## D-7 — comece a juntar ETH de Sepolia

O recurso mais escasso da operação. Comece cedo e use mais de uma fonte, todo dia.

Orçamento: `0,02 ETH × nº de alunos + 0,3 ETH de reserva no faucet + ~0,2 ETH
para o deploy`. Para 40 alunos, mire em **~1,5 ETH**.

Faucets que costumam funcionar (mudam com frequência — teste antes de depender):
Google Cloud Web3 faucet, Alchemy, QuickNode, pk910 PoW faucet.

- [ ] Carteira **nova**, exclusiva da aula, criada
- [ ] Chave privada em `onchain/.env` (e `.env` no `.gitignore` — já está)
- [ ] Saldo acumulando diariamente

## D-4 — mande o guia para a turma

- [ ] `docs/guia-pre-aula-alunos.md` enviado
- [ ] Formulário de coleta de endereços aberto
- [ ] Prazo definido (quarta à noite, para sobrar tempo de abastecer)

## D-2 — publique na Sepolia

```bash
cd onchain
npm test                       # a suíte tem que passar inteira
npm run deploy:sepolia
```

- [ ] Contratos publicados (são **nove**: CSR, BRLX, GasFaucet, dois pools, o livro,
      o cofre, o escrow e o crowdfunding)
- [ ] `npx hardhat verify` rodado em **todos** eles — os alunos vão ler o código
- [ ] Livro de ordens semeado — o deploy faz sozinho; confirme em `/trade` que o
      spread aparece e que existem seis ordens vivas
- [ ] Reserva do cofre de staking abastecida — o deploy coloca 50.000 CSR;
      confirme em `/staking` que "dura mais" passa da duração da aula
- [ ] Escrow: o lab não precisa de semeadura, mas **você é o árbitro de todos os
      acordos**. Deixe `/professor` aberto na seção de disputas durante o lab
- [ ] Crowdfunding: o deploy cria a campanha de exemplo (meta 2.000 BRLX, 30
      dias). A campanha que **falha** você cria ao vivo, com prazo de 5 min —
      prazo curto gravado no deploy venceria dias antes da aula
- [ ] `web/src/lib/deployment.json` atualizado (o deploy faz sozinho)
- [ ] Front publicado (Vercel) e testado no celular, **no 4G, não no Wi-Fi**
- [ ] CSR e BRLX adicionados na sua própria MetaMask
- [ ] QR code do link gerado

## D-1 — ensaio completo

- [ ] `students.json` preenchido com os endereços coletados
- [ ] `npm run fund:sepolia` → confirmar `N/N abastecidos`
- [ ] Aula inteira ensaiada, cronometrada, **com uma carteira de aluno de verdade**
- [ ] Whale swap testado: o painel de IL fica vermelho mesmo?
- [ ] `/telao` aberto em outra janela, eventos aparecendo
- [ ] **Vídeo de backup gravado** (fluxo completo, 3-4 min)

## D-0 — meia hora antes

- [ ] `/professor` → "saques de gas restantes" **maior que o nº de alunos**
- [ ] `/telao` no projetor, `/professor` na sua tela
- [ ] QR code projetado
- [ ] Alunos atrasados que mandaram endereço depois do prazo: rode o `fund` de novo
      (ele pula quem já tem saldo)

---

## Erros comuns e o que significam

| Mensagem | Causa real |
|---|---|
| `insufficient funds for gas` | Sem ETH. Faucet. |
| `ERC20InsufficientAllowance` | Faltou o `approve` antes do swap/depósito |
| `SlippageExceeded` | O preço mudou entre a simulação e o bloco — alguém negociou na frente |
| `FaucetCooldownActive` | Sacou há menos de 1 min (tokens) ou 5 min (gas) |
| `FaucetEmpty` | O `GasFaucet` secou. Mande ETH para o endereço dele. |
| `OwnableUnauthorizedAccount` | Um aluno achou o `/professor`. Funcionou como deveria. |
| `OrdemNaoEstaViva` | Alguém executou aquela ordem primeiro. É a aula do livro, não um bug |
| `PrecoPiorQueOLimite` | A travessia do livro passou da tolerância — o livro mudou entre a simulação e o bloco |
| `LivroSemLiquidez` | O lado do livro está vazio. Recoloque ordens em `/trade` |
| `AutoNegociacao` | O aluno tentou executar a própria ordem. O contrato recusa de propósito |
| `NadaParaColher` | Não passou tempo suficiente, ou o aluno não depositou no cofre |
| Rendimento parado em zero | A reserva do cofre secou. `/professor` → **Abastecer** |
| `EstadoErrado` | O acordo do escrow saiu do estado que a ação exigia — alguém agiu antes |
| `PrazoAindaNaoVenceu` | A contagem regressiva do escrow não chegou a zero |
| `NaoEhOArbitro` | Um aluno tentou resolver a própria disputa. Funcionou como deveria |
| `MetaNaoBatida` | O criador tentou sacar antes da meta. É a garantia funcionando |
| `AindaPodeBaterAMeta` | Pediu reembolso com a campanha em pé — só depois do prazo |

## Parâmetros que você pode querer mexer

Em `onchain/scripts/deploy.ts`:

- `FAUCET_TOKENS` / `FAUCET_COOLDOWN` — quanto e de quanto em quanto tempo
- `GAS_DRIP` — 0,01 ETH dá umas 40 transações em Sepolia
- `POOL_FUNDO_*` / `POOL_RASO_*` — o contraste de slippage entre os dois pools
  (hoje: **49 bps contra 1687 bps** no mesmo swap de 100 CSR)
- `STAKING_TAXA_POR_SEGUNDO` / `STAKING_RESERVA` — ritmo da emissão e o quanto
  existe para pagar. Hoje: 0,5 CSR/s com 50.000 de reserva, ou seja ~28 h de
  rendimento. Baixar a emissão deixa o APR "realista" e o rendimento **invisível**
  em 12 minutos de lab — o número absurdo é proposital e está explicado na tela.
- `CAMPANHA_EXEMPLO_*` — título e meta da campanha semeada. A meta deve ser
  alcançável pela turma somada (hoje 2.000 BRLX, ~20 alunos × 100)
- `LIVRO_VENDAS` / `LIVRO_COMPRAS` — a escada inicial do livro. Cuidado: o spread
  do topo (**50 bps**) foi escolhido contra a taxa do pool (30 bps) para que o
  livro ganhe na ordem pequena e perca na grande. Alargou o spread? O pool passa
  a ganhar nos dois casos e a conclusão da aula muda. Confira o cartão **Mesma
  venda, dois mercados** depois de mexer.

Mexeu nos contratos? `npm run build && npm run export-abis` antes de subir o front.
