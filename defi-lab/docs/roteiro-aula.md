# Roteiro — Os cinco labs

Duração cheia: ~100 min (45 de AMM + 15 de livro de ordens + 12 de staking +
15 de escrow + 12 de crowdfunding). Para 90 min, corte o crowdfunding ou reduza
o onboarding — não corte o escrow, que é o fechamento conceitual da aula.

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

## 5 · O outro jeito de formar preço (15 min) — lab de trade

Abra `/trade`. O livro já está semeado: spread de 50 bps em volta de 1 CSR = 2 BRLX.

Comece pelo cartão **Mesma venda, dois mercados**, que também roda sem ninguém
assinar nada.

> "Vender 100 CSR rende mais no livro. Vender 1.200 CSR o livro nem consegue
> executar inteiro. Não existe 'o melhor mercado' — existe o melhor mercado para
> o tamanho da sua ordem."

**Sequência na tela:**

1. **Leia o livro.** Cada linha é uma pessoa, e o endereço está ali. Compare com
   o pool, onde não há de quem: só reservas.
2. **Clique numa linha** e execute contra ela. O preço é exato, sem tolerância —
   e alguém vai reclamar que a ordem "desapareceu" antes de assinar. É a aula:
   no livro, quem chega primeiro leva.
3. **Todos colocam uma ordem limitada** dentro do spread. O livro da turma
   aparece na tela de todo mundo, e o spread fecha na frente deles.
4. **Ordem a mercado** de 600 CSR: a travessia come três níveis e o preço médio
   piora em degraus.

> "No pool você escorrega por uma curva. Aqui você come a escada que outras
> pessoas construíram, um degrau por vez. Os dois cobram de você por tamanho —
> mas só um deles tem alguém do outro lado que escolheu aquele preço."

**O momento maker × taker:** pergunte quem, das ordens colocadas no passo 3,
foi executada — e a que preço.

> "Quem colocou a ordem não pagou slippage nenhum: o preço era dele. Em troca,
> não escolheu o momento de vender. É essa a troca de quem faz mercado, e é de
> onde sai o spread."

**Se o livro esvaziar:** `/professor` → cartão **Livro de ordens** mostra quantas
ordens restam. Abaixo de quatro, recoloque uma escada em `/trade` — você tem 10
milhões de cada token.

**O gesto dramático (opcional, se sobrar tempo):** `/professor` → **Varrer o
lado da venda**. As linhas desaparecem uma a uma e o spread explode no telão.
É o gêmeo do whale swap, no outro mercado.

---

## 6 · De onde vem o rendimento (12 min) — lab de staking

Abra `/staking`. A ordem dos cartões na tela é o argumento: a **reserva** vem
antes do percentual, de propósito.

> "O contrato promete 1,5 milhão por cento ao ano. Antes de comemorar: essa
> reserva tem 50.000 CSR e dura 28 horas. Quem pagou por ela fui eu, ontem à
> noite. Todo rendimento sai de algum lugar — a única pergunta útil é de onde."

**Sequência:**

1. Todos depositam 500 ou 1.000 CSR. O **pendente** começa a subir na tela sozinho.
2. Mostre o campo **sua fatia do cofre**: é ela, não o depósito, que define o ganho.
3. Alguém clica em **Reinvestir**. Nenhum token se move na carteira — e a fatia
   cresce. É o APR virando APY na frente deles.

**O momento do lab:** `/professor` → cartão **Cofre de staking** → **Depósito
baleia** de 50.000 CSR. O painel mostra o APR que a turma vai ter *antes* de
você clicar.

O APR cai de ~1.200.000% para ~30.000% na tela de todos ao mesmo tempo, e os dez
minutos seguintes rendem uma fração do que rendiam.

> "Ninguém tirou nada de vocês: o principal está intacto. O que mudou é a fatia.
> Rendimento em DeFi quase sempre é disputa por uma emissão fixa — e ninguém é
> obrigado a te avisar que vai entrar na fila."

Feche perguntando o que acontece quando a reserva zerar. O contrato tem a
resposta: emissão para, APR vira zero, e o depósito continua lá — intacto e
rendendo nada.

