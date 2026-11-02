# Messenger API contract

Base: `/umbraco/management/api/v1/messenger`. Authentication is Umbraco backoffice OpenIddict, including HTTP-only cookie tokens. JSON camelCase. IDs are GUID strings; sequences are monotonically increasing safe integer values within a conversation. Subject limit 120 characters, body limit 4000, at most 100 expanded participants including sender. `take` 1..100; defaults 50.

| Method | Relative path | Operation ID | Request | Response |
| --- | --- | --- | --- | --- |
| GET | directory?query= | getMessengerDirectory | Optional query <=100 chars | DirectoryResponse |
| GET | conversations | getMessengerConversations | None | ConversationListResponse |
| POST | conversations | postMessengerConversation | CreateConversationRequest | ConversationResponse, 201 |
| GET | conversations/{id} | getMessengerConversation | None | ConversationResponse |
| GET | conversations/{id}/messages?beforeSequence=&take=50 | getMessengerMessages | Optional exclusive message cursor | MessagePage |
| POST | conversations/{id}/messages | postMessengerMessage | SendMessageRequest | MessageResponse, 201 |
| POST | conversations/{id}/participants | postMessengerParticipants | RecipientsRequest | ConversationResponse |
| DELETE | conversations/{id}/membership | deleteMessengerMembership | None | 204 |
| PUT | conversations/{id}/read | putMessengerRead | ReadRequest | 204 |
| PUT | conversations/{id}/mute | putMessengerMute | MuteRequest | 204 |

Shapes, TypeScript notation:

```ts
type DirectoryUser = { id: string; name: string };
type DirectoryGroup = { id: string; name: string };
type DirectoryResponse = { users: DirectoryUser[]; groups: DirectoryGroup[] };
type CreateConversationRequest = { subject: string; body: string; userIds: string[]; groupIds: string[] };
type RecipientsRequest = { userIds: string[]; groupIds: string[]; shareHistory?: boolean };
type SendMessageRequest = { body: string };
type ReadRequest = { sequence: number };
type MuteRequest = { muted: boolean };
type MessageResponse = { id: string; sequence: number; senderId: string; senderName: string; body: string; createdUtc: string };
type MessagePage = { items: MessageResponse[]; nextBeforeSequence: number | null };
type ParticipantResponse = { id: string; name: string; isActive: boolean };
type ConversationResponse = { id: string; subject: string; isActive: boolean; muted: boolean; unreadCount: number; lastReadSequence: number; lastMessage: MessageResponse | null; participants: ParticipantResponse[] };
type ConversationListResponse = { items: ConversationResponse[]; unreadConversationCount: number };
type PresenceResponse = { userId: string; isOnline: boolean };
```

Messages are ordered ascending in each returned page. Fetch the latest page without cursor; `nextBeforeSequence` fetches older messages. Keep pages deduplicated by message ID. The list counts unread messages excluding own messages; header counts unmuted unread conversations. Only mark messages read when displayed in the open conversation, using highest displayed sequence. Muting retains unread in list.

Former participants can read authorized retained messages and conversation details, but `participants` is empty and they cannot change read/mute preferences, send, invite or observe presence. Future-only invite is default; sharing copies only inviter-visible ranges. Rejoin preserves gaps. Directory returns enabled account names and group names only, with bounded results and no emails. It requires authenticated eligible user, independent of existing conversation membership because creating a first conversation requires a picker.

Expected errors return ProblemDetails with `status`, `title` and extension `code`. 400 validation, 401 auth, 403 disabled/ineligible actor or inactive member mutation, 404 conversation not visible, 409 participant capacity. No body has a requester/sender key.

## SignalR

Route `/umbraco/messengerHub`, own authenticated hub. Connect with Umbraco auth context accessTokenFactory and credentials. No client-controlled subscriptions. On reconnect reload conversations and the open conversation.

Client methods:

- `Heartbeat(conversationId: string): Promise<PresenceResponse[]>` validates active membership and renews presence. Call every ~15 seconds only for open active conversation. Presence expires after 45 seconds.
- `Typing(conversationId: string, isTyping: boolean): Promise<void>` validates active membership. Send bounded updates, clear displayed indicators after 5 seconds independently of explicit stop. Never sends text.

Server events:

- `ConversationChanged(conversationId: string)`: payload-free invalidation, fetch authorized data. New conversation, message, membership/read/mute changes refresh list/header and open conversation as applicable.
- `TypingChanged(conversationId: string, userId: string, isTyping: boolean)`: only other current participants. Receiver clears after 5 seconds.
- `PresenceChanged(conversationId: string, userId: string, isOnline: boolean)`: only current participants sharing that conversation. Heartbeat snapshot is authoritative.

Only authenticated current members receive later live events. Personal connection groups are server controlled; clients cannot join arbitrary groups. Presence is process-local in this first release; durable messages/visibility are database enforced. Stop connection and listeners on logout. All text is plain text and must be rendered as text nodes.
