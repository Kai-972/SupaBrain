// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title BrainVault: the policy sits at the money.
/// @notice Agents never hold funds. The only way to move the vault's token is `pay`, which checks on chain:
///   1. the caller still owns its live ENSv2 subname (`registry.getOwner(labelhash) == msg.sender`);
///   2. the agent is not paused;
///   3. a fresh, unused EIP-712 attestation from the policy signer covers this exact payment;
///   4. none of the payment's lineage roots is revoked;
///   5. the owner-set daily ceiling is not exceeded.
/// The guardian can only tighten (revoke a root, pause an agent). Only the owner can loosen or withdraw.
/// Skipping the off-chain server does not help an attacker: every check above lives here.
/// @dev Worst case with every server key stolen (agents + policy signer + guardian): the loss is bounded by the
///      owner-set ceilings, i.e. sum(dailyCeiling) per UTC day. Because the ceiling rolls at UTC midnight (not a
///      rolling 24 h window), up to 2x that can move across a midnight boundary. The owner stops it with
///      `pauseAgent` / `removeAgent` / `setPolicySigner`.
contract BrainVault is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Payment {
        address agent;
        address payee;
        uint256 amount;
        bytes32[] roots; // keccak256(utf8(rootId)) of every lineage root behind the payee
        bytes32 intentId;
        uint64 deadline;
        bool humanApproved; // a validated World approval was bound to this intent (recorded, signed)
    }

    struct Agent {
        IAgentRegistry registry; // the team's ENSv2 UserRegistry
        uint64 day; // UTC day index of `spentToday`
        bool paused;
        uint256 labelhash;
        uint128 dailyCeiling;
        uint128 spentToday;
    }

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(address agent,address payee,uint256 amount,bytes32[] roots,bytes32 intentId,uint64 deadline,bool humanApproved)"
    );

    IERC20 public immutable token;
    uint256 public immutable MAX_ROOTS;

    address public owner;
    address public pendingOwner;
    address public guardian;
    address public policySigner;

    mapping(address wallet => Agent) internal _agents;
    mapping(bytes32 root => bool) public revokedRoot;
    mapping(bytes32 intentId => bool) public usedIntent;

    // ---- errors ----
    error NotOwner();
    error NotPendingOwner();
    error NotOwnerOrGuardian();
    error ZeroAddress();
    error NotAgentCaller();
    error AgentUnknown();
    error AgentNotRegistered();
    error AgentPaused();
    error InvalidPayment();
    error Expired();
    error Replay();
    error TooManyRoots();
    error RootRevoked(bytes32 root);
    error BadAttestation();
    error OverDailyCeiling();

    // ---- events ----
    event Paid(
        address indexed agent,
        address indexed payee,
        uint256 amount,
        bytes32 indexed intentId,
        bytes32[] roots,
        bool humanApproved
    );
    event AgentSet(address indexed wallet, address indexed registry, uint256 labelhash, uint128 dailyCeiling);
    event AgentRemoved(address indexed wallet);
    event AgentPausedBy(address indexed wallet, address indexed by);
    event AgentUnpaused(address indexed wallet);
    event RootRevokedBy(bytes32 indexed root, address indexed by);
    event RootUnrevoked(bytes32 indexed root);
    event PolicySignerSet(address indexed signer);
    event GuardianSet(address indexed guardian);
    event IntentCancelled(bytes32 indexed intentId, address indexed by);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert NotOwnerOrGuardian();
        _;
    }

    /// @param token_ the payment token (Circle test USDC on Sepolia; address comes from config)
    /// @param name_ / version_ the EIP-712 domain name and version (from config)
    constructor(
        IERC20 token_,
        address owner_,
        address guardian_,
        address policySigner_,
        uint256 maxRoots_,
        string memory name_,
        string memory version_
    ) EIP712(name_, version_) {
        if (address(token_) == address(0) || owner_ == address(0) || policySigner_ == address(0)) {
            revert ZeroAddress();
        }
        token = token_;
        MAX_ROOTS = maxRoots_;
        owner = owner_;
        guardian = guardian_;
        policySigner = policySigner_;
        emit OwnershipTransferred(address(0), owner_);
        emit GuardianSet(guardian_);
        emit PolicySignerSet(policySigner_);
    }

    // =====================================================================
    // pay
    // =====================================================================

    /// @notice Pay `p.amount` of the vault token to `p.payee`. Must be sent by the agent wallet itself.
    function pay(Payment calldata p, bytes calldata signature) external nonReentrant {
        if (msg.sender != p.agent) revert NotAgentCaller();

        Agent storage a = _agents[msg.sender];
        if (address(a.registry) == address(0)) revert AgentUnknown();
        // ENS kill switch, checked before `paused` so the on-chain revert names ENS.
        if (a.registry.getOwner(a.labelhash) != msg.sender) revert AgentNotRegistered();
        if (a.paused) revert AgentPaused();

        if (p.amount == 0 || p.payee == address(0)) revert InvalidPayment();
        if (block.timestamp > p.deadline) revert Expired();
        if (usedIntent[p.intentId]) revert Replay();

        uint256 n = p.roots.length;
        if (n > MAX_ROOTS) revert TooManyRoots();
        for (uint256 i; i < n; ++i) {
            if (revokedRoot[p.roots[i]]) revert RootRevoked(p.roots[i]);
        }

        (address recovered, ECDSA.RecoverError err,) =
            ECDSA.tryRecoverCalldata(_hashTypedDataV4(_structHash(p)), signature);
        if (err != ECDSA.RecoverError.NoError || recovered != policySigner) revert BadAttestation();

        uint64 today = _today();
        uint256 spent = a.day == today ? a.spentToday : 0;
        // overflow-safe form of `spent + amount > ceiling` (also holds if the owner lowered the ceiling below spent)
        if (p.amount > a.dailyCeiling || spent > a.dailyCeiling - p.amount) revert OverDailyCeiling();

        // effects
        usedIntent[p.intentId] = true;
        a.day = today;
        a.spentToday = uint128(spent + p.amount); // <= dailyCeiling (uint128), cannot truncate

        // interaction
        token.safeTransfer(p.payee, p.amount);
        emit Paid(msg.sender, p.payee, p.amount, p.intentId, p.roots, p.humanApproved);
    }

    // =====================================================================
    // owner | guardian: tighten only
    // =====================================================================

    function revokeRoot(bytes32 root) external onlyOwnerOrGuardian {
        revokedRoot[root] = true;
        emit RootRevokedBy(root, msg.sender);
    }

    function pauseAgent(address wallet) external onlyOwnerOrGuardian {
        if (address(_agents[wallet].registry) == address(0)) revert AgentUnknown();
        _agents[wallet].paused = true;
        emit AgentPausedBy(wallet, msg.sender);
    }

    /// @notice Burn one signed-but-unused attestation (e.g. a payment cancelled after approval was signed).
    function cancelIntent(bytes32 intentId) external onlyOwnerOrGuardian {
        usedIntent[intentId] = true;
        emit IntentCancelled(intentId, msg.sender);
    }

    // =====================================================================
    // owner only: loosen, configure, withdraw
    // =====================================================================

    function setAgent(address wallet, IAgentRegistry registry, uint256 labelhash, uint128 dailyCeiling)
        external
        onlyOwner
    {
        if (wallet == address(0) || address(registry) == address(0)) revert ZeroAddress();
        Agent storage a = _agents[wallet];
        a.registry = registry;
        a.labelhash = labelhash;
        a.dailyCeiling = dailyCeiling;
        emit AgentSet(wallet, address(registry), labelhash, dailyCeiling);
    }

    /// @dev Keeps `day`, `spentToday` and `paused` as a tombstone, so remove + re-add on the same day neither
    ///      grants a fresh ceiling nor silently clears a guardian pause.
    function removeAgent(address wallet) external onlyOwner {
        Agent storage a = _agents[wallet];
        if (address(a.registry) == address(0)) revert AgentUnknown();
        a.registry = IAgentRegistry(address(0));
        a.labelhash = 0;
        a.dailyCeiling = 0;
        emit AgentRemoved(wallet);
    }

    function unpauseAgent(address wallet) external onlyOwner {
        if (address(_agents[wallet].registry) == address(0)) revert AgentUnknown();
        _agents[wallet].paused = false;
        emit AgentUnpaused(wallet);
    }

    function unrevokeRoot(bytes32 root) external onlyOwner {
        revokedRoot[root] = false;
        emit RootUnrevoked(root);
    }

    function setPolicySigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        policySigner = signer;
        emit PolicySignerSet(signer);
    }

    /// @dev address(0) disables the guardian.
    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    /// @notice Two-step: `newOwner` must call `acceptOwnership`, so a typo can't brick owner powers.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    // =====================================================================
    // views
    // =====================================================================

    function agentOf(address wallet) external view returns (Agent memory) {
        return _agents[wallet];
    }

    /// @notice Spent today (UTC) by `wallet`, already rolled over at midnight.
    function spentToday(address wallet) external view returns (uint256) {
        Agent storage a = _agents[wallet];
        return a.day == _today() ? a.spentToday : 0;
    }

    /// @notice The EIP-712 digest the policy signer must sign for `p` (for off-chain cross-checks).
    function paymentDigest(Payment calldata p) external view returns (bytes32) {
        return _hashTypedDataV4(_structHash(p));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // =====================================================================
    // internal
    // =====================================================================

    function _structHash(Payment calldata p) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PAYMENT_TYPEHASH,
                p.agent,
                p.payee,
                p.amount,
                keccak256(abi.encodePacked(p.roots)),
                p.intentId,
                p.deadline,
                p.humanApproved
            )
        );
    }

    function _today() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }
}
