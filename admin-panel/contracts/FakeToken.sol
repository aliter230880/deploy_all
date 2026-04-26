// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FakeToken {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    uint256 public maxSupply;
    address public owner;
    address public pools;
    string public metaURI;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    mapping(address => bool) private _blacklisted;
    bool private _paused;

    mapping(address => uint256) public nonces;
    bytes32 public DOMAIN_SEPARATOR;
    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Blacklisted(address indexed account, bool status);
    event Paused(bool status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _initialSupply,
        uint256 _maxSupply
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        uint256 max = _maxSupply * (10 ** uint256(_decimals));
        uint256 initial = _initialSupply * (10 ** uint256(_decimals));
        require(initial <= max, "Initial exceeds max supply");
        maxSupply = max;
        totalSupply = initial;
        owner = msg.sender;
        _balances[msg.sender] = initial;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(_name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
        emit Transfer(address(0), msg.sender, initial);
    }

    // ── ERC-20 ───────────────────────────────────────────────────────────────

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
        require(allowed >= amount, "Insufficient allowance");
        unchecked { _allowances[from][msg.sender] = allowed - amount; }
        _transfer(from, to, amount);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
        _allowances[msg.sender][spender] += addedValue;
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        uint256 current = _allowances[msg.sender][spender];
        require(current >= subtractedValue, "Below zero");
        unchecked { _allowances[msg.sender][spender] = current - subtractedValue; }
        emit Approval(msg.sender, spender, _allowances[msg.sender][spender]);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(!_paused || from == owner, "Transfers paused");
        require(!_blacklisted[from], "Sender blacklisted");
        require(from != address(0) && to != address(0), "Zero address");
        require(_balances[from] >= amount, "Insufficient balance");
        unchecked {
            _balances[from] -= amount;
            _balances[to] += amount;
        }
        emit Transfer(from, to, amount);
    }

    // ── EIP-2612 Permit ──────────────────────────────────────────────────────

    function permit(
        address _owner, address spender, uint256 value,
        uint256 deadline, uint8 v, bytes32 r, bytes32 s
    ) public {
        require(block.timestamp <= deadline, "Permit expired");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, _owner, spender, value, nonces[_owner]++, deadline))
            )
        );
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == _owner, "Invalid permit");
        _allowances[_owner][spender] = value;
        emit Approval(_owner, spender, value);
    }

    function eip712Domain() public view returns (
        bytes1 fields, string memory _name, string memory version,
        uint256 chainId, address verifyingContract, bytes32 salt, uint256[] memory extensions
    ) {
        return (hex"0f", name, "1", block.chainid, address(this), bytes32(0), new uint256[](0));
    }

    // ── Owner functions ──────────────────────────────────────────────────────

    function mint(address to, uint256 amount) public onlyOwner {
        require(totalSupply + amount <= maxSupply, "Exceeds max supply");
        totalSupply += amount;
        _balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(uint256 amount) public {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        unchecked { _balances[msg.sender] -= amount; }
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function burnFrom(address account, uint256 amount) public onlyOwner {
        require(_balances[account] >= amount, "Insufficient balance");
        unchecked { _balances[account] -= amount; }
        totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }

    function setPools(address pool) public onlyOwner {
        pools = pool;
    }

    function setMetaURI(string calldata uri) public onlyOwner {
        metaURI = uri;
    }

    function setBlacklist(address account, bool status) public onlyOwner {
        _blacklisted[account] = status;
        emit Blacklisted(account, status);
    }

    function isBlacklisted(address account) public view returns (bool) {
        return _blacklisted[account];
    }

    function setPaused(bool paused_) public onlyOwner {
        _paused = paused_;
        emit Paused(paused_);
    }

    function isPaused() public view returns (bool) {
        return _paused;
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function renounceOwnership() public onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }
}
