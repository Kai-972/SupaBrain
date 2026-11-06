# Arkiv friction log

Written as things happen (25% of the Arkiv score). Newest first. Format:

```
### <YYYY-MM-DD HH:MM IST> · <short title>
- expected:
- got:
- repro:
- workaround:
```

<!-- entries below -->
### 2026-11-06 08:58 IST · Attribute names `by` and `key` are reserved, and the docs don't say so up front
- expected: the schema in our brief (`sb.revocation.by`) just works; `by` is a normal English word and a natural column for "who did this"
- got: `defineSchema` throws `InvalidAttributeNameError: "by" is reserved by the query language, so an attribute with this name could never be queried`. Same for `key`. The reserved set (and, or, not, true, false, between, startswith, exists, typeof, order, by, asc, desc, bool, i32, u64, u256, dec, bytes, str, addr, key) lives in `sdk/src/schema/names.ts`, not in the quickstart
- repro: `defineSchema("probe", { app: str().indexed(), by: str().indexed() })` with `@arkiv-network/sdk@1.0.1`
- workaround: renamed to `revokedBy`. Good that it fails at definition time instead of silently writing an unqueryable column; a list of reserved names on the schema docs page would save the detour

