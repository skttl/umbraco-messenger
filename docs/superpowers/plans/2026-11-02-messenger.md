# Messenger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tested Umbraco Messenger package and runnable demo for Umbraco 18 and 17 at the requested repository path.

**Architecture:** NPoco persistence, authorized Management API and dedicated SignalR hub, generated client and Lit/UUI header sidepanel. Maintain separate major-version branches and compatibility ranges.

**Tech Stack:** .NET 10, Umbraco 18/17, NPoco, ASP.NET Core SignalR, TypeScript, Lit, UUI, Vite.

**Spec:** `docs/superpowers/specs/2026-11-02-messenger-design.md`

## Global Constraints

- `main` targets Umbraco 18 with versions `18.x.x`; `v17/main` targets Umbraco 17 with versions `17.x.x`.
- All REST and hub endpoints require backoffice authentication.
- Leaving keeps already accessible history and removes future access.
- All active participants can add users; only inviter-accessible history may be shared.
- Build the approved non-blocking right sidepanel. Do not replace it with a large modal.
- No remote repository creation or publishing is requested.

## Review Focus

- Left users with stale live connections must not receive later messages, typing or membership/presence changes.
- Reinvitation with future-only history must preserve gaps and prevent sharing invisible messages.
- A group plus one of its members must produce one participant, with disabled users excluded.
- Multiple tabs and reconnects must retain accurate read state and not falsely toggle presence.
- Real package assets and authentication must work on both Umbraco major versions.

## Task 1: Persisted messaging and live API

**Files:** package C# source under `src/Umbraco.Community.Messenger/`, backend tests under `tests/Umbraco.Community.Messenger.Tests/`.
**Produces:** Compiling controller with explicit OpenAPI DTOs and operation IDs, migration, service and authenticated hub. Publish API contract in `docs/api-contract.md` before client implementation.

- [x] Write meaningful tests for authorization, recipient expansion, history intervals and message/read/mute/leave operations, then implement.
- [x] Implement transactional persistence using Umbraco scope/database conventions and automatic package migrations.
- [x] Implement controller and live hub with identity from authenticated principal and conversation access checks on every operation.
- [x] Build and run backend tests. Record exact commands and outcomes in task report.
- [x] Task review for spec compliance and code quality; resolve important issues.

## Task 2: Native backoffice client

**Files:** `src/Umbraco.Community.Messenger/Client/**`, public manifest/assets.
**Consumes:** Actual controller OpenAPI and `docs/api-contract.md` from Task 1.
**Produces:** Compiled native headerApp and sidepanel; generated authenticated client; DA/EN localization.

- [x] Generate client from actual API, configure auth compatible with each branch, and keep generated source.
- [x] Implement conversation list/detail, compose, recipient/group selection, history sharing, mute/leave, unread badge, typing and presence using real API/hub.
- [x] Add meaningful client checks for state behavior, encoding and unread selection. Handle errors and lifecycle cleanup.
- [x] Build client; verify tests; task review and important fixes.

## Task 3: Demo, packaging and documentation

**Files:** `demo/`, `.github/workflows/`, root metadata, README, `docs/`, package project metadata.
**Consumes:** Tasks 1 and 2 output. Preserve authored production files.

- [x] Add runnable SQLite demo with generated local dev credentials and package project reference.
- [x] Add CI and release validation following Handbook's structure, supporting bounded major-specific dependency ranges.
- [x] Add license/readme/marketplace metadata/icon and usage/development documentation; no dummy credentials or user data in packages.
- [x] Run demo; generate API from its actual document; verify package contents and task review.

## Task 4: Dual-major verification and delivery

**Files:** version-specific config/OpenAPI registration/auth differences, `v17/main`, verification report.

- [x] Commit reviewed implementation on `main` at 18.0.0.
- [x] Create `v17/main`, adapt API registration, auth and dependencies to 17.0.0, then build/test/pack.
- [x] Return to `main` and verify working tree state.
- [x] Whole repository security/quality review and targeted fixes; update both branches for shared fixes.
- [x] Place complete repository at `C:\Workspaces\Packages\umbraco-messenger`, verify from that location and report actual remaining limits.
