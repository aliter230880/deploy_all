// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TokenV2
 * @notice Clone of 0x7FD049EB478b7b216F23299A37bc57EbDf098888 (BSC Mainnet)
 * @dev Upgradeable-compatible: empty constructor + initialize().
 *      Features: ERC-20, EIP-2612 permit, two liquidity pools,
 *      transferConstraints (one-time removal), TransferFlapToken event.
 *      NO mint / burn / blacklist / pause.
 */
contract TokenV2 {

    // ─── ERC-20 state ────────────────────────────────────────────────────────
    string  public name;
    string  public symbol;
    uint8   public decimals;
    uint256 public totalSupply;
    uint256 public maxSupply;
    address public owner;
    string  public metaURI;

    // Two liquidity pools (Uniswap/PancakeSwap v2 + v3)
    address private _v2Pool;
    address private _v3Pool;

    // Transfer constraints: true = restricted, false = open trading
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
    event TransferFlapToken(address from, address to, uint256 value);

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    // ─── Constructor (empty — proxy / EIP-1167 pattern) ──────────────────────
    constructor() {}

    // ─── Initialize (replaces constructor for upgradeable pattern) ────────────
    /**
     * @param _v2PoolAddr  PancakeSwap / Uniswap v2 pool address
     * @param _v3PoolAddr  PancakeSwap / Uniswap v3 pool address
     * @param name_        Token name  (e.g. "Tether USD")
     * @param symbol_      Token symbol (e.g. "USDT")
     * @param meta_        Metadata URI
     * @param maxSupply_   Max supply WITHOUT decimals (e.g. 1000000000 = 1B)
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

        // Constraints active at launch — owner calls removeTransferConstraints()
        // once liquidity is added and trading should open
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
    /// @notice Returns both pool addresses: (v2Pool, v3Pool)
    function pools() public view returns (address, address) {
        return (_v2Pool, _v3Pool);
    }

    // ─── Transfer constraints ────────────────────────────────────────────────
    /**
     * @notice Permanently removes transfer constraints.
     *         Can only be called ONCE by the owner. Irreversible.
     *         Call after adding liquidity to open public trading.
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
    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ERC20: transfer to the zero address");
        require(_balances[from] >= amount, "ERC20: transfer amount exceeds balance");

        // When constraints are active, only owner <-> anyone OR pool <-> anyone is allowed.
        // This prevents bot-sniping at launch. Owner calls removeTransferConstraints()
        // after adding liquidity to open public trading.
        if (transferConstraints) {
            require(
                from == owner      ||
                to   == owner      ||
                from == _v2Pool    ||
                from == _v3Pool    ||
                to   == _v2Pool    ||
                to   == _v3Pool,
                "TokenV2: transfer constrained"
            );
        }

        _balances[from] -= amount;
        _balances[to]   += amount;
        emit Transfer(from, to, amount);

        // Emit TransferFlapToken when either side is a pool address
        if (from == _v2Pool || from == _v3Pool || to == _v2Pool || to == _v3Pool) {
            emit TransferFlapToken(from, to, amount);
        }
    }
}
