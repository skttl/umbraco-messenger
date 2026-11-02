# Messenger for Umbraco

User approved development after a working sidepanel prototype. Build a locally runnable package at `C:\Workspaces\Packages\umbraco-messenger`, using Handbook at `C:\Workspaces\Packages\umbraco-handbook` as structural reference. No remote repository creation or publishing is requested.

## Requirements

- Package `Umbraco.Community.Messenger`; `main` targets Umbraco 18 with versions `18.x.x`; `v17/main` targets Umbraco 17 with versions `17.x.x`. Both use .NET 10 as in Handbook.
- Native backoffice header app with unread indication; clicking opens the selected non-blocking right sidepanel, initially the conversation list, then a conversation with a back button. Follow the approved prototype in `docs/prototype.html`.
- Persistent threaded messages, individual read/unread tracking, individual mute, leave and add participants.
- Recipient groups are expanded once to distinct active users at send/invite time. Later membership changes do not change conversation membership. All active participants see replies within their authorized history.
- Every active participant can add users or expand groups. Invitation selects history: future messages only by default, or share the inviter's accessible history. Never grant access to history the inviter cannot read.
- Leaving keeps already accessible history, removes future access and notification delivery, and prevents replies/invites. Rejoining restores future access; inaccessible gaps stay inaccessible unless explicitly shared by an authorized inviter.
- SignalR provides unread/list refresh, online status and expiring typing indicators. Server authorizes every operation and live recipient; reconnecting clients reload authoritative state. Messages/read state are durable; typing/presence are transient. Multiple tabs must not make users falsely offline.
- All REST and hub endpoints require backoffice authentication. Acting user comes from server principal, not request body. Nonparticipants cannot read, send, invite, enumerate participants or observe live activity. A former participant receives no future events and cannot use a stale subscription to spy on a conversation.
- No external mail. Plain text messages in first release, rendered as text. No arbitrary HTML, attachments, edit/delete or task system.
- Localized Danish and English UI, accessible controls, cleanup of connections/listeners on logout/disconnect.
- Approved package icon: two overlapping speech bubbles; navy `#1B264F`, mint `#95E5D2`, orange dot `#F4A340`. Header icon uses backoffice foreground and a dynamic unread marker; decorative static package dot must not imply permanent unread state.
- Repository includes source, generated authenticated API client, demo, meaningful tests, documentation, CI/release definitions and NuGet package artifacts for both branches.

## Implementation choices

The user asked to start building with subagents. Remaining reversible product decisions are defaults documented here, not new approval gates: count unmuted unread conversations in the header; muted threads retain unread state in the list; only new messages is default invitation history; sharing history shares only inviter-visible intervals; reinvitation does not require acceptance. English is fallback UI language. New messaging is available to enabled backoffice users. No online visibility outside shared active conversations.

## Architecture

Use Umbraco NPoco tables and package migrations for conversations, messages, participants, and per-participant historical visibility intervals. Transactional database operations enforce group expansion, read markers, leave/invite/message ordering and visibility; avoid timestamps as security boundaries. Expose a documented Management API and generated TypeScript client. Register a separate authenticated SignalR hub using core authentication patterns rather than depending on Umbraco internal hub contracts.

Client uses Lit/UUI and Umbraco contexts, an accessible nonmodal sidepanel, proper errors/loading/empty states, and separate short confirmation/recipient dialogs. Unread state is updated only after reading an open conversation, and new replies arriving while the list is open remain unread.

## Alternatives considered

- Sidepanel versus large modal: user selected sidepanel after testing both; preserve editing context.
- Persistent group rooms versus recipient expansion: user selected mail-list expansion; later group members never inherit access.
- Internal core hub versus dedicated package hub: choose dedicated hub, sharing the framework but owning auth and event contract.

## Validation

Verify durable history on leave/rejoin, unauthorized reads/writes/hub joins, duplicate recipients, muted unread counts, stale connections, text safety, pagination and validation. Build and test both major versions. Inspect actual nupkg contents and bounded Umbraco dependency range. Run demo and exercise real backoffice UI rather than claiming prototype behavior proves integration.
