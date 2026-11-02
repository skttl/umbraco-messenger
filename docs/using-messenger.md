# Using Messenger

Select the speech bubbles in the backoffice header to open Messenger. Messenger uses the same full-height sidebar and dimmed backdrop as the user profile. Escape or Close closes it. Umbraco manages focus and closes the sidebar on navigation. Reply drafts remain in the Messenger context.

Choose New conversation, enter a subject and message, then select users or groups. A group is expanded to its current enabled users once when sending or inviting: later group membership changes do not alter the conversation.

The header counts unread, unmuted conversations. Muted conversations keep their unread state in the conversation list. Messages become read when displayed in an open conversation; leaving the list open does not read incoming messages. Open a conversation to reply or manage its participants.

Any active participant can invite more users or groups. The default shares only new messages. Sharing history grants only the history the inviter can already read; it cannot expose somebody else's inaccessible messages.

Leaving stops future messages and live updates, and prevents replying or inviting. Already accessible history remains readable. If somebody invites you again, new messages are accessible; messages sent while you were absent stay hidden unless an authorized inviter explicitly shares that history.

Online and typing indicators are temporary and visible only to active participants in a shared conversation. Multiple tabs count as one online user. Reconnecting reloads stored conversations and unread state.

Search and New conversation share one toolbar row. In a conversation the header contains the back arrow and subject; participant, mute and leave actions sit beside the reply composer. New conversation and Add participants open a second native sidebar; Cancel or Escape returns to the underlying panel. Leave uses a confirmation dialog. Pending submissions cannot be cancelled; failed submissions preserve their fields.

Messages allow up to 100,000 characters, without a visible character counter. Existing installations already store message bodies in an unlimited text column, so this change needs no migration. Bodies use HTTP endpoints; SignalR only announces changes by conversation ID.
