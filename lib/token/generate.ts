import { featuresOf, groupDigits, MAX_BATCH, MAX_TIMED_SECONDS, MIN_TIMED_SECONDS, type TokenConfig } from "./schema";

/** Compiler that Tronscan offers for verification (TRON fork of solc). */
export const COMPILER = {
  version: "0.8.20",
  longVersion: "0.8.20+commit.5f1834b",
  // NB: TRON's list.json advertises "soljson_v0.8.20+commit.5f1834b.js", but that path 404s;
  // the file actually published on the mirror is named without the commit suffix.
  file: "soljson_v0.8.20.js",
  baseUrl: "https://tronsuper.github.io/tron-solc-bin/bin/",
  optimizer: { enabled: true, runs: 200 },
  license: "MIT",
} as const;

export const DISCLAIMER =
  "This is an independent token. It is NOT USDT, NOT affiliated with Tether, and has no guaranteed value.";

export function contractName(cfg: Pick<TokenConfig, "symbol">): string {
  return `${cfg.symbol}Token`;
}

export function sourceFileName(cfg: Pick<TokenConfig, "symbol">): string {
  return `${contractName(cfg)}.sol`;
}

/**
 * Builds a single-file, import-free TRC-20 contract. Inputs must already be
 * validated by `tokenConfigSchema` (strict charset, so they are safe to embed).
 *
 * With every optional feature off, the output is byte-identical to the original
 * fixed-supply template (so earlier deployments still verify).
 */