---

## 7 · Quando o código não basta (15 min) — lab de escrow

Este lab termina com a turma desconfortável, e é assim que ele tem que terminar.

Abra `/escrow`. Peça que se organizem **em duplas**: um é comprador, o outro
vendedor. Cada dupla troca endereços.

**Sequência:**

1. O comprador cria um acordo de 300 BRLX com prazo de 5 minutos. O dinheiro sai
   da carteira dele **na hora** — mostre o saldo caindo.
2. O vendedor clica em **Marcar como enviado**.

   > "Nenhuma prova foi pedida. A blockchain não sabe se uma caixa saiu de um
   > galpão, e nunca vai saber. Toda a confiança deste contrato está fora dele."

3. O comprador libera. Caminho feliz, sem árbitro nenhum. É a maioria dos casos.

**Depois, o caso que interessa:** peça a **uma dupla** que faça o seguinte — o
comprador cria o acordo, o vendedor **não marca envio**, e o comprador abre
disputa.

`/professor` → cartão **Disputas no escrow** → **Decidir pelo vendedor**.

Diga em voz alta o que você está fazendo:

> "O vendedor não entregou nada. Eu sei disso. Estou decidindo a favor dele de
> propósito, e o contrato vai executar isso em dois segundos, sem recurso. Não
> houve bug, não houve hack: o código funcionou perfeitamente. O que falhou foi
> a parte que nunca foi código — eu."

Feche com a pergunta:

> "Quando vocês assinaram aquele acordo, escolheram quem decidiria. Alguém leu
> qual era o endereço do árbitro antes de depositar?"

**Terceiro caso, se der tempo:** um comprador cria acordo com prazo de 5 min e o
vendedor não faz nada. Passado o prazo, o botão **Cancelar e ser reembolsado**
aparece sozinho. O relógio é o único árbitro que não tem interesse próprio.

---

## 8 · Quando a promessa é código (12 min) — lab de crowdfunding

O lab mais curto e o mais direto. Abra `/crowdfunding`: a campanha
&ldquo;Festa de formatura da turma&rdquo; já está lá, semeada no deploy.

**Parte 1 — a garantia.** Peça que a turma contribua até bater a meta. Antes de
ela encher, mostre que o criador **não tem botão de sacar**:

> "Não é que eu prometi não sacar. É que a função reverte. Qualquer um de vocês
> podia ter lido esse `if` antes de colocar dinheiro — e essa é a diferença entre
> confiar numa pessoa e verificar uma regra."

Batida a meta, o botão aparece e o criador saca tudo. Aponte o que mudou para
quem contribuiu: o reembolso desapareceu junto.

**Parte 2 — o fracasso.** Crie uma campanha ao vivo com **meta alta e prazo de 5
minutos**. Alguns alunos contribuem. Enquanto o prazo corre, tente o reembolso:
o contrato recusa, porque a campanha ainda pode dar certo.

Passados os 5 minutos, a situação vira **Falhou** e o botão de reembolso aparece
para cada apoiador.

> "Repare no que o contrato **não** fez: ele não devolveu para ninguém. Cada um
> veio buscar. Parece menos gentil, e é mais seguro — se ele tentasse pagar mil
> pessoas num laço, um único endereço problemático travaria a fila inteira, e o
> gas não caberia num bloco. Em DeFi, quase todo pagamento é você quem puxa."

Deixe um aluno **sem** sacar de propósito e mostre que o dinheiro dele continua
no contrato, nominal, esperando.

---

## 9 · Fechamento (2 min)

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
| Livro de ordens zerado | `/trade` com a sua carteira: três ordens de cada lado em volta de 2,00 devolvem o lab |
| Reserva do cofre secou | `/professor` → **Abastecer** no cartão do cofre; o rendimento volta no mesmo bloco |
| Aluno travou dinheiro no escrow | `/professor` → **Disputas**; se não houver disputa aberta, peça que ele abra uma e resolva |
| Aluno com carteira travada | Ele acompanha em dupla; a tela do `/telao` mantém todo mundo no mesmo assunto |
