# Roteiro — Lab de Pool de Liquidez

Duração: ~45 min para o lab de AMM. (Com os cinco labs prontos, vira uma aula
de 90 min — ver o escopo geral.)

Abra em duas janelas: **`/telao`** no projetor e **`/professor`** na sua tela.

---

## 0 · Antes de entrar na sala (10 min)

```bash
cd onchain
npm run fund:sepolia          # confirme "N/N abastecidos"
```

Abra `/professor` e confira o cartão **Estado da operação**. Se "saques de gas
restantes" estiver abaixo do número de alunos, mande mais ETH para o `GasFaucet`
antes de começar. Esse número é o único que pode acabar com a aula.

---

## 1 · Onboarding (20 min)

Projete o QR code do link do dApp.

Sequência na tela: **conectar → trocar para Sepolia → faucet**.

Fale enquanto eles clicam:

> "Repare que o site nunca teve acesso à sua chave. Ele só pede assinaturas, e
> quem assina é a MetaMask. Aprovar uma transação é você dizendo 'sim, execute
> essa regra' — não 'tome conta do meu dinheiro'."

**Problemas que vão aparecer, nesta ordem de frequência:**

| Sintoma | Resposta |
|---|---|
| "Não aparece nada para conectar" | A extensão não foi instalada, ou a aba precisa ser recarregada |
| "Está em outra rede" | O próprio aviso na tela tem o botão de trocar |
| "Não recebi o token" | Botão **Mostrar CSR e BRLX na carteira** — a MetaMask não exibe token que não conhece |
| "Transação falhou" | Quase sempre é gas: mandar para `/faucet` |
| Aluno que não estava na lista | `/professor` → **Emitir tokens**, e ele pega gas no faucet |

Só siga quando **todos** tiverem saldo. Esperar aqui é mais barato que resgatar
gente depois.

---

## 2 · O preço não é de ninguém (8 min)

Abra `/pool`. Comece pelo cartão **Mesmo swap, dois pools**, que já está na tela
sem ninguém precisar assinar nada.

> "Mesma fórmula, mesmo preço de vitrine, mesma ordem de 100 CSR. Um pool te dá
> ~0,5% de slippage, o outro ~17%. A única diferença é o tamanho do caixa."

Peça que façam um swap pequeno no **pool fundo** e depois o mesmo swap no
**pool raso**. Todo mundo sente a diferença na própria carteira.

Mostre a curva: o ponto preto é agora, o laranja é onde o pool vai parar.

> "Você não negocia *contra* alguém. Você negocia contra uma curva — e a sua
> própria ordem move o preço contra você antes de executar."

**Momento do `approve`:** quando alguém perguntar por que são duas transações.

> "Um contrato não consegue pegar seus tokens sozinho. Você autoriza antes. É
> por isso que aprovações antigas e esquecidas são um risco real: você pode
> continuar autorizando um contrato que nem lembra que existe."

---

## 3 · Virar o outro lado do balcão (10 min)

Todo mundo deposita no **pool fundo** pela aba *Depositar*.

Ponto a destacar: o aluno digita a quantidade de CSR e o pool **impõe** quanto
de BRLX vai junto.

> "Você não escolhe a proporção. Se pudesse, estaria movendo o preço de graça —
> e alguém arbitraria isso no bloco seguinte."

Deixe a turma negociar uns dois minutos entre si. O painel **Sua posição de LP**
sobe devagar: são as taxas de 0,3% de cada swap ficando dentro do pool.

---

## 4 · A baleia (5 min) — o momento da aula

Peça que **todos deixem a aba `/pool` aberta e visível**.

`/professor` → **Whale swap** → pool fundo → 10.000 CSR → executar.

O painel de perda impermanente vira vermelho na tela de todo mundo ao mesmo tempo.

> "Ninguém foi hackeado. O contrato funcionou exatamente como está escrito. Só
> que o preço divergiu, e quem é LP fica com mais do ativo que caiu e menos do
> que subiu. Se você sair agora, a perda 'impermanente' virou permanente."

Peça que abram a aba *Retirar* e olhem a composição do que volta — não é a
mesma cesta que entrou.

---

## 5 · Fechamento (2 min)

Volte à home e mostre a lista de contratos, cada um linkado no Etherscan.

> "O código que acabou de tirar dinheiro da sua posição está publicado ali, e
> você pode ler. Ele também é imutável: se tivesse um bug, o bug estaria lá
> para sempre. 'O código é lei' só ajuda quem lê o código."

---

## Se algo der errado

| Situação | Plano B |
|---|---|
| RPC da Sepolia lento/instável | Troque `NEXT_PUBLIC_SEPOLIA_RPC_URL` para um endpoint dedicado e redeploy do front |
| Sepolia fora do ar | `npm run node` + `npm run deploy:localhost`, front apontando para local (perde o Etherscan) |
| Wi-Fi da sala caiu | Vídeo do ensaio — grave na véspera, custa 10 minutos |
| `GasFaucet` secou no meio | Mande ETH direto para o endereço do faucet; o saldo atualiza na hora |
| Aluno com carteira travada | Ele acompanha em dupla; a tela do `/telao` mantém todo mundo no mesmo assunto |
