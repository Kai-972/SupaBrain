// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title BrainVault (skeleton: interface first, tests written against it)
contract BrainVault is EIP712 {
    struct Payment {
        address agent;
        address payee;
        uint256 amount;
        bytes32[] roots;
        bytes32 intentId;
        uint64 deadline;
        bool humanApproved;
    }

    error NotImplemented();

    constructor(
        IERC20,
        address,
        address,
        address,
        uint256,
        string memory name_,
        string memory version_
    ) EIP712(name_, version_) {}

    function pay(Payment calldata, bytes calldata) external pure {
        revert NotImplemented();
    }
}
