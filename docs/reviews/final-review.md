# Messenger final independent review

Reviewed 2026-11-02. Repository: `C:/Workspaces/Packages/umbraco-messenger`. Reviewed main `e723c42d136b07f6eae98e77fd8d48017de1afc8` and v17/main `ee06fcfe226d1b9dc01699c5d1c2fc3c45f16ecd`, including the supplied initial-scaffold-to-main and main-to-v17 diffs. Read the binding design, implementation plan, verification record and SDD ledger. Repository source, tests, workflows, generated client contract and both actual archives were inspected read-only. No repository files, index, branches or remote state were changed.

## Verdict

**Safe for local package handoff, with one nonblocking Minor finding. No Critical or Important findings.** This is approval for the documented single-server local implementation and its supplied packages, not a claim of production load certification or configured public publishing.

## Findings

### Minor — archive validator does not enforce static-asset registration or dependency closure

Location: `C:/Workspaces/Packages/umbraco-messenger/scripts/validate-package.py:28` (required payload), `:48` (build-file allowlist), and `:50` (manifest check).

Trigger: remove the generated registration props/import chain, or remove one of the JavaScript chunks imported by the entrypoint, from an otherwise valid archive. The validator requires only the entry JavaScript and manifest, permits build files rather than requiring them, and does not resolve emitted imports. It can therefore approve a future package that cannot register or load its client in a consuming site. The current positive fixture also lacks the registration chain, so the validator tests do not detect this omission.

Recommended follow-up: require the generated package/static-web-assets import chain and verify referenced payload paths, with a negative fixture for missing props and a missing emitted chunk. Keep this narrow; it does not require a new packaging abstraction.

This does **not** block these artifacts: independently inspected both `17.0.0` and `18.0.0` nupkgs. Both contain 21 entries, the registration props and transitive import chain, package-specific manifests and all expected client chunks. A read-only scan of each archived JavaScript file confirmed all its literal relative `.js` references resolve within the archive. No demo/settings/database payload was present.

## Architecture and security assessment

- Durable conversation state is kept in package-owned NPoco tables. Sends, invitations, leave, read and mute obtain the conversation write lock before reading/changing membership or sequences. Commit precedes live invalidation. The shared service is the authorization boundary for both REST and hub methods; acting identities come from the authenticated backoffice principal, never request bodies.
- Visibility is sequence-based, not timestamp-based. Closing open ranges at leave preserves old accessible messages. A future-only rejoin opens a later range, leaving gaps intact. Explicit history sharing takes only the inviter's existing ranges, caps open ranges at the locked current sequence, and merges their union; it does not fill an inviter's inaccessible gaps. A current participant may invite without creator/admin status. Groups expand to eligible distinct users at the operation, without persistent group membership inheritance.
- Nonmembers receive no conversation history/roster access. Former members retain authorized history and subject but receive an empty roster and cannot send, invite, mark read, mute or query live presence. Live traffic uses server-owned personal groups; there is no client-controlled conversation subscription. Each recipient is checked for current membership and eligible account before delivery. Content travels through authorized REST reads rather than in invalidation events. Presence/typing expose no text and no arbitrary global-user subscription.
- REST derives from the authenticated Management API base; the hub explicitly requires backoffice access and closes at authentication expiration. Account eligibility is checked on operations, including existing sockets. The live-event checks and documented tests provide sensible stale-socket protection. This review does not claim a formal proof that a packet already authorized/enqueued can never arrive after a simultaneous leave response.

## Client, dual-major and user-flow assessment

- The selected nonblocking right panel, native header entry, conversation list/detail/back navigation and separate short action dialogs are implemented. Plain text uses Lit text interpolation, including names, subjects and message bodies. The package SVG uses the approved navy/mint/orange two-bubble design; the header icon uses current foreground and only renders an unread marker when the computed count is positive.
- Read state is advanced from displayed messages in an open, visible, focused active conversation. Muted conversations keep their list unread state but do not contribute to the header count. Failed sends keep drafts; mutation controls prevent competing submits; epoch/request/navigation checks reject stale responses and prevent late completion from replacing newer navigation. Latest-page reload on reconnect preserves an older-page cursor, so disconnected arrivals do not create an unreachable pagination gap.
- Logout clears private context/drafts and stops connections/timers. Header disconnect clears its listeners and observer; typing is bounded and expires independently of stop delivery. Heartbeats continue against a shared active conversation even with the panel closed, and server presence tracks multiple connections per user. Process-local presence is explicitly documented as a single-instance limitation.
- The 17 branch uses the separate Swagger registration and auth-client configuration required by its API surface; the shared production service/UI remain aligned with main. Both branch package versions and bounded Umbraco major dependencies are correct. Generated APIs are based on the actual branch-specific documents.
- Investigated the v17 optional `nextBeforeSequence` schema: the shared state expects null at end-of-history, so omission would be a robustness edge case. The coordinator's real17 end-of-history UI evidence showed no spurious Earlier button. No actual omitted-null response or observed pagination failure was established, so this is **not a finding** and does not justify changing tested code speculatively.

## Demo and delivery assessment

- Development-only setup generates cryptographically random local credentials, preserves saved files/passwords, fails rather than resetting an existing database without its admin settings, and seeds synthetic Editor accounts with a core transaction around creation/password assignment. Saved GUIDs make restarts skip existing verified accounts. Local credential files are ignored and explicitly excluded from demo publish output; they are not in the packages. Separate database filenames prevent accidental cross-major reuse.
- CI builds the client before server/package work. Release preparation validates stable tag syntax, matching major branch ancestry, source version and actual package identity/dependency range before OIDC login. These definitions do not themselves configure a repository, release environment or NuGet trust policy. No remote publication was performed or authorized.
- The v17 demo-only ImageSharp pin and its Release-license requirement are documented. It is not part of the Messenger package dependency payload. Debug demo validation and library/package builds should not be represented as a licensed Release demo build.
- At review time the implementation plan's Task 4 boxes and the final sentence of `docs/verification.md` still describe delivery work in progress. The coordinator should close these records with the final handoff evidence; this is completion bookkeeping, not another production-code finding.

## Evidence and limits

Accepted the supplied fresh evidence rather than rerunning passing suites: 26 server tests and 17 client tests per major; actual API generation, strict client build and nupkg validation; the original 20 service/presence/boundary tests against actual SQL Server provider in a disposable database; real18 multi-user leave/rejoin/gap/mute/group/live checks; real17 administrator/Editor/group/unread/reply/live checks; and the fresh main rebuild at the final path. Read the tests to assess their meaning rather than treating test counts as proof of every behavior. Independently verified the named branch heads and archive contents/relative JavaScript imports. A sandbox-user ownership warning was handled only with a command-scoped `safe.directory` override for read-only Git inspection, without persistent Git configuration changes.

Declined to certify the following because the evidence does not cover them: sustained load and large conversation lists; multi-instance operation; extended real-browser token expiry/refresh; a complete hosted SQL Server website; forced running-demo password-setup failure rollback; assistive-technology/browser coverage beyond the recorded keyboard/browser checks; and remote Actions/OIDC/NuGet publication. None is silently counted as tested. The coordinator's separate fresh package-consumer smoke check was still in progress when this report was written and is not claimed here.

Skipped duplicate passing test/build runs and speculative production changes. Remaining handoff risk is the documented deployment/runtime limits and the validator's future-regression gap; neither actual package has the missing-asset defect.
