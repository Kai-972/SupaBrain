Append a progress entry for the step just finished (or just failed) to `docs/PROGRESS.md`, under my lane's "Log" section, newest first. Use exactly this format:

```
### <YYYY-MM-DD HH:MM IST> · <lane> · <stage> / <step>
- did: <one line>
- proof: <tx / explorer / screenshot / test output summary>
- result: PASS | FAIL (<why>)
- commit: <short hash or "uncommitted">
- next: <next step>
- asks/blockers: <none or list>
```

Then:
- tick the matching checkbox in the stage checklist (if it passed);
- update my Board row;
- if anything blocks another lane, add a line under Requests;
- if it was an Arkiv snag, also append it to `arkiv/friction.md` (expected / got / repro / workaround).

Never include secrets. Commit with `docs(progress): <lane> <stage/step> <PASS|FAIL>` and push after `git pull --rebase`.

Extra notes from me (optional): $ARGUMENTS
