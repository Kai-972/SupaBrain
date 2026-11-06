"use client";
// "What's on chain, and why": every transaction the site links to, what it is, and why it exists.
// No smart contract is deployed per commit: contracts are deployed once per project and once per AI.
export const ON_CHAIN: { what: string; where: string; when: string; why: string }[] = [
  { what: "Brain registry (ENSv2 UserRegistry)", where: "Ethereum Sepolia · ENS", when: "Once per project, ahead of time", why: "The project's own namespace, <brain>.supabrain.eth. Its AI names live inside it and end with it." },
  { what: "AI name + its resolver (ENSv2 PermissionedResolver)", where: "Ethereum Sepolia · ENS", when: "Once per AI, ahead of time", why: "The AI's identity (claude.<brain>.supabrain.eth → its wallet) and its rulebook, stored as text records only the server key and the owner can change." },
  { what: "Rule change (setText on the AI's resolver)", where: "Ethereum Sepolia · ENS", when: "When the owner changes a rule", why: "Rules are public records, so every change leaves a trail anyone can read. The next call obeys it." },
  { what: "HEAD update (sb.memory.head on the AI's resolver)", where: "Ethereum Sepolia · ENS", when: "After each confirmed commit", why: "Like a git branch: resolve the AI's name and you get its newest commit, without asking our server." },
  { what: "Commit (an Arkiv entity, not a contract)", where: "Arkiv Rabdi", when: "Every checkpoint", why: "The work itself, created by the AI's own wallet. Anyone can check who wrote it, nobody can edit it, and it expires with the project." },
  { what: "Stop (an Arkiv revocation entity)", where: "Arkiv Rabdi", when: "When content breaks the AI's sb.guard rule", why: "The injected content is kept as evidence and revoked by the team wallet, so no AI receives it and history isn't rewritten." },
];

export function OnChain() {
  return (
    <div className="onchain4">
      <div className="oc-row head"><span>What</span><span>When</span><span>Why it exists</span></div>
      {ON_CHAIN.map((r) => (
        <div key={r.what} className="oc-row">
          <span><b>{r.what}</b><em>{r.where}</em></span>
          <span>{r.when}</span>
          <span>{r.why}</span>
        </div>
      ))}
      <p className="oc-note">No smart contract is deployed per commit. Contracts are deployed once per project and once per AI; a commit is a signed Arkiv record, and the ENS transactions only update records on the AI&apos;s existing resolver.</p>
    </div>
  );
}
