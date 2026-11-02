# Verification

This is a local implementation, not a published release. No GitHub remote, NuGet trust policy or production deployment has been configured.

## Umbraco 18

- Library compiled against Umbraco.Cms.Api.Management 18.0.0; demo runs Umbraco 18.3.0 on .NET 10.
- 26 server tests pass, including 20 service/presence/authorization/migration tests and six demo configuration tests. Real SQLite migrations and transactional persistence are exercised.
- The same 20 original service/presence/boundary tests pass against actual SQL Server Express 16.0 using Umbraco's SQL Server provider. This uses the compiled Messenger library in a separate temporary test harness and a newly created disposable database. The owned test database is removed after the run. It checks SQL Server schema creation, concurrent sends, retained history, rejoin gaps, authorization, group expansion and transaction rollback. It does not claim a complete Umbraco website installation on SQL Server.
- 17 client tests pass; strict TypeScript/Vite build and npm audit pass with zero vulnerabilities. Toolchain is Node 24.13.0/npm 11.6.2. The locally downloaded Node archive was verified against official SHA256 checksums.
- Five archive validator tests pass. The actual 18.0.0 nupkg was inspected: correct package identity and `[18.0.0,19.0.0)` dependency range, library/static web assets/readme/license/icon/notices present, no demo credentials or databases. Actionlint 1.7.7 passes both workflows. GitHub Actions has not been run remotely.

## Actual browser checks on 18

The real demo was tested with the generated administrator and both synthetic Editor accounts, using separate local origins for independent authenticated sessions.

- Administrator and both Editors can sign in. The directory shows the real users and groups. The dedicated Messenger WebSocket connects with backoffice authentication; anonymous REST and hub negotiation receive 401.
- The native header opens a nonblocking sidepanel. It remains open while navigating from Content to Media. Escape and the close button return keyboard focus to the Messenger launcher.
- Create conversation, read notification, reply and cross-user live delivery work. Opening the unread conversation clears its header count. HTML-like message content is displayed as literal text.
- An ordinary Editor adds the Editors group. It expands to current distinct users. The newly added Editor sees only subsequent messages with the default future-only choice.
- Muting a thread leaves the header count unchanged when later messages arrive while the panel is closed.
- Leaving retains visible messages in a read-only thread and removes the composer/roster. Later messages do not arrive for the former participant.
- Reinvitation restores future updates, retains prior accessible history and does not reveal the message sent during absence.
- Logging out clears the old account's UI before another Editor signs in. The fresh demo has been restarted repeatedly without rotating saved credentials.

## Remaining limits

Presence is process-local. Multiple web instances require distributed presence in addition to an appropriate SignalR backplane. Extended browser token-expiry testing, load testing and a hosted SQL Server website installation have not been performed. Demo provisioning failure rollback is represented by the explicit core transaction and was reviewed, but a forced password failure has not been exercised in a running demo. The first release uses plain text and no email or attachments.

## Umbraco 17

`v17/main` compiles the library against Umbraco 17.0.0 and runs the separate 17.7.1 demo database at the requested repository location. All 26 server tests and 17 client tests pass. The actual v17 Swagger document generates the authenticated SDK, and the generated client passes strict TypeScript/Vite compilation. The 17.0.0 nupkg validates with 21 entries and `[17.0.0,18.0.0)` dependency range. Patched MailKit is pinned for the lower-bound graph; the demo pins ImageSharp 3.2.0 and its Debug build reports the expected missing-license warning. Release builds of that demo require a Six Labors license. Messenger library pack succeeds without that demo dependency.

Actual browser checks on 17 cover administrator and Editor login, real directory/group expansion, duplicate participant removal, sending a group message, unread badge clearing on read, editor reply and live delivery to the administrator. The dedicated Messenger WebSocket connects with backoffice authentication. Databases and credentials remain separate from packaged assets.

## Repository delivery

Repository: `C:\Workspaces\Packages\umbraco-messenger`. The checkout was moved intact after the first reviewed implementation and verified on 17 at this location. It will be returned to main and rebuilt there before delivery. No existing target repository was overwritten. The new repository files are owned by the Windows user, without adding global Git safe-directory exceptions.
