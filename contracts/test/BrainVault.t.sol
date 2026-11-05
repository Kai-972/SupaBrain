// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BrainVault} from "../src/BrainVault.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {MockAgentRegistry} from "./mocks/MockAgentRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// Shared setup + helpers (no tests here, so suites that inherit it don't re-run the base tests).
abstract contract BrainVaultFixture is Test {
    // test-only values (unit tests never touch real config)
    string constant NAME = "BrainVault";
    string constant VERSION = "1";
    uint256 constant MAX_ROOTS = 8;
    uint256 constant USDC = 1e6;

    bytes32 constant PAYMENT_TYPEHASH = keccak256(
        "Payment(address agent,address payee,uint256 amount,bytes32[] roots,bytes32 intentId,uint64 deadline,bool humanApproved)"
    );

    MockUSDC usdc;
    MockAgentRegistry registry;
    BrainVault vault;

    address owner = makeAddr("owner");
    address guardian = makeAddr("guardian");
    uint256 policyKey;
    address policySigner;
    address agent = makeAddr("lead-claude");
    address other = makeAddr("gem-research");
    address payee = makeAddr("acme");
    uint256 constant AGENT_LABELHASH = uint256(keccak256("lead-claude"));
    uint256 constant OTHER_LABELHASH = uint256(keccak256("gem-research"));
    bytes32 constant ROOT_H1 = keccak256("0xH1");
    bytes32 constant ROOT_EMAIL = keccak256("email:acme-0611");

    uint256 nonce;

    function setUp() public {
        vm.warp(1_762_400_000); // a fixed "now" for readable expiries
        (policySigner, policyKey) = makeAddrAndKey("policy");
        usdc = new MockUSDC();
        registry = new MockAgentRegistry();
        vault = new BrainVault(usdc, owner, guardian, policySigner, MAX_ROOTS, NAME, VERSION);

        registry.register(AGENT_LABELHASH, agent, uint64(block.timestamp + 7 days));
        registry.register(OTHER_LABELHASH, other, uint64(block.timestamp + 7 days));

        vm.startPrank(owner);
        vault.setAgent(agent, IAgentRegistry(address(registry)), AGENT_LABELHASH, uint128(30 * USDC));
        vault.setAgent(other, IAgentRegistry(address(registry)), OTHER_LABELHASH, uint128(4 * USDC));
        vm.stopPrank();

        usdc.mint(address(vault), 100 * USDC);
    }

    // ---------- helpers ----------

    function _roots1() internal pure returns (bytes32[] memory r) {
        r = new bytes32[](1);
        r[0] = ROOT_H1;
    }

    function _payment(address a, uint256 amount) internal returns (BrainVault.Payment memory p) {
        p = BrainVault.Payment({
            agent: a,
            payee: payee,
            amount: amount,
            roots: _roots1(),
            intentId: keccak256(abi.encode("intent", nonce++)),
            deadline: uint64(block.timestamp + 300),
            humanApproved: false
        });
    }

    /// Independent EIP-712 digest (does not trust the vault's own helper).
    function _digest(BrainVault.Payment memory p, address verifyingContract) internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                block.chainid,
                verifyingContract
            )
        );
        bytes32 structHash = keccak256(
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
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _sign(BrainVault.Payment memory p, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(p, address(vault)));
        return abi.encodePacked(r, s, v);
    }

    function _sign(BrainVault.Payment memory p) internal view returns (bytes memory) {
        return _sign(p, policyKey);
    }
}

