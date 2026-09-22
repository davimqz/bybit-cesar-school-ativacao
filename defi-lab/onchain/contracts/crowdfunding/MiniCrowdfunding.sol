// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MiniCrowdfunding — arrecadacao tudo-ou-nada
/// @notice "Se nao bater a meta, todos recebem de volta" costuma ser uma promessa
///         de quem esta arrecadando. Aqui e uma regra do contrato: o criador
///         **nao consegue** sacar antes de bater a meta, nem que queira.
/// @dev Duas coisas que a aula usa este contrato para mostrar:
///
///      1. A garantia nao vem da boa fe de ninguem — vem de um `if` que qualquer
///         pessoa pode ler antes de contribuir.
///      2. O reembolso e **pull**, nao push: cada um saca o seu. Devolver em laco
///         para todos numa transacao e um erro classico — um endereco que reverte
///         travaria o reembolso de todo mundo, e o gas de mil contribuintes nao
///         cabe num bloco.
contract MiniCrowdfunding is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Moeda das campanhas (BRLX).
    IERC20 public immutable moeda;

    struct Campanha {
        uint256 id;
        address criador;
        string titulo;
        uint256 meta;
        uint256 prazo;
        uint256 arrecadado;
        /// @notice Quantos enderecos diferentes contribuiram.
        uint256 apoiadores;
        bool sacada;
    }

    /// @notice Situacao da campanha, do jeito que a tela precisa.
    enum Situacao {
        Arrecadando,
        MetaBatida,
        Sacada,
        Falhou
    }

    Campanha[] private _campanhas;

    /// @notice Quanto cada endereco colocou em cada campanha.
    mapping(uint256 => mapping(address => uint256)) public contribuicoes;

    event CampanhaCriada(
        uint256 indexed id,
        address indexed criador,
        string titulo,
        uint256 meta,
        uint256 prazo
    );
    event Contribuiu(uint256 indexed id, address indexed quem, uint256 valor, uint256 arrecadado);
    event Sacada(uint256 indexed id, address indexed criador, uint256 valor);
    event Reembolsado(uint256 indexed id, address indexed quem, uint256 valor);

    error ValorInvalido();
    error MetaInvalida();
    error PrazoInvalido();
    error CampanhaInexistente(uint256 id);
    error PrazoEncerrado(uint256 prazo);
    error JaFoiSacada();
    error MetaNaoBatida(uint256 arrecadado, uint256 meta);
    error NaoEhOCriador();
    error AindaPodeBaterAMeta(uint256 prazo);
    error MetaFoiBatida();
    error NadaParaReembolsar();

    constructor(address moeda_) {
        moeda = IERC20(moeda_);
    }

    // ---------------------------------------------------------------------
    // Criar e contribuir
    // ---------------------------------------------------------------------

    function criar(string calldata titulo, uint256 meta, uint256 prazoSegundos)
        external
        returns (uint256 id)
    {
        if (meta == 0) revert MetaInvalida();
        if (prazoSegundos == 0) revert PrazoInvalido();

        id = _campanhas.length;
        _campanhas.push(
            Campanha({
                id: id,
                criador: msg.sender,
                titulo: titulo,
                meta: meta,
                prazo: block.timestamp + prazoSegundos,
                arrecadado: 0,
                apoiadores: 0,
                sacada: false
            })
        );

        emit CampanhaCriada(id, msg.sender, titulo, meta, block.timestamp + prazoSegundos);
    }

    /// @notice Coloca dinheiro na campanha. Pode contribuir varias vezes.
    function contribuir(uint256 id, uint256 valor) external nonReentrant {
        if (valor == 0) revert ValorInvalido();

        Campanha storage c = _buscar(id);
        if (c.sacada) revert JaFoiSacada();
        if (block.timestamp >= c.prazo) revert PrazoEncerrado(c.prazo);

        if (contribuicoes[id][msg.sender] == 0) c.apoiadores++;
        contribuicoes[id][msg.sender] += valor;
        c.arrecadado += valor;

        moeda.safeTransferFrom(msg.sender, address(this), valor);

        emit Contribuiu(id, msg.sender, valor, c.arrecadado);
    }

    // ---------------------------------------------------------------------
    // Os dois finais possiveis
    // ---------------------------------------------------------------------

    /// @notice O criador saca — e so consegue se a meta foi batida.
    /// @dev Este `if` e a promessa inteira. Nao ha caminho no contrato que
    ///      entregue o dinheiro ao criador com a meta em aberto: nem funcao de
    ///      emergencia, nem dono, nem pausa. E por isso que a garantia vale.
    function sacar(uint256 id) external nonReentrant {
        Campanha storage c = _buscar(id);
        if (msg.sender != c.criador) revert NaoEhOCriador();
        if (c.sacada) revert JaFoiSacada();
        if (c.arrecadado < c.meta) revert MetaNaoBatida(c.arrecadado, c.meta);

        uint256 valor = c.arrecadado;
        c.sacada = true;

        moeda.safeTransfer(c.criador, valor);

        emit Sacada(id, c.criador, valor);
    }

    /// @notice Falhou a meta e o prazo passou: cada um saca o que colocou.
    /// @dev Pull, nao push. Repare que o contrato nao "devolve para todos": ele
    ///      espera cada pessoa vir buscar. Um laco de devolucao pareceria mais
    ///      gentil e seria pior — bastaria um endereco que reverte no recebimento
    ///      para travar o reembolso da fila inteira.
    function reembolsar(uint256 id) external nonReentrant returns (uint256 valor) {
        Campanha storage c = _buscar(id);
        if (block.timestamp < c.prazo) revert AindaPodeBaterAMeta(c.prazo);
        if (c.arrecadado >= c.meta) revert MetaFoiBatida();

        valor = contribuicoes[id][msg.sender];
        if (valor == 0) revert NadaParaReembolsar();

        // Zera antes de transferir: nenhum caminho reentrante saca duas vezes.
        contribuicoes[id][msg.sender] = 0;
        c.arrecadado -= valor;

        moeda.safeTransfer(msg.sender, valor);

        emit Reembolsado(id, msg.sender, valor);
    }

    // ---------------------------------------------------------------------
    // Leitura
    // ---------------------------------------------------------------------

    function total() external view returns (uint256) {
        return _campanhas.length;
    }

    function campanha(uint256 id) external view returns (Campanha memory) {
        if (id >= _campanhas.length) revert CampanhaInexistente(id);
        return _campanhas[id];
    }

    function todas() external view returns (Campanha[] memory) {
        return _campanhas;
    }

    /// @notice Em que pe a campanha esta — a tela inteira depende disto.
    function situacao(uint256 id) external view returns (Situacao) {
        Campanha storage c = _buscar(id);
        if (c.sacada) return Situacao.Sacada;
        if (c.arrecadado >= c.meta) return Situacao.MetaBatida;
        if (block.timestamp >= c.prazo) return Situacao.Falhou;
        return Situacao.Arrecadando;
    }

    /// @notice Progresso em basis points (10000 = meta batida).
    function progressoBps(uint256 id) external view returns (uint256) {
        Campanha storage c = _buscar(id);
        if (c.meta == 0) return 0;
        return (c.arrecadado * 10_000) / c.meta;
    }

    /// @notice Quanto falta para bater a meta (0 se ja bateu).
    function faltaParaMeta(uint256 id) external view returns (uint256) {
        Campanha storage c = _buscar(id);
        return c.arrecadado >= c.meta ? 0 : c.meta - c.arrecadado;
    }

    function _buscar(uint256 id) internal view returns (Campanha storage) {
        if (id >= _campanhas.length) revert CampanhaInexistente(id);
        return _campanhas[id];
    }
}