export function generateContract(cfg: TokenConfig): string {
  const c = contractName(cfg);
  const pretty = groupDigits(cfg.supply);
  const f = featuresOf(cfg);
  const amount = `${cfg.supply} * 10 ** ${cfg.decimals}`;

  const supplyDecl = f.burn
    ? `    uint256 private constant _INITIAL_SUPPLY = ${amount};
    uint256 private _totalSupply;`
    : `    uint256 private constant _TOTAL_SUPPLY = ${amount};`;

  const ctor = f.burn
    ? `    constructor() {
        _totalSupply = _INITIAL_SUPPLY;
        _balances[msg.sender] = _INITIAL_SUPPLY;
        emit Transfer(address(0), msg.sender, _INITIAL_SUPPLY);
    }`
    : `    constructor() {
        _balances[msg.sender] = _TOTAL_SUPPLY;
        emit Transfer(address(0), msg.sender, _TOTAL_SUPPLY);
    }`;

  const totalSupplyFn = f.burn
    ? `    /// @notice Current supply: starts at the initial supply and can only decrease (burns).
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }`
    : `    function totalSupply() external pure returns (uint256) {
        return _TOTAL_SUPPLY;
    }`;

  const erc165Fn = f.erc165
    ? `

    // ------------------------------------------------------------------
    // Introspection (ERC-165)
    // ------------------------------------------------------------------

    /// @notice ERC-165: supports ERC-165 (0x01ffc9a7) and the ERC-20 / TRC-20 interface (0x36372b07).
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x36372b07;
    }`
    : "";

  const burnFns = f.burn
    ? `

    // ------------------------------------------------------------------
    // Burning (holders only, no admin)
    // ------------------------------------------------------------------

    /// @notice Destroys \`value\` of the caller's own tokens, permanently reducing total supply.
    function burn(uint256 value) external returns (bool) {
        _burn(msg.sender, value);
        return true;
    }

    /// @notice Destroys \`value\` tokens from \`account\`, spending the caller's allowance.
    function burnFrom(address account, uint256 value) external returns (bool) {
        _spendAllowance(account, msg.sender, value);
        _burn(account, value);
        return true;
    }`
    : "";

  const batchFn = f.batch
    ? `

    // ------------------------------------------------------------------
    // Batch transfers (airdrops)
    // ------------------------------------------------------------------

    /// @notice Sends \`values[i]\` of the caller's tokens to \`recipients[i]\` for every i.
    /// @dev All-or-nothing: if any single transfer fails, the whole batch reverts. 1-${MAX_BATCH} recipients.
    function batchTransfer(address[] calldata recipients, uint256[] calldata values) external returns (bool) {
        uint256 n = recipients.length;
        require(n == values.length, "TRC20: recipients and values length mismatch");
        require(n > 0 && n <= ${MAX_BATCH}, "TRC20: batch size must be 1-${MAX_BATCH}");
        for (uint256 i = 0; i < n; ) {
            _transfer(msg.sender, recipients[i], values[i]);
            unchecked {
                ++i;
            }
        }
        return true;
    }`
    : "";

  const timedFns = f.timed
    ? `

    // ------------------------------------------------------------------
    // Timed sends (send with an expiry, no admin)
    // ------------------------------------------------------------------
    // The tokens wait in this contract (visible as balanceOf(<this contract>)). Before the
    // expiry only the recipient can claim them; after it only the sender can take them back.
    // Nobody else can touch them, and claimed tokens are ordinary tokens that never expire.

    /// @dev status: 1 = pending, 2 = claimed by the recipient, 3 = reclaimed by the sender.
    struct TimedTransfer {
        address from;
        uint64 expiresAt;
        uint8 status;
        address to;
        uint256 value;
    }

    uint256 private constant _MIN_TIMED_DURATION = ${MIN_TIMED_SECONDS};
    uint256 private constant _MAX_TIMED_DURATION = ${MAX_TIMED_SECONDS};
    TimedTransfer[] private _timedSends;

    event TimedSendCreated(uint256 indexed id, address indexed from, address indexed to, uint256 value, uint256 expiresAt);
    event TimedSendClaimed(uint256 indexed id);
    event TimedSendReclaimed(uint256 indexed id);

    /// @notice Locks \`value\` of the caller's tokens for \`to\`, who can claim them for \`duration\` seconds
    ///         (${MIN_TIMED_SECONDS} s to 365 days). If unclaimed by then, the caller can reclaim them.
    function sendTimed(address to, uint256 value, uint256 duration) external returns (uint256 id) {
        require(to != address(0), "TRC20: transfer to the zero address");
        require(to != address(this), "TRC20: transfer to the token contract");
        require(value > 0, "TRC20: timed send of zero");
        require(duration >= _MIN_TIMED_DURATION && duration <= _MAX_TIMED_DURATION, "TRC20: duration must be 60 seconds to 365 days");
        uint256 fromBalance = _balances[msg.sender];
        require(fromBalance >= value, "TRC20: transfer amount exceeds balance");
        unchecked {
            _balances[msg.sender] = fromBalance - value;
            _balances[address(this)] += value;
        }
        uint64 expiresAt = uint64(block.timestamp + duration);
        id = _timedSends.length;
        _timedSends.push(TimedTransfer(msg.sender, expiresAt, 1, to, value));
        emit Transfer(msg.sender, address(this), value);
        emit TimedSendCreated(id, msg.sender, to, value, expiresAt);
    }

    /// @notice Recipient takes the tokens of timed send \`id\` before it expires.
    function claimTimed(uint256 id) external returns (bool) {
        TimedTransfer storage t = _pendingTimed(id);
        require(msg.sender == t.to, "TRC20: only the recipient can claim");
        require(block.timestamp < t.expiresAt, "TRC20: timed send has expired");
        t.status = 2;
        _releaseTimed(t.to, t.value);
        emit TimedSendClaimed(id);
        return true;
    }

    /// @notice Sender takes back the tokens of timed send \`id\` once it has expired unclaimed.
    function reclaimTimed(uint256 id) external returns (bool) {
        TimedTransfer storage t = _pendingTimed(id);
        require(msg.sender == t.from, "TRC20: only the sender can reclaim");
        require(block.timestamp >= t.expiresAt, "TRC20: timed send has not expired yet");
        t.status = 3;
        _releaseTimed(t.from, t.value);
        emit TimedSendReclaimed(id);
        return true;
    }

    function timedSendCount() external view returns (uint256) {
        return _timedSends.length;
    }

    function timedSend(uint256 id) external view returns (address from, address to, uint256 value, uint256 expiresAt, uint8 status) {
        require(id < _timedSends.length, "TRC20: unknown timed send");
        TimedTransfer storage t = _timedSends[id];
        return (t.from, t.to, t.value, t.expiresAt, t.status);
    }

    function _pendingTimed(uint256 id) private view returns (TimedTransfer storage t) {
        require(id < _timedSends.length, "TRC20: unknown timed send");
        t = _timedSends[id];
        require(t.status == 1, "TRC20: timed send already settled");
    }

    function _releaseTimed(address to, uint256 value) private {
        unchecked {
            // Cannot underflow: this contract's balance is exactly the sum of all pending timed sends
            // (_transfer refuses this contract as a recipient and it never approves anyone).
            _balances[address(this)] -= value;
            _balances[to] += value;
        }
        emit Transfer(address(this), to, value);
    }`
    : "";

  const burnInternal = f.burn
    ? `

    function _burn(address account, uint256 value) private {
        require(account != address(0), "TRC20: burn from the zero address");
        uint256 accountBalance = _balances[account];
        require(accountBalance >= value, "TRC20: burn amount exceeds balance");
        unchecked {
            // Cannot underflow: totalSupply is always >= any single balance.
            _balances[account] = accountBalance - value;
            _totalSupply -= value;
        }
        emit Transfer(account, address(0), value);
    }`
    : "";

  const extrasDoc = [
    f.burn && " *  - burn / burnFrom: holders can destroy their own tokens (supply only goes down).",
    f.batch && ` *  - batchTransfer: send to up to ${MAX_BATCH} wallets in one transaction (airdrops).`,
    f.erc165 && " *  - supportsInterface: ERC-165 interface detection.",
    f.timed && " *  - sendTimed / claimTimed / reclaimTimed: send with an expiry; unclaimed tokens return to the sender.",
  ]
    .filter(Boolean)
    .map((l) => `\n${l}`)
    .join("");

  return `// SPDX-License-Identifier: ${COMPILER.license}
pragma solidity ${COMPILER.version};

/*
 * ${DISCLAIMER}
 */

/**
 * @title  ${cfg.name} (${cfg.symbol})
 * @notice Fixed-supply TRC-20 token for the TRON network.
 *
 *  - Total supply: ${pretty} ${cfg.symbol} (${cfg.decimals} decimals), minted once to the deployer.
 *  - No mint function: the supply can never increase after deployment.${extrasDoc}
 *  - No owner or admin: nobody can pause, freeze, blacklist or seize balances.
 *  - Arithmetic is overflow-checked by Solidity >= 0.8; balance and allowance
 *    checks are explicit require() guards (OpenZeppelin-style safe math).
 *
 * @dev Single file with no imports, so it can be verified on Tronscan as-is.
 *      Compiler: TRON solc ${COMPILER.longVersion}, optimizer on, ${COMPILER.optimizer.runs} runs.
 */
contract ${c} {
    string private constant _NAME = "${cfg.name}";
    string private constant _SYMBOL = "${cfg.symbol}";
    uint8 private constant _DECIMALS = ${cfg.decimals};
${supplyDecl}

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    /// @notice Emitted when \`value\` tokens move from \`from\` to \`to\` (from = 0 on creation).
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Emitted when \`owner\` sets the allowance of \`spender\` to \`value\`.
    event Approval(address indexed owner, address indexed spender, uint256 value);

${ctor}

    // ------------------------------------------------------------------
    // Metadata
    // ------------------------------------------------------------------

    function name() external pure returns (string memory) {
        return _NAME;
    }

    function symbol() external pure returns (string memory) {
        return _SYMBOL;
    }

    function decimals() external pure returns (uint8) {
        return _DECIMALS;
    }

${totalSupplyFn}${erc165Fn}

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    // ------------------------------------------------------------------
    // TRC-20 actions
    // ------------------------------------------------------------------

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    /// @dev To change a non-zero allowance safely, prefer increaseAllowance /
    ///      decreaseAllowance, or set it to 0 first (avoids the approve race).
    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        _spendAllowance(from, msg.sender, value);
        _transfer(from, to, value);
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender] + addedValue);
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        uint256 current = _allowances[msg.sender][spender];
        require(current >= subtractedValue, "TRC20: decreased allowance below zero");
        unchecked {
            _approve(msg.sender, spender, current - subtractedValue);
        }
        return true;
    }${burnFns}${batchFn}${timedFns}

    // ------------------------------------------------------------------
    // Internal logic
    // ------------------------------------------------------------------

    function _transfer(address from, address to, uint256 value) private {
        require(from != address(0), "TRC20: transfer from the zero address");
        require(to != address(0), "TRC20: transfer to the zero address");
        require(to != address(this), "TRC20: transfer to the token contract");

        uint256 fromBalance = _balances[from];
        require(fromBalance >= value, "TRC20: transfer amount exceeds balance");
        unchecked {
            // Cannot underflow (checked above) and cannot overflow:
            // the sum of all balances is bounded by the fixed total supply.
            _balances[from] = fromBalance - value;
            _balances[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _approve(address owner, address spender, uint256 value) private {
        require(owner != address(0), "TRC20: approve from the zero address");
        require(spender != address(0), "TRC20: approve to the zero address");
        _allowances[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    function _spendAllowance(address owner, address spender, uint256 value) private {
        uint256 current = _allowances[owner][spender];
        if (current != type(uint256).max) {
            require(current >= value, "TRC20: insufficient allowance");
            unchecked {
                _approve(owner, spender, current - value);
            }
        }
    }${burnInternal}
}
`;
}

/** Standard-JSON compiler input matching the Tronscan verification settings. */
export function compilerInput(cfg: TokenConfig): string {
  return JSON.stringify({
    language: "Solidity",
    sources: { [sourceFileName(cfg)]: { content: generateContract(cfg) } },
    settings: {
      optimizer: COMPILER.optimizer,
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  });
}
