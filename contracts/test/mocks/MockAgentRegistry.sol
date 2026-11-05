// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRegistry} from "../../src/interfaces/IAgentRegistry.sol";

/// @dev Mirrors ENSv2 PermissionedRegistry.getOwner semantics: address(0) once expired or unregistered.
contract MockAgentRegistry is IAgentRegistry {
    struct Entry {
        address owner;
        uint64 expiry;
    }

    mapping(uint256 => Entry) public entries;

    function register(uint256 labelhash, address owner, uint64 expiry) external {
        entries[labelhash] = Entry(owner, expiry);
    }

    function unregister(uint256 labelhash) external {
        delete entries[labelhash];
    }

    function getOwner(uint256 anyId) external view returns (address) {
        Entry memory e = entries[anyId];
        if (e.expiry <= block.timestamp) return address(0); // ENSv2: _isExpired(expiry) => expiry <= now
        return e.owner;
    }
}
