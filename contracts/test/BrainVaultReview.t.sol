// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BrainVaultFixture} from "./BrainVault.t.sol";
import {BrainVault} from "../src/BrainVault.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

/// Regression tests from the V1 adversarial review (findings L-2, L-4, I-1, I-2, I-4, I-6).
contract BrainVaultReviewTest is BrainVaultFixture {
    // L-2: remove + re-add on the same day keeps spend and the guardian's pause.
    function test_removeThenReadd_keepsSpendAndPause() public {
        BrainVault.Payment memory p = _payment(other, 3 * USDC);
        bytes memory sig = _sign(p);
        vm.prank(other);
        vault.pay(p, sig);
        vm.prank(guardian);
        vault.pauseAgent(other);

        vm.startPrank(owner);
        vault.removeAgent(other);
        vault.setAgent(other, IAgentRegistry(address(registry)), OTHER_LABELHASH, uint128(4 * USDC));
        vm.stopPrank();

        assertTrue(vault.agentOf(other).paused, "pause survives re-add");
        assertEq(vault.spentToday(other), 3 * USDC, "spend survives re-add");
    }

    function test_setAgent_keepsSpendAndPause() public {
        BrainVault.Payment memory p = _payment(other, 3 * USDC);
        bytes memory sig = _sign(p);
        vm.prank(other);
        vault.pay(p, sig);
        vm.prank(guardian);
        vault.pauseAgent(other);
        vm.prank(owner);
        vault.setAgent(other, IAgentRegistry(address(registry)), OTHER_LABELHASH, uint128(5 * USDC));
        assertTrue(vault.agentOf(other).paused);
        assertEq(vault.spentToday(other), 3 * USDC);
    }

    // L-4: the hot guardian can burn a single signed-but-unused attestation.
    function test_guardian_cancelIntentBurnsAttestation() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        p.roots = new bytes32[](0); // root revocation can't stop an empty-roots attestation...
        bytes memory sig = _sign(p);
        vm.expectEmit(true, true, false, false, address(vault));
        emit BrainVault.IntentCancelled(p.intentId, guardian);
        vm.prank(guardian);
        vault.cancelIntent(p.intentId); // ...but cancelling the intent does
        vm.prank(agent);
        vm.expectRevert(BrainVault.Replay.selector);
        vault.pay(p, sig);
    }

    function test_stranger_cannotCancelIntent() public {
        vm.prank(agent);
        vm.expectRevert(BrainVault.NotOwnerOrGuardian.selector);
        vault.cancelIntent(bytes32(uint256(1)));
    }

    // I-4: huge amount reverts with the domain error, not a panic.
    function test_pay_hugeAmountRevertsOverCeilingNotPanic() public {
        BrainVault.Payment memory p1 = _payment(agent, 1 * USDC);
        bytes memory s1 = _sign(p1);
        vm.prank(agent);
        vault.pay(p1, s1);
        BrainVault.Payment memory p2 = _payment(agent, type(uint256).max);
        bytes memory s2 = _sign(p2);
        vm.prank(agent);
        vm.expectRevert(BrainVault.OverDailyCeiling.selector);
        vault.pay(p2, s2);
    }

    function test_pay_ceilingLoweredBelowSpend() public {
        BrainVault.Payment memory p1 = _payment(agent, 5 * USDC);
        bytes memory s1 = _sign(p1);
        vm.prank(agent);
        vault.pay(p1, s1);
        vm.prank(owner);
        vault.setAgent(agent, IAgentRegistry(address(registry)), AGENT_LABELHASH, uint128(2 * USDC));
        BrainVault.Payment memory p2 = _payment(agent, 1);
        bytes memory s2 = _sign(p2);
        vm.prank(agent);
        vm.expectRevert(BrainVault.OverDailyCeiling.selector);
        vault.pay(p2, s2);
    }

    // I-6: admin calls on unknown agents revert instead of emitting noise.
    function test_unknownAgentAdminCallsRevert() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(owner);
        vm.expectRevert(BrainVault.AgentUnknown.selector);
        vault.unpauseAgent(stranger);
        vm.expectRevert(BrainVault.AgentUnknown.selector);
        vault.removeAgent(stranger);
        vm.stopPrank();
    }

    // Guardian-key compromise recovery: disable the guardian first, then loosen.
    function test_recoverFromStolenGuardian() public {
        vm.prank(guardian);
        vault.pauseAgent(agent);
        vm.startPrank(owner);
        vault.setGuardian(address(0));
        vault.unpauseAgent(agent);
        vm.stopPrank();
        vm.prank(guardian);
        vm.expectRevert(BrainVault.NotOwnerOrGuardian.selector);
        vault.pauseAgent(agent);
    }

    // I-2: chain id is part of the domain.
    function test_pay_rejectedAfterChainIdChange() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        bytes memory sig = _sign(p);
        vm.chainId(1);
        vm.prank(agent);
        vm.expectRevert(BrainVault.BadAttestation.selector);
        vault.pay(p, sig);
    }

    // I-2: high-s (malleable) signatures are rejected.
    function test_pay_rejectsHighS() public {
        BrainVault.Payment memory p = _payment(agent, 1 * USDC);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(policyKey, _digest(p, address(vault)));
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141; // secp256k1 order
        bytes32 highS = bytes32(n - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        vm.prank(agent);
        vm.expectRevert(BrainVault.BadAttestation.selector);
        vault.pay(p, abi.encodePacked(r, highS, flippedV));
    }

    function test_pay_eventWithManyRootsAndHumanApproval() public {
        BrainVault.Payment memory p = _payment(agent, 2 * USDC);
        bytes32[] memory roots = new bytes32[](3);
        roots[0] = ROOT_H1;
        roots[1] = keccak256("0xH2");
        roots[2] = keccak256("github:demo/specs");
        p.roots = roots;
        p.humanApproved = true;
        bytes memory sig = _sign(p);
        vm.expectEmit(true, true, true, true, address(vault));
        emit BrainVault.Paid(agent, payee, 2 * USDC, p.intentId, roots, true);
        vm.prank(agent);
        vault.pay(p, sig);
    }

    // I-1: a vector signed outside Solidity (`cast wallet sign --data`, EIP-712 JSON) is accepted,
    // so the on-chain encoding matches standard typed-data tooling (viem/ethers use the same rules).
    function test_vec_castSignedTypedDataAccepted() public {
        // the vector was signed for this exact test deployment
        assertEq(address(vault), 0xF62849F9A0B5Bf2913b396098F7c7019b51A820a, "vector bound to test vault address");
        assertEq(block.chainid, 31337);
        bytes32[] memory r = new bytes32[](2);
        r[0] = ROOT_H1;
        r[1] = ROOT_EMAIL;
        BrainVault.Payment memory p = BrainVault.Payment(
            agent,
            payee,
            1_000_000,
            r,
            bytes32(0x1111111111111111111111111111111111111111111111111111111111111111),
            1762400300,
            true
        );
        vm.prank(agent);
        vault.pay(
            p,
            hex"b66f28f402efef4eaa68c137830cee9cbea15fa27f1f2e07523471b03ef0dc8b4834884959fd2fdd1beeec62be787ae773e63c42e66511efa2b571fc12be45901c"
        );
        assertEq(usdc.balanceOf(payee), 1_000_000);
    }
}
