namespace Umbraco.Community.Messenger;

public sealed record DirectoryUser(Guid Id, string Name);
public sealed record DirectoryGroup(Guid Id, string Name);
public sealed record DirectoryResponse(IReadOnlyList<DirectoryUser> Users, IReadOnlyList<DirectoryGroup> Groups);
public sealed record RecipientsRequest(Guid[] UserIds, Guid[] GroupIds, bool ShareHistory = false);
public sealed record CreateConversationRequest(string Subject, string Body, Guid[] UserIds, Guid[] GroupIds);
public sealed record SendMessageRequest(string Body);
public sealed record ReadRequest(long Sequence);
public sealed record MuteRequest(bool Muted);
public sealed record MessageResponse(Guid Id, long Sequence, Guid SenderId, string SenderName, string Body, DateTime CreatedUtc);
public sealed record MessagePage(IReadOnlyList<MessageResponse> Items, long? NextBeforeSequence);
public sealed record ParticipantResponse(Guid Id, string Name, bool IsActive);
public sealed record ConversationResponse(Guid Id, string Subject, bool IsActive, bool Muted, int UnreadCount,
    long LastReadSequence, MessageResponse? LastMessage, IReadOnlyList<ParticipantResponse> Participants);
public sealed record ConversationListResponse(IReadOnlyList<ConversationResponse> Items, int UnreadConversationCount);
public sealed record PresenceResponse(Guid UserId, bool IsOnline);
public sealed class MessengerException(int status, string code) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}
