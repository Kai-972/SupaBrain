#!/usr/bin/env sh
# Installs pinned Solidity deps into contracts/lib (gitignored; no submodules).
set -eu
cd "$(dirname "$0")"
forge install --no-git foundry-rs/forge-std@v1.9.7
forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.6.1
