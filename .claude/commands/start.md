Run the session start routine for this repo (CLAUDE.md §3.3):

1. Run `git pull --rebase`.
2. Ask me which lane this session is (A Brain / B Money & Security / C Face), unless I already said so in this conversation. Then read `docs/lanes/<lane file>`.
3. Read `docs/PROGRESS.md`: the Board, my lane's stage checklist, and any open Requests addressed to my lane. Read the last 10 lines of `docs/DECISIONS.md`.
4. If `scripts/doctor.ts` exists, run `pnpm doctor` and summarize it. Print env var names and public values only, never secrets.
5. Post a 5-line status: lane · current stage/step · what's green · what's blocked · next step.
6. Update my lane's row on the Board in `docs/PROGRESS.md`, then wait for my "go" before starting the next step.
