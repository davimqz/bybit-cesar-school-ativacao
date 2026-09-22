# DeFi Lab — CESAR School × Bybit

Laboratório de DeFi para a Aula 3 (Finanças Descentralizadas). Contratos de
verdade, em rede de teste pública, operados pelos alunos durante a aula.

**Rede da aula:** Ethereum Sepolia (já vem configurada na MetaMask).
**Carteira:** MetaMask, obrigatória para todos.

## Estrutura

```
defi-lab/
├── onchain/     contratos (Solidity 0.8.28 + Hardhat 3 + viem) e scripts de operação
├── web/         dApp da aula (Next.js 16 + wagmi 3 + viem)
└── docs/        roteiro da aula, guia do aluno e checklist do professor
```

## O que já está pronto

| Peça | Estado |
|---|---|
| `ClassroomToken` — ERC-20 com faucet (publicado 2×: CSR e BRLX) | pronto |
| `GasFaucet` — distribui ETH de testnet para a turma | pronto |
| `MiniAMM` — pool `x·y=k`, taxa 0,3%, shares de LP | pronto |
| `MiniOrderBook` — livro custodiado, prioridade preço-tempo | pronto |
| `MiniStaking` — emissão por segundo, reserva finita, APR × APY | pronto |
| `MiniEscrow` — custódia condicional, prazos e árbitro humano | pronto |
| Lab de **pool de liquidez** (swap, LP, slippage, IL, curva ao vivo) | pronto |
| Lab de **trade** (livro ao vivo, spread, travessia, maker × taker) | pronto |
| Lab de **staking** (de onde vem o rendimento, diluição, reinvestir) | pronto |
| Lab de **escrow** (máquina de estados, prazos, risco de oráculo) | pronto |
| Página de faucet, telão e painel do professor | pronto |
| Lab de crowdfunding | a construir |

## Começando (ensaio local)

Três terminais.

```bash
# 1) nó local
cd onchain && npm install && npm run node

# 2) publica e semeia
cd onchain && GAS_FAUCET_SEED=0.5 npm run deploy:localhost

# 3) dApp
cd web && npm install && npm run dev
```

Na MetaMask, adicione a rede local: RPC `http://127.0.0.1:8545`, chain ID `31337`.
Importe uma das chaves privadas que o `npm run node` imprime.

## Indo para a Sepolia

```bash
cd onchain
cp .env.example .env          # preencha DEPLOYER_PRIVATE_KEY e ETHERSCAN_API_KEY
npm run deploy:sepolia
npx hardhat verify --network sepolia <endereco> <args-do-construtor>

cp students.example.json students.json   # cole os endereços da turma
npm run fund:sepolia
```

O deploy escreve `web/src/lib/deployment.json` sozinho — o front nunca tem
endereço digitado à mão.

> **Use uma carteira nova, exclusiva da aula.** A chave privada vai para um
> arquivo `.env` e é usada em scripts: ela não pode nunca ter tocado em mainnet.

## Testes

```bash
cd onchain && npm test
```

Os testes são material didático: cada `it` verifica um conceito do slide
(`x·y=k`, slippage, taxas de LP, impermanent loss, spread, prioridade
preço-tempo). Vale projetar a saída — o último bloco imprime o mesmo trade
executado no livro e no pool, lado a lado.

## Comandos

| Comando | Onde | O que faz |
|---|---|---|
| `npm test` | onchain | roda a suíte de conceitos |
| `npm run build` | onchain | compila os contratos |
| `npm run node` | onchain | sobe o nó local |
| `npm run deploy:localhost` / `:sepolia` | onchain | publica e semeia os pools |
| `npm run fund:sepolia` | onchain | abastece a turma com gas e tokens |
| `npm run export-abis` | onchain | atualiza as ABIs do front |
| `npm run dev` | web | sobe o dApp |

## Aviso

Tudo aqui é educacional e roda em rede de teste. Os tokens não têm valor,
o faucet emite à vontade e nenhum contrato passou por auditoria. Não reaproveite
este código em mainnet.
