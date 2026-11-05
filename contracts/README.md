# contracts (Lane B)

`BrainVault`: the on-chain money gate. Agents never hold funds; the only way to move USDC is
`BrainVault.pay`, which checks on chain that:

1. the caller still owns a live ENSv2 subname (`registry.getOwner(labelhash) == msg.sender`),
2. the agent isn't paused,
3. the policy attestation (EIP-712) is fresh, unused and signed by the policy signer,
4. none of the attestation's lineage roots is revoked,
5. the owner-set daily ceiling isn't exceeded.

The guardian key can only tighten (revoke a root, pause an agent). Only the owner can loosen or withdraw.

```bash
./install-deps.sh      # pinned forge-std + OpenZeppelin into lib/ (gitignored)
forge build
forge test -vvv
```
