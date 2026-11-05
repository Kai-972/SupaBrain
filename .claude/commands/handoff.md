This session is close to its usage limit, or I'm switching accounts. Write a hand-off note so another Claude session can continue with no other context.

Add it under "Hand-offs" in `docs/PROGRESS.md`:

```
### <YYYY-MM-DD HH:MM IST> · <lane> · hand-off
- state: <what's done in the current stage, with commit hashes>
- in progress: <file(s) and what's half-done>
- next step: <exact next action>
- open questions / risks: <list>
- commands to resume: <e.g. pnpm dev, pnpm test -- policy>
```

Commit any working changes that compile (WIP is fine, with a clear message). Then commit the note, `git pull --rebase`, and push. Never include secrets.
