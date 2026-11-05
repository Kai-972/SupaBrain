// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The slice of the ENSv2 `IPermissionedRegistry` the vault depends on.
/// @dev ENSv2 contracts-v2 @ 07e55a05, `PermissionedRegistry.getOwner(uint256 anyId)`:
///      returns address(0) when the name is expired or unregistered, otherwise the token owner.
///      `anyId` may be the labelhash, token id or resource; we always pass the labelhash
///      because token ids are regenerated on some state changes.
interface IAgentRegistry {
    function getOwner(uint256 anyId) external view returns (address owner);
}
