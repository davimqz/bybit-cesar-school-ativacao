// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MiniOrderBook — livro de ordens com limite, custodiado pelo contrato
/// @notice O outro jeito de formar preco. No AMM o preco sai de uma formula;
///         aqui ele sai de pessoas dizendo "eu pago X" e "eu vendo por Y". O que
///         separa os dois lados e o spread — e ele tem dono: quem colocou a ordem.
/// @dev Quem coloca uma ordem (maker) deposita o ativo na hora: o contrato segura
///      em custodia ate a ordem ser executada ou cancelada. Nao existe ordem sem
///      lastro, e por isso nenhuma execucao pode falhar por falta de saldo do
///      outro lado.
contract MiniOrderBook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Ativo negociado (CSR). O preco e sempre cotado em `quote` por 1 `base`.
    IERC20 public immutable base;
    /// @notice Ativo de cotacao (BRLX).
    IERC20 public immutable quote;

    /// @dev Teto de ordens vivas. Um livro real usa listas ordenadas e casa a
    ///      ordem na entrada; este percorre o array para achar o melhor preco, o
    ///      que e legivel mas custa gas. O teto cabe a turma inteira e mantem uma
    ///      ordem a mercado pagavel.
    uint256 public constant MAX_ORDENS_VIVAS = 60;

    /// @dev Quantos niveis uma ordem a mercado atravessa por vez.
    uint256 public constant MAX_EXECUCOES = 12;

    enum Lado {
        Compra,
        Venda
    }

    struct Ordem {
        uint256 id;
        address dono;
        Lado lado;
        /// @notice Quanto de `quote` por 1 `base`, escalado por 1e18.
        uint256 preco;
        /// @notice Quanto de `base` ainda falta executar.
        uint256 quantidade;
        /// @notice So para ordens de compra: `quote` ainda em custodia.
        uint256 custodiaQuote;
        bool viva;
    }

    Ordem[] private _ordens;
    uint256 public ordensVivas;

    event OrdemColocada(
        uint256 indexed id,
        address indexed dono,
        Lado lado,
        uint256 preco,
        uint256 quantidade
    );
    event OrdemExecutada(
        uint256 indexed id,
        address indexed maker,
        address indexed taker,
        Lado ladoDoMaker,
        uint256 preco,
        uint256 quantidade
    );
    event OrdemCancelada(uint256 indexed id, address indexed dono, uint256 quantidadeDevolvida);

    error ZeroAddress();
    error TokensIguais();
    error PrecoInvalido();
    error QuantidadeInvalida();
    error OrdemInexistente(uint256 id);
    error OrdemNaoEstaViva(uint256 id);
    error NaoEhDonoDaOrdem(uint256 id);
    error AutoNegociacao(uint256 id);
    error LivroCheio(uint256 limite);
    error LivroSemLiquidez();
    error PrecoPiorQueOLimite(uint256 efetivo, uint256 limite);

    constructor(address base_, address quote_) {
        if (base_ == quote_) revert TokensIguais();
        if (base_ == address(0) || quote_ == address(0)) revert ZeroAddress();
        base = IERC20(base_);
        quote = IERC20(quote_);
    }

    // ---------------------------------------------------------------------
    // Conta basica
    // ---------------------------------------------------------------------

    /// @notice Quanto de `quote` custa `quantidade` de `base` ao `preco` dado.
    function custo(uint256 quantidade, uint256 preco) public pure returns (uint256) {
        return (quantidade * preco) / 1e18;
    }

    // ---------------------------------------------------------------------
    // Maker — colocar e cancelar ordens
    // ---------------------------------------------------------------------

    /// @notice Coloca uma ordem limitada e deposita o ativo em custodia.
    /// @dev Esta versao nao casa a ordem na entrada: ela descansa no livro ate
    ///      alguem executar. E deliberado — a turma precisa VER o livro cheio
    ///      antes de atravessa-lo.
    function colocar(Lado lado, uint256 preco, uint256 quantidade)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (preco == 0) revert PrecoInvalido();
        if (quantidade == 0) revert QuantidadeInvalida();
        if (ordensVivas >= MAX_ORDENS_VIVAS) revert LivroCheio(MAX_ORDENS_VIVAS);

        uint256 custodiaQuote = 0;

        if (lado == Lado.Compra) {
            // Comprador deposita o dinheiro agora.
            custodiaQuote = custo(quantidade, preco);
            if (custodiaQuote == 0) revert QuantidadeInvalida();
            quote.safeTransferFrom(msg.sender, address(this), custodiaQuote);
        } else {
            // Vendedor deposita a mercadoria agora.
            base.safeTransferFrom(msg.sender, address(this), quantidade);
        }

        id = _ordens.length;
        _ordens.push(
            Ordem({
                id: id,
                dono: msg.sender,
                lado: lado,
                preco: preco,
                quantidade: quantidade,
                custodiaQuote: custodiaQuote,
                viva: true
            })
        );
        ordensVivas++;

        emit OrdemColocada(id, msg.sender, lado, preco, quantidade);
    }

    /// @notice Cancela a ordem e devolve o que ainda estava em custodia.
    function cancelar(uint256 id) external nonReentrant {
        Ordem storage o = _ordemViva(id);
        if (o.dono != msg.sender) revert NaoEhDonoDaOrdem(id);

        uint256 devolvida = o.quantidade;
        uint256 sobraQuote = o.custodiaQuote;

        o.custodiaQuote = 0;
        _encerrar(o);

        if (o.lado == Lado.Compra) {
            if (sobraQuote > 0) quote.safeTransfer(msg.sender, sobraQuote);
        } else {
            if (devolvida > 0) base.safeTransfer(msg.sender, devolvida);
        }

        emit OrdemCancelada(id, msg.sender, devolvida);
    }

    // ---------------------------------------------------------------------
    // Taker — executar contra o livro
    // ---------------------------------------------------------------------

    /// @notice Executa contra UMA ordem especifica, no preco dela.
    /// @dev E o gesto que nao existe num AMM: voce escolhe a contraparte e sabe o
    ///      preco exato antes de assinar. Aceita execucao parcial.
    function executar(uint256 id, uint256 quantidade) external nonReentrant {
        if (quantidade == 0) revert QuantidadeInvalida();
        Ordem storage o = _ordemViva(id);
        if (o.dono == msg.sender) revert AutoNegociacao(id);

        uint256 qtd = quantidade < o.quantidade ? quantidade : o.quantidade;
        _executarContra(o, qtd);
    }

    /// @notice Compra `quantidade` de `base` atravessando o livro, do melhor ask para cima.
    /// @param custoMaximo Teto de `quote` que voce aceita gastar no total. E o
    ///        equivalente do `minAmountOut` do AMM: sem ele, voce assina em branco.
    /// @return gasto Quanto de `quote` saiu da sua carteira.
    /// @return comprado Quanto de `base` entrou. Pode ser menor que o pedido se o
    ///         livro acabar — e a licao: profundidade nao e infinita.
    function comprarAMercado(uint256 quantidade, uint256 custoMaximo)
        external
        nonReentrant
        returns (uint256 gasto, uint256 comprado)
    {
        if (quantidade == 0) revert QuantidadeInvalida();

        uint256 restante = quantidade;

        for (uint256 passo = 0; passo < MAX_EXECUCOES && restante > 0; passo++) {
            (uint256 id, bool achou) = _melhorOrdem(Lado.Venda);
            if (!achou) break;

            Ordem storage o = _ordens[id];
            if (o.dono == msg.sender) break; // nao atravessa a propria ordem

            uint256 qtd = restante < o.quantidade ? restante : o.quantidade;
            gasto += _executarContra(o, qtd);
            comprado += qtd;
            restante -= qtd;
        }

        if (comprado == 0) revert LivroSemLiquidez();
        if (gasto > custoMaximo) revert PrecoPiorQueOLimite(gasto, custoMaximo);
    }

    /// @notice Vende `quantidade` de `base` atravessando o livro, do melhor bid para baixo.
    /// @param recebimentoMinimo Piso de `quote` que voce aceita receber no total.
    function venderAMercado(uint256 quantidade, uint256 recebimentoMinimo)
        external
        nonReentrant
        returns (uint256 recebido, uint256 vendido)
    {
        if (quantidade == 0) revert QuantidadeInvalida();

        uint256 restante = quantidade;

        for (uint256 passo = 0; passo < MAX_EXECUCOES && restante > 0; passo++) {
            (uint256 id, bool achou) = _melhorOrdem(Lado.Compra);
            if (!achou) break;

            Ordem storage o = _ordens[id];
            if (o.dono == msg.sender) break;

            uint256 qtd = restante < o.quantidade ? restante : o.quantidade;
            recebido += _executarContra(o, qtd);
            vendido += qtd;
            restante -= qtd;
        }

        if (vendido == 0) revert LivroSemLiquidez();
        if (recebido < recebimentoMinimo) revert PrecoPiorQueOLimite(recebido, recebimentoMinimo);
    }

    // ---------------------------------------------------------------------
    // Leitura — o livro que a tela desenha
    // ---------------------------------------------------------------------

    function totalDeOrdens() external view returns (uint256) {
        return _ordens.length;
    }

    function ordem(uint256 id) external view returns (Ordem memory) {
        if (id >= _ordens.length) revert OrdemInexistente(id);
        return _ordens[id];
    }

    /// @notice Todas as ordens vivas. A turma cabe num array.
    function livro() external view returns (Ordem[] memory vivas) {
        vivas = new Ordem[](ordensVivas);
        uint256 n = 0;
        for (uint256 i = 0; i < _ordens.length; i++) {
            if (_ordens[i].viva) {
                vivas[n] = _ordens[i];
                n++;
            }
        }
    }

    /// @notice Melhor oferta de compra: o maior preco que alguem aceita pagar.
    function melhorCompra() public view returns (uint256 preco, uint256 quantidade) {
        (uint256 id, bool achou) = _melhorOrdem(Lado.Compra);
        if (!achou) return (0, 0);
        return (_ordens[id].preco, _ordens[id].quantidade);
    }

    /// @notice Melhor oferta de venda: o menor preco pelo qual alguem vende.
    function melhorVenda() public view returns (uint256 preco, uint256 quantidade) {
        (uint256 id, bool achou) = _melhorOrdem(Lado.Venda);
        if (!achou) return (0, 0);
        return (_ordens[id].preco, _ordens[id].quantidade);
    }

    /// @notice O spread em basis points, medido sobre o meio do mercado.
    /// @dev Zero quando falta um dos lados: um livro so com compradores nao tem
    ///      spread, tem esperanca.
    function spreadBps() external view returns (uint256) {
        (uint256 bid, ) = melhorCompra();
        (uint256 ask, ) = melhorVenda();
        if (bid == 0 || ask == 0 || ask <= bid) return 0;
        uint256 meio = (ask + bid) / 2;
        return ((ask - bid) * 10_000) / meio;
    }

    /// @notice Simula uma compra a mercado sem assinar nada.
    /// @return custoTotal quanto de `quote` a travessia custaria
    /// @return preenchido quanto de `base` o livro consegue entregar
    /// @return precoMedio o preco que voce realmente pagaria, escalado por 1e18
    /// @return slippageBps distancia entre o preco medio e o melhor preco da tela
    function simularCompra(uint256 quantidade)
        external
        view
        returns (uint256 custoTotal, uint256 preenchido, uint256 precoMedio, uint256 slippageBps)
    {
        return _simular(Lado.Venda, quantidade);
    }

    /// @notice Simula uma venda a mercado sem assinar nada.
    function simularVenda(uint256 quantidade)
        external
        view
        returns (uint256 totalRecebido, uint256 preenchido, uint256 precoMedio, uint256 slippageBps)
    {
        return _simular(Lado.Compra, quantidade);
    }

    /// @notice Ids das ordens vivas de um endereco — a aba "minhas ordens".
    function ordensDe(address dono) external view returns (uint256[] memory ids) {
        uint256 n = 0;
        for (uint256 i = 0; i < _ordens.length; i++) {
            if (_ordens[i].viva && _ordens[i].dono == dono) n++;
        }
        ids = new uint256[](n);
        uint256 j = 0;
        for (uint256 i = 0; i < _ordens.length; i++) {
            if (_ordens[i].viva && _ordens[i].dono == dono) {
                ids[j] = i;
                j++;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Interno
    // ---------------------------------------------------------------------

    function _ordemViva(uint256 id) internal view returns (Ordem storage o) {
        if (id >= _ordens.length) revert OrdemInexistente(id);
        o = _ordens[id];
        if (!o.viva) revert OrdemNaoEstaViva(id);
    }

    function _encerrar(Ordem storage o) internal {
        o.viva = false;
        o.quantidade = 0;
        ordensVivas--;
    }

    /**
     * @dev Prioridade preco-tempo, a regra de qualquer bolsa: primeiro o melhor
     *      preco; empatou, ganha quem chegou antes (id menor). Sem essa regra,
     *      quem olha o livro com mais frequencia furaria a fila o tempo todo.
     */
    function _melhorOrdem(Lado lado) internal view returns (uint256 melhorId, bool achou) {
        uint256 melhorPreco = 0;

        for (uint256 i = 0; i < _ordens.length; i++) {
            Ordem storage o = _ordens[i];
            if (!o.viva || o.lado != lado) continue;

            if (!achou) {
                melhorPreco = o.preco;
                melhorId = i;
                achou = true;
                continue;
            }

            // Empate mantem o id menor: quem chegou antes executa antes.
            bool melhor = lado == Lado.Compra ? o.preco > melhorPreco : o.preco < melhorPreco;
            if (melhor) {
                melhorPreco = o.preco;
                melhorId = i;
            }
        }
    }

    /// @dev Move os dois ativos de uma vez. Nenhuma execucao pode falhar por
    ///      saldo do maker: ele ja depositou tudo quando colocou a ordem.
    function _executarContra(Ordem storage o, uint256 qtd) internal returns (uint256 valorQuote) {
        valorQuote = custo(qtd, o.preco);

        if (o.lado == Lado.Venda) {
            // O maker vende base. O taker paga quote e leva a base da custodia.
            quote.safeTransferFrom(msg.sender, o.dono, valorQuote);
            base.safeTransfer(msg.sender, qtd);
        } else {
            // O maker compra base. O taker entrega base e leva a quote da custodia.
            base.safeTransferFrom(msg.sender, o.dono, qtd);
            o.custodiaQuote -= valorQuote;
            quote.safeTransfer(msg.sender, valorQuote);
        }

        o.quantidade -= qtd;

        emit OrdemExecutada(o.id, o.dono, msg.sender, o.lado, o.preco, qtd);

        if (o.quantidade == 0) {
            // Sobra de arredondamento da custodia volta para o dono da ordem.
            address dono = o.dono;
            uint256 poeira = o.custodiaQuote;
            o.custodiaQuote = 0;
            _encerrar(o);
            if (poeira > 0) quote.safeTransfer(dono, poeira);
        }
    }

    /// @dev O mesmo criterio de `_melhorOrdem`, mas sobre a copia em memoria que
    ///      a simulacao vai consumindo. Extraido em funcao propria porque, inline,
    ///      o compilador estoura a pilha ("stack too deep").
    /// @return escolhido indice da ordem, ou `type(uint256).max` se nao houver
    /// @return preco preco dessa ordem
    function _melhorEmMemoria(Lado ladoAlvo, uint256[] memory restos)
        internal
        view
        returns (uint256 escolhido, uint256 preco)
    {
        escolhido = type(uint256).max;

        for (uint256 i = 0; i < restos.length; i++) {
            if (restos[i] == 0) continue;
            uint256 p = _ordens[i].preco;

            if (escolhido == type(uint256).max) {
                escolhido = i;
                preco = p;
                continue;
            }

            if (ladoAlvo == Lado.Compra ? p > preco : p < preco) {
                escolhido = i;
                preco = p;
            }
        }
    }

    /// @dev Espelha o laco das ordens a mercado, sem tocar em estado.
    function _simular(Lado ladoAlvo, uint256 quantidade)
        internal
        view
        returns (uint256 total, uint256 preenchido, uint256 precoMedio, uint256 slippageBps)
    {
        if (quantidade == 0) return (0, 0, 0, 0);

        // Copia para memoria: precisamos consumir niveis sem escrever no storage.
        uint256[] memory restos = new uint256[](_ordens.length);
        for (uint256 i = 0; i < restos.length; i++) {
            restos[i] = _ordens[i].viva && _ordens[i].lado == ladoAlvo ? _ordens[i].quantidade : 0;
        }

        uint256 melhorPrecoDaTela = 0;
        uint256 restante = quantidade;

        for (uint256 passo = 0; passo < MAX_EXECUCOES && restante > 0; passo++) {
            (uint256 escolhido, uint256 preco) = _melhorEmMemoria(ladoAlvo, restos);
            if (escolhido == type(uint256).max) break;
            if (melhorPrecoDaTela == 0) melhorPrecoDaTela = preco;

            uint256 qtd = restante < restos[escolhido] ? restante : restos[escolhido];
            total += custo(qtd, preco);
            preenchido += qtd;
            restante -= qtd;
            restos[escolhido] -= qtd;
        }

        if (preenchido == 0) return (0, 0, 0, 0);

        precoMedio = (total * 1e18) / preenchido;

        // Quanto o preco medio se afastou do melhor preco da tela: o mesmo numero
        // que o AMM chama de slippage, medido do mesmo jeito.
        if (ladoAlvo == Lado.Venda && precoMedio > melhorPrecoDaTela) {
            slippageBps = ((precoMedio - melhorPrecoDaTela) * 10_000) / melhorPrecoDaTela;
        } else if (ladoAlvo == Lado.Compra && precoMedio < melhorPrecoDaTela) {
            slippageBps = ((melhorPrecoDaTela - precoMedio) * 10_000) / melhorPrecoDaTela;
        }
    }
}
