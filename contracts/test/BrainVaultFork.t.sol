// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BrainVault} from "../src/BrainVault.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

/// Fork test against the REAL Sepolia deployment (B-MONEY.md S2): the team's ENSv2 UserRegistry from
/// config/deployments/ens.sepolia.json and Circle USDC from config/tokens.sepolia.json. Nothing is hard-coded.
/// Skips unless SEPOLIA_RPC_URL is set:  SEPOLIA_RPC_URL=… forge test --match-contract BrainVaultForkTest -vv
contract BrainVaultForkTest is Test {
    string ens;
    IERC20 usdc;
    IAgentRegistry registry;
    BrainVault vault;
    address owner = makeAddr("fork-owner");
    address guardian = makeAddr("fork-guardian");
    uint256 policyKey;
    address policySigner;
    address payee = makeAddr("fork-payee");
    uint256 nonce;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        ens = vm.readFile("../config/deployments/ens.sepolia.json");
        string memory tokens = vm.readFile("../config/tokens.sepolia.json");
        assertEq(block.chainid, vm.parseJsonUint(ens, ".chainId"), "fork chain != ens.sepolia.json chainId");

        usdc = IERC20(vm.parseJsonAddress(tokens, ".usdc.address"));
        registry = IAgentRegistry(vm.parseJsonAddress(ens, ".teamRegistry.address"));
        (policySigner, policyKey) = makeAddrAndKey("fork-policy");
        vault = new BrainVault(usdc, owner, guardian, policySigner, 8, "BrainVault", "1");
        deal(address(usdc), address(vault), 100e6);
    }

    function _agent(string memory label) internal view returns (address wallet, uint256 labelhash) {
        wallet = vm.parseJsonAddress(ens, string.concat(".agents.", label, ".wallet"));
        labelhash = uint256(vm.parseJsonBytes32(ens, string.concat(".agents.", label, ".labelhash")));
    }

    function _pay(address agent, uint256 amount) internal returns (BrainVault.Payment memory p, bytes memory sig) {
        p = BrainVault.Payment({
            agent: agent,
            payee: payee,
            amount: amount,
            roots: new bytes32[](0),
            intentId: keccak256(abi.encode("fork", nonce++)),
            deadline: uint64(block.timestamp + 300),
            humanApproved: false
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(policyKey, vault.paymentDigest(p));
        sig = abi.encodePacked(r, s, v);
    }

    function test_fork_registryOwnersMatchDeploymentFile() public view {
        string[3] memory labels = ["lead-claude", "gem-research", "gpt-writer"];
        for (uint256 i; i < labels.length; ++i) {
            (address wallet, uint256 lh) = _agent(labels[i]);
            assertEq(registry.getOwner(lh), wallet, labels[i]);
        }
        assertEq(uint256(keccak256("lead-claude")), uint256(vm.parseJsonBytes32(ens, ".agents.lead-claude.labelhash")), "labelhash = keccak(label)");
    }

    function test_fork_registeredAgentPaysAgainstRealRegistry() public {
        (address wallet, uint256 lh) = _agent("lead-claude");
        vm.prank(owner);
        vault.setAgent(wallet, registry, lh, 30e6);
        (BrainVault.Payment memory p, bytes memory sig) = _pay(wallet, 1e6);
        vm.prank(wallet);
        vault.pay(p, sig);
        assertEq(usdc.balanceOf(payee), 1e6);
    }

    function test_fork_unregisteredAgentIsKilledOnChain() public {
        // test-agent was unregistered on Sepolia by Lane A (kill-switch proof): the real registry now returns 0x0
        (address wallet, uint256 lh) = _agent("test-agent");
        assertEq(registry.getOwner(lh), address(0), "test-agent should be unregistered on Sepolia");
        vm.prank(owner);
        vault.setAgent(wallet, registry, lh, 30e6);
        (BrainVault.Payment memory p, bytes memory sig) = _pay(wallet, 1e6);
        vm.prank(wallet);
        vm.expectRevert(BrainVault.AgentNotRegistered.selector);
        vault.pay(p, sig);
    }

    function test_fork_wrongWalletForARealLabelIsRejected() public {
        (, uint256 lh) = _agent("lead-claude");
        address impostor = makeAddr("impostor");
        vm.prank(owner);
        vault.setAgent(impostor, registry, lh, 30e6);
        (BrainVault.Payment memory p, bytes memory sig) = _pay(impostor, 1e6);
        vm.prank(impostor);
        vm.expectRevert(BrainVault.AgentNotRegistered.selector);
        vault.pay(p, sig);
    }
}
