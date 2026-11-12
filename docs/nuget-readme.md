# Messenger for Umbraco

Plain text threaded conversations inside the backoffice, with the standard Umbraco sidebar, unread state, mute, participant invitations, online presence and typing indicators. English, Danish, German, Dutch, French, Italian, Spanish, Swedish and Norwegian Bokmål UI.

Use the package major matching Umbraco: 19.x prereleases for Umbraco 19 RC on .NET 11, 18.x for Umbraco 18 and 17.x for Umbraco 17 on .NET 10. Restart after installation to run migrations. Node is not required by consuming sites.

Groups expand to enabled users at send/invite time. Invitations default to future messages; optional history sharing cannot exceed the inviter's own accessible history. Leaving retains prior accessible messages and stops future access. Rejoining preserves hidden gaps unless explicitly shared.

First release supports one application server: messages are durable, presence and typing process-local. SignalR requires hosting/proxy support; multi-server use requires additional coordination. No email, HTML, attachments, editing or deletion. Subject limit 120 characters, message limit 100,000, maximum 100 expanded participants. Recipient directory shows up to 50 users and 50 groups per query; search examines the first 1000 groups and accepts up to 100 characters.

MIT licensed. Bundled dependency license texts are included in static web assets; see THIRD_PARTY_NOTICES.md.

See [screenshots and the illustrated guide](https://github.com/skttl/umbraco-messenger/blob/main/docs/using-messenger.md#screenshots) for the native sidebar, group recipients and participant history options.
