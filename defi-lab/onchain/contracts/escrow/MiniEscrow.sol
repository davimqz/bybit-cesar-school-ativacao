// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MiniEscrow — custodia condicional com arbitro humano
/// @notice O dinheiro sai da carteira do comprador e fica preso aqui ate que uma
///         condicao seja declarada cumprida. O contrato cumpre as regras com
///         precisao absoluta — e e exatamente por isso que ele nao resolve o
///         problema de fundo: **alguem** tem que dizer se a entrega aconteceu.
/// @dev A licao central do lab e o risco de oraculo. O arbitro e um endereco
///      comum, sem poder mágico nenhum: ele pode resolver a disputa para o lado
///      errado, e o contrato vai executar isso sem hesitar. "Descentralizado"
///      nao significa "sem alguem decidindo" — significa que quem decide esta
///      escrito no codigo, e voce podia ter lido antes de depositar.
contract MiniEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Moeda dos acordos (BRLX).
    IERC20 public immutable moeda;

    /// @notice Janela que o comprador tem para reclamar depois do envio.
    /// @dev Curta de proposito: numa aula de 15 minutos, "7 dias" nao ensina
    ///      nada. O mecanismo e o mesmo de um marketplace real.
    uint256 public constant JANELA_REVISAO = 5 minutes;

    enum Estado {
        Financiado,
        Enviado,
        Concluido,
        Reembolsado,
        EmDisputa
    }

    struct Acordo {
        uint256 id;
        address comprador;
        address vendedor;
        /// @notice Quem decide se houver disputa. O oraculo humano do acordo.
        address arbitro;
        uint256 valor;
        /// @notice Ate quando o vendedor tem para marcar o envio.
        uint256 prazoEnvio;
        /// @notice Quando o envio foi marcado (0 se ainda nao foi).
        uint256 momentoEnvio;
        Estado estado;
        string descricao;
    }

    Acordo[] private _acordos;

    event AcordoCriado(
        uint256 indexed id,
        address indexed comprador,
        address indexed vendedor,
        address arbitro,
        uint256 valor,
        uint256 prazoEnvio
    );
    event EnvioMarcado(uint256 indexed id, address indexed vendedor);
    event Liberado(uint256 indexed id, address indexed para, uint256 valor, string motivo);
    event Reembolsado(uint256 indexed id, address indexed para, uint256 valor, string motivo);
    event DisputaAberta(uint256 indexed id, address indexed quem);
    event DisputaResolvida(uint256 indexed id, address indexed arbitro, bool paraVendedor);

    error ValorInvalido();
    error PrazoInvalido();
    error EnderecoInvalido();
    error ParticipantesRepetidos();
    error AcordoInexistente(uint256 id);
    error EstadoErrado(Estado atual);
    error NaoEhOComprador();
    error NaoEhOVendedor();
    error NaoEhOArbitro();
    error NaoEhParteDoAcordo();
    error PrazoAindaNaoVenceu(uint256 vence);

    constructor(address moeda_) {
        if (moeda_ == address(0)) revert EnderecoInvalido();
        moeda = IERC20(moeda_);
    }

    // ---------------------------------------------------------------------
    // Criar e financiar
    // ---------------------------------------------------------------------

    /// @notice Cria o acordo e deposita o valor na mesma transacao.
    /// @dev Financiar junto e deliberado: um escrow "criado mas nao pago" nao
    ///      protege ninguem, e na aula viraria mais um passo para dar errado.
    ///      Quem chama e o comprador — o dinheiro sai daqui.
    function criar(
        address vendedor,
        address arbitro,
        uint256 valor,
        uint256 prazoSegundos,
        string calldata descricao
    ) external nonReentrant returns (uint256 id) {
        if (valor == 0) revert ValorInvalido();
        if (prazoSegundos == 0) revert PrazoInvalido();
        if (vendedor == address(0) || arbitro == address(0)) revert EnderecoInvalido();
        if (vendedor == msg.sender || arbitro == msg.sender || arbitro == vendedor) {
            // Arbitro que e parte interessada nao e arbitro, e juiz em causa
            // propria. O contrato recusa — mas repare que ele so consegue
            // recusar o caso obvio: dois enderecos da mesma pessoa passam.
            revert ParticipantesRepetidos();
        }

        id = _acordos.length;
        _acordos.push(
            Acordo({
                id: id,
                comprador: msg.sender,
                vendedor: vendedor,
                arbitro: arbitro,
                valor: valor,
                prazoEnvio: block.timestamp + prazoSegundos,
                momentoEnvio: 0,
                estado: Estado.Financiado,
                descricao: descricao
            })
        );

        moeda.safeTransferFrom(msg.sender, address(this), valor);

        emit AcordoCriado(id, msg.sender, vendedor, arbitro, valor, block.timestamp + prazoSegundos);
    }

    // ---------------------------------------------------------------------
    // Caminho feliz
    // ---------------------------------------------------------------------

    /// @notice O vendedor declara que enviou. Comeca a janela de revisao.
    /// @dev Nenhuma prova e exigida, e nem poderia: a blockchain nao sabe se uma
    ///      caixa saiu do galpao. Toda a confianca do escrow esta fora dele.
    function marcarEnviado(uint256 id) external {
        Acordo storage a = _buscar(id);
        if (msg.sender != a.vendedor) revert NaoEhOVendedor();
        if (a.estado != Estado.Financiado) revert EstadoErrado(a.estado);

        a.estado = Estado.Enviado;
        a.momentoEnvio = block.timestamp;

        emit EnvioMarcado(id, msg.sender);
    }

    /// @notice O comprador libera o pagamento. O caminho que nunca precisa de arbitro.
    function liberar(uint256 id) external nonReentrant {
        Acordo storage a = _buscar(id);
        if (msg.sender != a.comprador) revert NaoEhOComprador();
        if (a.estado != Estado.Financiado && a.estado != Estado.Enviado) {
            revert EstadoErrado(a.estado);
        }

        _pagar(a, a.vendedor, Estado.Concluido, "comprador liberou");
    }

    /// @notice Libera para o vendedor quando a janela de revisao passa em silencio.
    /// @dev Qualquer um pode chamar: e so o relogio. Sem isso, um comprador que
    ///      simplesmente desaparece prenderia o dinheiro do vendedor para sempre.
    function liberarPorPrazo(uint256 id) external nonReentrant {
        Acordo storage a = _buscar(id);
        if (a.estado != Estado.Enviado) revert EstadoErrado(a.estado);

        uint256 vence = a.momentoEnvio + JANELA_REVISAO;
        if (block.timestamp < vence) revert PrazoAindaNaoVenceu(vence);

        _pagar(a, a.vendedor, Estado.Concluido, "silencio do comprador apos o prazo");
    }

    /// @notice O comprador cancela se o vendedor nao marcou envio dentro do prazo.
    function cancelarPorPrazo(uint256 id) external nonReentrant {
        Acordo storage a = _buscar(id);
        if (msg.sender != a.comprador) revert NaoEhOComprador();
        if (a.estado != Estado.Financiado) revert EstadoErrado(a.estado);
        if (block.timestamp < a.prazoEnvio) revert PrazoAindaNaoVenceu(a.prazoEnvio);

        _pagar(a, a.comprador, Estado.Reembolsado, "vendedor nao enviou no prazo");
    }

    // ---------------------------------------------------------------------
    // Disputa — onde o oraculo aparece
    // ---------------------------------------------------------------------

    /// @notice Comprador ou vendedor travam o acordo e chamam o arbitro.
    function abrirDisputa(uint256 id) external {
        Acordo storage a = _buscar(id);
        if (msg.sender != a.comprador && msg.sender != a.vendedor) revert NaoEhParteDoAcordo();
        if (a.estado != Estado.Financiado && a.estado != Estado.Enviado) {
            revert EstadoErrado(a.estado);
        }

        a.estado = Estado.EmDisputa;
        emit DisputaAberta(id, msg.sender);
    }

    /// @notice O arbitro decide para quem vai o dinheiro. Ponto final.
    /// @dev Aqui esta o risco de oraculo, inteiro, em quatro linhas: o contrato
    ///      nao verifica nada sobre a entrega. Ele obedece o endereco que foi
    ///      escrito como arbitro na criacao do acordo. Se esse endereco mentir,
    ///      o codigo executa a mentira com a mesma precisao com que executaria a
    ///      verdade — e ninguem pode reverter.
    function resolver(uint256 id, bool paraVendedor) external nonReentrant {
        Acordo storage a = _buscar(id);
        if (msg.sender != a.arbitro) revert NaoEhOArbitro();
        if (a.estado != Estado.EmDisputa) revert EstadoErrado(a.estado);

        emit DisputaResolvida(id, msg.sender, paraVendedor);

        if (paraVendedor) {
            _pagar(a, a.vendedor, Estado.Concluido, "arbitro decidiu pelo vendedor");
        } else {
            _pagar(a, a.comprador, Estado.Reembolsado, "arbitro decidiu pelo comprador");
        }
    }

    // ---------------------------------------------------------------------
    // Leitura
    // ---------------------------------------------------------------------

    function total() external view returns (uint256) {
        return _acordos.length;
    }

    function acordo(uint256 id) external view returns (Acordo memory) {
        return _buscarView(id);
    }

    /// @notice Todos os acordos — a turma cabe num array.
    function todos() external view returns (Acordo[] memory) {
        return _acordos;
    }

    /// @notice Acordos em que este endereco e comprador, vendedor ou arbitro.
    function acordosDe(address quem) external view returns (uint256[] memory ids) {
        uint256 n = 0;
        for (uint256 i = 0; i < _acordos.length; i++) {
            if (_ehParte(_acordos[i], quem)) n++;
        }
        ids = new uint256[](n);
        uint256 j = 0;
        for (uint256 i = 0; i < _acordos.length; i++) {
            if (_ehParte(_acordos[i], quem)) {
                ids[j] = i;
                j++;
            }
        }
    }

    /// @notice Quando o vendedor pode cobrar por silencio (0 se nao se aplica).
    function venceEm(uint256 id) external view returns (uint256) {
        Acordo memory a = _buscarView(id);
        if (a.estado == Estado.Enviado) return a.momentoEnvio + JANELA_REVISAO;
        if (a.estado == Estado.Financiado) return a.prazoEnvio;
        return 0;
    }

    /// @notice Total que o contrato guarda hoje — a soma do que esta em custodia.
    function emCustodia() external view returns (uint256 soma) {
        for (uint256 i = 0; i < _acordos.length; i++) {
            Estado e = _acordos[i].estado;
            if (e == Estado.Financiado || e == Estado.Enviado || e == Estado.EmDisputa) {
                soma += _acordos[i].valor;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Interno
    // ---------------------------------------------------------------------

    function _buscar(uint256 id) internal view returns (Acordo storage) {
        if (id >= _acordos.length) revert AcordoInexistente(id);
        return _acordos[id];
    }

    function _buscarView(uint256 id) internal view returns (Acordo memory) {
        if (id >= _acordos.length) revert AcordoInexistente(id);
        return _acordos[id];
    }

    function _ehParte(Acordo storage a, address quem) internal view returns (bool) {
        return quem == a.comprador || quem == a.vendedor || quem == a.arbitro;
    }

    /// @dev Fecha o acordo e paga. O estado muda ANTES da transferencia, entao
    ///      nao existe caminho em que o mesmo acordo pague duas vezes.
    function _pagar(Acordo storage a, address para, Estado estadoFinal, string memory motivo) internal {
        uint256 valor = a.valor;
        a.estado = estadoFinal;

        moeda.safeTransfer(para, valor);

        if (estadoFinal == Estado.Reembolsado) {
            emit Reembolsado(a.id, para, valor, motivo);
        } else {
            emit Liberado(a.id, para, valor, motivo);
        }
    }
}