contract BrainVaultTest is BrainVaultFixture {
    // ---------- happy path ----------

    function test_pay_happyPath_transfersExactAmount() public {
        BrainVault.Payment memory p = _payment(agent, 3 * USDC);
        uint256 before = usdc.balanceOf(payee);
        uint256 vaultBefore = usdc.balanceOf(address(vault));

        vm.expectEmit(true, true, true, true, address(vault));
        emit BrainVault.Paid(agent, payee, 3 * USDC, p.intentId, p.roots, false);
        vm.prank(agent);
        vault.pay(p, _sign(p));

        assertEq(usdc.balanceOf(payee) - before, 3 * USDC, "payee +amount");
        assertEq(vaultBefore - usdc.balanceOf(address(vault)), 3 * USDC, "vault -amount");
        assertEq(vault.spentToday(agent), 3 * USDC);
        assertTrue(vault.usedIntent(p.intentId));
    }

    function test_pay_digestMatchesIndependentEncoding() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        assertEq(vault.paymentDigest(p), _digest(p, address(vault)));
    }

    // ---------- ENS kill switch ----------

    function test_pay_revertsWhenEnsNameUnregistered() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p); // signed while still registered
        registry.unregister(AGENT_LABELHASH);
        vm.prank(agent);
        vm.expectRevert(BrainVault.AgentNotRegistered.selector);
        vault.pay(p, sig);
    }

    function test_pay_revertsWhenLeaseExpired() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        p.deadline = uint64(block.timestamp + 8 days);
        bytes memory sig = _sign(p);
        vm.warp(block.timestamp + 7 days); // expiry == now counts as expired (ENSv2 semantics)
        vm.prank(agent);
        vm.expectRevert(BrainVault.AgentNotRegistered.selector);
        vault.pay(p, sig);
    }

    function test_pay_revertsWhenEnsNameTransferredAway() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        registry.register(AGENT_LABELHASH, makeAddr("attacker"), uint64(block.timestamp + 7 days));
        vm.prank(agent);
        vm.expectRevert(BrainVault.AgentNotRegistered.selector);
        vault.pay(p, sig);
    }

    function test_pay_unregisteredIsReportedBeforePaused() public {
        vm.prank(guardian);
        vault.pauseAgent(agent);
        registry.unregister(AGENT_LABELHASH);
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.prank(agent);
        vm.expectRevert(BrainVault.AgentNotRegistered.selector);
        vault.pay(p, sig);
    }

    // ---------- caller / agent checks ----------

    function test_pay_revertsForNonAgentCaller() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.prank(makeAddr("server"));
        vm.expectRevert(BrainVault.NotAgentCaller.selector);
        vault.pay(p, sig);
    }

    function test_pay_revertsForUnknownAgent() public {
        address stranger = makeAddr("stranger");
        BrainVault.Payment memory p = _payment(stranger, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.prank(stranger);
        vm.expectRevert(BrainVault.AgentUnknown.selector);
        vault.pay(p, sig);
    }

    function test_pay_revertsWhenPaused() public {
        vm.prank(guardian);
        vault.pauseAgent(agent);
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.prank(agent);
        vm.expectRevert(BrainVault.AgentPaused.selector);
        vault.pay(p, sig);
    }

    // ---------- attestation ----------

    function test_pay_revertsForBadSigner() public {
        (, uint256 wrongKey) = makeAddrAndKey("not-policy");
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p, wrongKey);
        vm.prank(agent);
        vm.expectRevert(BrainVault.BadAttestation.selector);
        vault.pay(p, sig);
    }

    function test_pay_revertsWhenAmountTampered() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        p.amount = 2 * USDC;
        vm.prank(agent);
        vm.expectRevert(BrainVault.BadAttestation.selector);
        vault.pay(p, sig);
    }

    function test_pay_revertsWhenPayeeTampered() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        p.payee = makeAddr("0xBAD");
        vm.prank(agent);
        vm.expectRevert(BrainVault.BadAttestation.selector);
        vault.pay(p, sig);
    }

    function test_pay_revertsWhenRootsStripped() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        p.roots = new bytes32[](0); // dropping a (possibly revoked) root must break the signature
        vm.prank(agent);
        vm.expectRevert(BrainVault.BadAttestation.selector);
        vault.pay(p, sig);
    }

    function test_pay_revertsForSignatureBoundToOtherVault() public {
        BrainVault other_ = new BrainVault(usdc, owner, guardian, policySigner, MAX_ROOTS, NAME, VERSION);
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(policyKey, _digest(p, address(other_)));
        vm.prank(agent);
        vm.expectRevert(BrainVault.BadAttestation.selector);
        vault.pay(p, abi.encodePacked(r, s, v));
    }

    function test_pay_revertsOnReplay() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.startPrank(agent);
        vault.pay(p, sig);
        vm.expectRevert(BrainVault.Replay.selector);
        vault.pay(p, sig);
        vm.stopPrank();
    }

    function test_pay_revertsAfterDeadline() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.warp(p.deadline + 1);
        vm.prank(agent);
        vm.expectRevert(BrainVault.Expired.selector);
        vault.pay(p, sig);
    }

    function test_pay_allowsExactlyAtDeadline() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.warp(p.deadline);
        vm.prank(agent);
        vault.pay(p, sig);
    }

    function test_pay_revertsForZeroAmountOrPayee() public {
        BrainVault.Payment memory p = _payment(agent, 0);
        bytes memory sig = _sign(p);
        vm.prank(agent);
        vm.expectRevert(BrainVault.InvalidPayment.selector);
        vault.pay(p, sig);

        p = _payment(agent, 1 * USDC);
        p.payee = address(0);
        sig = _sign(p);
        vm.prank(agent);
        vm.expectRevert(BrainVault.InvalidPayment.selector);
        vault.pay(p, sig);
    }

    // ---------- revoked roots ----------

    function test_pay_revertsWhenRootRevoked() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes32[] memory roots = new bytes32[](2);
        roots[0] = ROOT_H1;
        roots[1] = ROOT_EMAIL;
        p.roots = roots;
        bytes memory sig = _sign(p);

        vm.prank(guardian);
        vault.revokeRoot(ROOT_EMAIL);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(BrainVault.RootRevoked.selector, ROOT_EMAIL));
        vault.pay(p, sig);
    }

    function test_pay_cleanRootsStillPayAfterUnrelatedRevoke() public {
        vm.prank(guardian);
        vault.revokeRoot(ROOT_EMAIL);
        BrainVault.Payment memory p = _payment(agent, 1 * USDC); // roots = [H1]
        bytes memory sig = _sign(p);
        vm.prank(agent);
        vault.pay(p, sig);
    }

    function test_pay_revertsForTooManyRoots() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes32[] memory roots = new bytes32[](MAX_ROOTS + 1);
        for (uint256 i; i < roots.length; i++) {
            roots[i] = keccak256(abi.encode(i));
        }
        p.roots = roots;
        bytes memory sig = _sign(p);
        vm.prank(agent);
        vm.expectRevert(BrainVault.TooManyRoots.selector);
        vault.pay(p, sig);
    }

    // ---------- daily ceiling ----------

    function test_pay_revertsOverDailyCeiling() public {
        BrainVault.Payment memory p1 = _payment(other, 3 * USDC);
        BrainVault.Payment memory p2 = _payment(other, 2 * USDC); // 3 + 2 > 4
        bytes memory s1 = _sign(p1);
        bytes memory s2 = _sign(p2);
        vm.startPrank(other);
        vault.pay(p1, s1);
        vm.expectRevert(BrainVault.OverDailyCeiling.selector);
        vault.pay(p2, s2);
        vm.stopPrank();
    }

    function test_pay_dailyCeilingRollsAtUtcMidnight() public {
        BrainVault.Payment memory p1 = _payment(other, 4 * USDC);
        bytes memory s1 = _sign(p1);
        vm.prank(other);
        vault.pay(p1, s1);
        assertEq(vault.spentToday(other), 4 * USDC);

        vm.warp((block.timestamp / 1 days + 1) * 1 days); // next UTC day
        assertEq(vault.spentToday(other), 0, "view rolls too");

        BrainVault.Payment memory p2 = _payment(other, 4 * USDC);
        bytes memory s2 = _sign(p2);
        vm.prank(other);
        vault.pay(p2, s2);
        assertEq(vault.spentToday(other), 4 * USDC);
    }

    function test_pay_zeroCeilingAgentCannotPay() public {
        address writer = makeAddr("gpt-writer");
        uint256 lh = uint256(keccak256("gpt-writer"));
        registry.register(lh, writer, uint64(block.timestamp + 7 days));
        vm.prank(owner);
        vault.setAgent(writer, IAgentRegistry(address(registry)), lh, 0);
        BrainVault.Payment memory p = _payment(writer, 1);
        bytes memory sig = _sign(p);
        vm.prank(writer);
        vm.expectRevert(BrainVault.OverDailyCeiling.selector);
        vault.pay(p, sig);
    }

    function testFuzz_pay_neverExceedsCeiling(uint64[6] memory amounts) public {
        uint256 ceiling = 4 * USDC;
        for (uint256 i; i < amounts.length; i++) {
            uint256 amt = bound(amounts[i], 1, 5 * USDC);
            BrainVault.Payment memory p = _payment(other, amt);
            bytes memory sig = _sign(p);
            uint256 spent = vault.spentToday(other);
            vm.prank(other);
            if (spent + amt > ceiling) {
                vm.expectRevert(BrainVault.OverDailyCeiling.selector);
                vault.pay(p, sig);
            } else {
                vault.pay(p, sig);
            }
            assertLe(vault.spentToday(other), ceiling);
        }
    }

    // ---------- roles: guardian can only tighten ----------

    function test_guardian_canRevokeAndPause() public {
        vm.startPrank(guardian);
        vault.revokeRoot(ROOT_EMAIL);
        vault.pauseAgent(agent);
        vm.stopPrank();
        assertTrue(vault.revokedRoot(ROOT_EMAIL));
        assertTrue(vault.agentOf(agent).paused);
    }

    function test_guardian_cannotLoosenOrWithdraw() public {
        vm.prank(guardian);
        vault.revokeRoot(ROOT_EMAIL);
        vm.prank(guardian);
        vault.pauseAgent(agent);

        vm.startPrank(guardian);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.unrevokeRoot(ROOT_EMAIL);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.unpauseAgent(agent);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.withdraw(guardian, 1);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.setAgent(guardian, IAgentRegistry(address(registry)), 1, type(uint128).max);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.setPolicySigner(guardian);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.setGuardian(guardian);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.removeAgent(agent);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.transferOwnership(guardian);
        vm.stopPrank();
    }

    function test_strangers_cannotTighten() public {
        vm.startPrank(makeAddr("stranger"));
        vm.expectRevert(BrainVault.NotOwnerOrGuardian.selector);
        vault.revokeRoot(ROOT_EMAIL);
        vm.expectRevert(BrainVault.NotOwnerOrGuardian.selector);
        vault.pauseAgent(agent);
        vm.stopPrank();
    }

    function test_agent_cannotAdministerItself() public {
        vm.startPrank(agent);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.setAgent(agent, IAgentRegistry(address(registry)), AGENT_LABELHASH, type(uint128).max);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.unpauseAgent(agent);
        vm.stopPrank();
    }

    function test_owner_canUnrevokeUnpauseAndWithdraw() public {
        vm.prank(guardian);
        vault.revokeRoot(ROOT_EMAIL);
        vm.prank(guardian);
        vault.pauseAgent(agent);

        vm.startPrank(owner);
        vault.unrevokeRoot(ROOT_EMAIL);
        vault.unpauseAgent(agent);
        vault.withdraw(owner, 10 * USDC);
        vm.stopPrank();

        assertFalse(vault.revokedRoot(ROOT_EMAIL));
        assertFalse(vault.agentOf(agent).paused);
        assertEq(usdc.balanceOf(owner), 10 * USDC);
    }

    function test_owner_rotatePolicySignerInvalidatesOldAttestations() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.prank(owner);
        vault.setPolicySigner(makeAddr("new-policy"));
        vm.prank(agent);
        vm.expectRevert(BrainVault.BadAttestation.selector);
        vault.pay(p, sig);
    }

    function test_owner_removeAgentBlocksPayments() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.prank(owner);
        vault.removeAgent(agent);
        vm.prank(agent);
        vm.expectRevert(BrainVault.AgentUnknown.selector);
        vault.pay(p, sig);
    }

    function test_owner_transferOwnership() public {
        address next = makeAddr("next-owner");
        vm.prank(owner);
        vault.transferOwnership(next);
        assertEq(vault.owner(), owner, "two-step: unchanged until accepted");
        vm.prank(makeAddr("typo"));
        vm.expectRevert(BrainVault.NotPendingOwner.selector);
        vault.acceptOwnership();
        vm.prank(next);
        vault.acceptOwnership();
        assertEq(vault.owner(), next);
        assertEq(vault.pendingOwner(), address(0));
        vm.prank(owner);
        vm.expectRevert(BrainVault.NotOwner.selector);
        vault.withdraw(owner, 1);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(BrainVault.ZeroAddress.selector);
        new BrainVault(usdc, address(0), guardian, policySigner, MAX_ROOTS, NAME, VERSION);
        vm.expectRevert(BrainVault.ZeroAddress.selector);
        new BrainVault(usdc, owner, guardian, address(0), MAX_ROOTS, NAME, VERSION);
    }

    function test_setAgent_rejectsZeroRegistry() public {
        vm.prank(owner);
        vm.expectRevert(BrainVault.ZeroAddress.selector);
        vault.setAgent(makeAddr("x"), IAgentRegistry(address(0)), 1, 1);
    }
}
