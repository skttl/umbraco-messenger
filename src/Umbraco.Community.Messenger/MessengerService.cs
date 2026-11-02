using Microsoft.AspNetCore.SignalR;
using NPoco;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Infrastructure.Persistence;
using Umbraco.Cms.Infrastructure.Scoping;

namespace Umbraco.Community.Messenger;

public sealed class MessengerService(IScopeProvider scopes, IUserService users, IUserGroupService groups,
    IHubContext<MessengerHub, IMessengerClient> hub, MessengerPresence presence, TimeProvider clock, ILogger<MessengerService> logger)
{
    public const int MaximumParticipants = 100;
    private const string Visible = "EXISTS (SELECT 1 FROM messengerRange r WHERE r.conversationId=m.conversationId AND r.userKey=@1 AND m.sequence>r.afterSequence AND (r.throughSequence IS NULL OR m.sequence<=r.throughSequence))";

    public async Task ValidateAccessAsync(Guid actor)
    {
        if (!Eligible(await users.GetAsync(actor))) throw new MessengerException(403, "accountUnavailable");
    }

    public static bool Eligible(IUser? user) => user is { IsApproved: true, IsLockedOut: false }
        && user.UserState is UserState.Active or UserState.Inactive;

    public async Task<DirectoryResponse> DirectoryAsync(Guid actor, string? query)
    {
        await ValidateAccessAsync(actor);
        if (query?.Length > 100) throw new MessengerException(400, "queryTooLong");
        var found = users.GetAll(0, 50, out _, nameof(IUser.Name), Direction.Ascending,
            userState: [UserState.Active, UserState.Inactive], userGroups: null, filter: query);
        var allGroups = await groups.GetAllAsync(0, 1000);
        return new(found.Where(Eligible).Select(x => new DirectoryUser(x.Key, x.Name ?? "User")).ToArray(),
            allGroups.Items.Where(x => string.IsNullOrWhiteSpace(query) || x.Name?.Contains(query, StringComparison.OrdinalIgnoreCase) == true)
                .Take(50).Select(x => new DirectoryGroup(x.Key, x.Name ?? "Group")).ToArray());
    }

    public async Task<ConversationListResponse> ListAsync(Guid actor)
    {
        await ValidateAccessAsync(actor);
        List<Guid> ids;
        using (var scope = scopes.CreateScope(autoComplete: true))
            ids = scope.Database.Fetch<ParticipantDto>("WHERE userKey=@0", actor).Select(x => x.ConversationId).ToList();
        var result = new List<ConversationResponse>();
        foreach (var id in ids) result.Add(await DetailAsync(actor, id));
        var ordered = result.OrderByDescending(x => x.LastMessage?.CreatedUtc ?? DateTime.MinValue).ToArray();
        return new(ordered, ordered.Count(x => !x.Muted && x.UnreadCount > 0 && x.IsActive));
    }

    public async Task<ConversationResponse> DetailAsync(Guid actor, Guid id)
    {
        await ValidateAccessAsync(actor);
        ConversationDto conversation;
        ParticipantDto participant;
        List<ParticipantDto> members;
        MessageDto? last;
        int unread;
        using (var scope = scopes.CreateScope(autoComplete: true))
        {
            participant = Member(scope.Database, actor, id);
            conversation = scope.Database.SingleOrDefault<ConversationDto>("WHERE id=@0", id) ?? throw new MessengerException(404, "notFound");
            members = participant.Active ? scope.Database.Fetch<ParticipantDto>("WHERE conversationId=@0", id) : [];
            last = scope.Database.Fetch<MessageDto>(1, 1, "SELECT m.* FROM messengerMessage m WHERE m.conversationId=@0 AND " + Visible + " ORDER BY m.sequence DESC", id, actor).FirstOrDefault();
            unread = scope.Database.ExecuteScalar<int>("SELECT COUNT(*) FROM messengerMessage m WHERE m.conversationId=@0 AND " + Visible + " AND m.sequence>@2 AND m.senderKey<>@1", id, actor, participant.LastReadSequence);
        }
        var directory = new List<ParticipantResponse>();
        foreach (var member in members)
            directory.Add(new(member.UserKey, (await users.GetAsync(member.UserKey))?.Name ?? "Former user", member.Active));
        return new(id, conversation.Subject, participant.Active, participant.Muted, unread, participant.LastReadSequence,
            last is null ? null : await ResponseAsync(last), directory);
    }

    public async Task<MessagePage> MessagesAsync(Guid actor, Guid id, long? before, int take)
    {
        await ValidateAccessAsync(actor);
        if (take is < 1 or > 100 || before is <= 0) throw new MessengerException(400, "invalidPaging");
        List<MessageDto> messages;
        using (var scope = scopes.CreateScope(autoComplete: true))
        {
            Member(scope.Database, actor, id);
            messages = scope.Database.Fetch<MessageDto>(1, take + 1,
                "SELECT m.* FROM messengerMessage m WHERE m.conversationId=@0 AND " + Visible + " AND m.sequence<@2 ORDER BY m.sequence DESC",
                id, actor, before ?? long.MaxValue);
        }
        var hasMore = messages.Count > take;
        var page = messages.Take(take).Reverse().ToArray();
        var response = new List<MessageResponse>();
        foreach (var message in page) response.Add(await ResponseAsync(message));
        return new(response, hasMore ? page[0].Sequence : null);
    }

    public async Task<ConversationResponse> CreateAsync(Guid actor, CreateConversationRequest request)
    {
        await ValidateAccessAsync(actor);
        var subject = Text(request.Subject, 120, "invalidSubject");
        var body = Text(request.Body, 4000, "invalidBody");
        var keys = await ExpandAsync(request.UserIds, request.GroupIds);
        keys.Add(actor);
        if (keys.Count < 2) throw new MessengerException(400, "recipientRequired");
        if (keys.Count > MaximumParticipants) throw new MessengerException(400, "tooManyParticipants");
        var id = Guid.NewGuid();
        using (var scope = scopes.CreateScope())
        {
            var db = scope.Database;
            db.Insert(new ConversationDto { Id = id, Subject = subject, LastSequence = 1, CreatedUtc = UtcNow });
            foreach (var key in keys)
            {
                db.Insert(new ParticipantDto { Id = Guid.NewGuid(), ConversationId = id, UserKey = key, Active = true, LastReadSequence = key == actor ? 1 : 0 });
                Grant(db, id, key, 0, null);
            }
            db.Insert(new MessageDto { Id = Guid.NewGuid(), ConversationId = id, Sequence = 1, SenderKey = actor, Body = body, CreatedUtc = UtcNow });
            scope.Complete();
        }
        await NotifyAsync(id);
        return await DetailAsync(actor, id);
    }

    public async Task<MessageResponse> SendAsync(Guid actor, Guid id, SendMessageRequest request)
    {
        await ValidateAccessAsync(actor);
        var body = Text(request.Body, 4000, "invalidBody");
        MessageDto message;
        using (var scope = scopes.CreateScope())
        {
            var db = scope.Database;
            var conversation = Lock(db, id);
            Member(db, actor, id, active: true);
            if (conversation.LastSequence >= 9_007_199_254_740_990L) throw new MessengerException(409, "sequenceLimit");
            conversation.LastSequence++;
            db.Update(conversation);
            message = new() { Id = Guid.NewGuid(), ConversationId = id, Sequence = conversation.LastSequence, SenderKey = actor, Body = body, CreatedUtc = UtcNow };
            db.Insert(message);
            scope.Complete();
        }
        await NotifyAsync(id);
        return await ResponseAsync(message);
    }

    public async Task<ConversationResponse> InviteAsync(Guid actor, Guid id, RecipientsRequest request)
    {
        await ValidateAccessAsync(actor);
        // Validate authorization before expansion so strangers cannot probe group membership through errors.
        ActiveRecipients(actor, id);
        var keys = await ExpandAsync(request.UserIds, request.GroupIds);
        if (keys.Count == 0) throw new MessengerException(400, "recipientRequired");
        using (var scope = scopes.CreateScope())
        {
            var db = scope.Database;
            var conversation = Lock(db, id);
            Member(db, actor, id, active: true);
            var members = db.Fetch<ParticipantDto>("WHERE conversationId=@0", id);
            if (members.Count(x => x.Active) + keys.Count(key => members.All(x => x.UserKey != key || !x.Active)) > MaximumParticipants)
                throw new MessengerException(409, "tooManyParticipants");
            var shared = request.ShareHistory ? db.Fetch<VisibilityRangeDto>("WHERE conversationId=@0 AND userKey=@1", id, actor) : [];
            foreach (var key in keys)
            {
                var participant = members.SingleOrDefault(x => x.UserKey == key);
                var alreadyActive = participant?.Active == true;
                if (participant is null)
                {
                    participant = new() { Id = Guid.NewGuid(), ConversationId = id, UserKey = key, Active = true };
                    db.Insert(participant);
                }
                else { participant.Active = true; db.Update(participant); }
                foreach (var range in shared)
                {
                    var through = Math.Min(range.ThroughSequence ?? conversation.LastSequence, conversation.LastSequence);
                    if (through > range.AfterSequence) Grant(db, id, key, range.AfterSequence, through);
                }
                if (!alreadyActive) Grant(db, id, key, conversation.LastSequence, null);
            }
            scope.Complete();
        }
        await NotifyAsync(id);
        return await DetailAsync(actor, id);
    }

    public async Task LeaveAsync(Guid actor, Guid id)
    {
        await ValidateAccessAsync(actor);
        using (var scope = scopes.CreateScope())
        {
            var db = scope.Database;
            var conversation = Lock(db, id);
            var member = Member(db, actor, id, active: true);
            member.Active = false;
            db.Update(member);
            db.Execute("UPDATE messengerRange SET throughSequence=@0 WHERE conversationId=@1 AND userKey=@2 AND throughSequence IS NULL", conversation.LastSequence, id, actor);
            scope.Complete();
        }
        await NotifyAsync(id);
    }

    public async Task ReadAsync(Guid actor, Guid id, long sequence)
    {
        await ValidateAccessAsync(actor);
        using (var scope = scopes.CreateScope())
        {
            var db = scope.Database;
            Lock(db, id);
            var member = Member(db, actor, id, active: true);
            if (sequence < 1 || db.ExecuteScalar<int>("SELECT COUNT(*) FROM messengerMessage m WHERE m.conversationId=@0 AND " + Visible + " AND m.sequence=@2", id, actor, sequence) == 0)
                throw new MessengerException(400, "invalidReadSequence");
            member.LastReadSequence = Math.Max(member.LastReadSequence, sequence);
            db.Update(member);
            scope.Complete();
        }
        await NotifyUserAsync(actor, id);
    }

    public async Task MuteAsync(Guid actor, Guid id, bool muted)
    {
        await ValidateAccessAsync(actor);
        using (var scope = scopes.CreateScope())
        {
            Lock(scope.Database, id);
            var member = Member(scope.Database, actor, id, active: true);
            member.Muted = muted;
            scope.Database.Update(member);
            scope.Complete();
        }
        await NotifyUserAsync(actor, id);
    }

    public async Task<IReadOnlyList<PresenceResponse>> HeartbeatAsync(Guid actor, Guid id, string connectionId)
    {
        await ValidateAccessAsync(actor);
        var recipients = ActiveRecipients(actor, id);
        if (presence.Touch(actor, connectionId)) await PresenceChangedAsync(actor, true);
        var result = new List<PresenceResponse>();
        foreach (var key in recipients)
            if (Eligible(await users.GetAsync(key))) result.Add(new(key, presence.IsOnline(key)));
        return result;
    }

    public async Task TypingAsync(Guid actor, Guid id, string connectionId, bool typing)
    {
        await ValidateAccessAsync(actor);
        var recipients = ActiveRecipients(actor, id);
        if (!presence.CanType(connectionId, typing)) return;
        foreach (var key in recipients.Where(x => x != actor))
            if (await StillActiveAsync(key, id)) await hub.Clients.Group(MessengerHub.UserGroup(key)).TypingChanged(id, actor, typing);
    }

    public async Task PresenceChangedAsync(Guid actor, bool online)
    {
        if (!Eligible(await users.GetAsync(actor))) return;
        List<Guid> ids;
        using (var scope = scopes.CreateScope(autoComplete: true))
            ids = scope.Database.Fetch<ParticipantDto>("WHERE userKey=@0 AND active=@1", actor, true).Select(x => x.ConversationId).ToList();
        foreach (var id in ids)
        {
            // Recheck the actor too: a disconnect can race a leave request.
            if (!await StillActiveAsync(actor, id)) continue;
            foreach (var key in ActiveRecipients(actor, id).Where(x => x != actor))
                if (await StillActiveAsync(key, id)) await hub.Clients.Group(MessengerHub.UserGroup(key)).PresenceChanged(id, actor, online);
        }
    }

    private async Task<HashSet<Guid>> ExpandAsync(Guid[]? userIds, Guid[]? groupIds)
    {
        if (userIds is null || groupIds is null || userIds.Length + groupIds.Length > MaximumParticipants || userIds.Concat(groupIds).Contains(Guid.Empty))
            throw new MessengerException(400, "invalidRecipients");
        var direct = (await users.GetAsync(userIds.Distinct())).ToArray();
        var selectedGroups = (await groups.GetAsync(groupIds.Distinct())).ToArray();
        if (direct.Length != userIds.Distinct().Count() || selectedGroups.Length != groupIds.Distinct().Count())
            throw new MessengerException(400, "unknownRecipient");
        var keys = direct.Where(Eligible).Select(x => x.Key).ToHashSet();
        foreach (var group in selectedGroups)
        {
            keys.UnionWith(users.GetAllInGroup(group.Id).Where(Eligible).Select(x => x.Key));
            if (keys.Count > MaximumParticipants) throw new MessengerException(400, "tooManyParticipants");
        }
        return keys;
    }

    private List<Guid> ActiveRecipients(Guid actor, Guid id)
    {
        using var scope = scopes.CreateScope(autoComplete: true);
        Member(scope.Database, actor, id, active: true);
        return scope.Database.Fetch<ParticipantDto>("WHERE conversationId=@0 AND active=@1", id, true).Select(x => x.UserKey).ToList();
    }

    private async Task<bool> StillActiveAsync(Guid actor, Guid id)
    {
        if (!Eligible(await users.GetAsync(actor))) return false;
        using var scope = scopes.CreateScope(autoComplete: true);
        return scope.Database.SingleOrDefault<ParticipantDto>("WHERE conversationId=@0 AND userKey=@1", id, actor)?.Active == true;
    }

    private async Task NotifyAsync(Guid id)
    {
        List<Guid> recipients;
        using (var scope = scopes.CreateScope(autoComplete: true))
            recipients = scope.Database.Fetch<ParticipantDto>("WHERE conversationId=@0 AND active=@1", id, true).Select(x => x.UserKey).ToList();
        foreach (var key in recipients) await NotifyUserAsync(key, id);
    }
    private async Task NotifyUserAsync(Guid key, Guid id)
    {
        if (!await StillActiveAsync(key, id)) return;
        try { await hub.Clients.Group(MessengerHub.UserGroup(key)).ConversationChanged(id); }
        catch (Exception error) { logger.LogWarning(error, "Messenger refresh delivery failed after database commit"); }
    }

    private static ParticipantDto Member(IUmbracoDatabase db, Guid actor, Guid id, bool active = false)
    {
        var member = db.SingleOrDefault<ParticipantDto>("WHERE conversationId=@0 AND userKey=@1", id, actor) ?? throw new MessengerException(404, "notFound");
        if (active && !member.Active) throw new MessengerException(403, "notActive");
        return member;
    }
    private static ConversationDto Lock(IUmbracoDatabase db, Guid id)
    {
        // The UPDATE acquires the database row write lock before membership and sequence are read.
        if (db.Execute("UPDATE messengerConversation SET lastSequence=lastSequence WHERE id=@0", id) != 1) throw new MessengerException(404, "notFound");
        return db.Single<ConversationDto>("WHERE id=@0", id);
    }
    private static void Grant(IUmbracoDatabase db, Guid id, Guid userKey, long after, long? through)
    {
        var ranges = db.Fetch<VisibilityRangeDto>("WHERE conversationId=@0 AND userKey=@1", id, userKey);
        ranges.Add(new() { AfterSequence = after, ThroughSequence = through });
        var merged = new List<VisibilityRangeDto>();
        foreach (var range in ranges.OrderBy(x => x.AfterSequence))
        {
            var previous = merged.LastOrDefault();
            if (previous is not null && range.AfterSequence <= (previous.ThroughSequence ?? long.MaxValue))
                previous.ThroughSequence = previous.ThroughSequence is null || range.ThroughSequence is null ? null : Math.Max(previous.ThroughSequence.Value, range.ThroughSequence.Value);
            else merged.Add(range);
        }
        db.Delete<VisibilityRangeDto>("WHERE conversationId=@0 AND userKey=@1", id, userKey);
        foreach (var range in merged)
        {
            range.Id = Guid.NewGuid(); range.ConversationId = id; range.UserKey = userKey;
            db.Insert(range);
        }
    }
    private async Task<MessageResponse> ResponseAsync(MessageDto message) => new(message.Id, message.Sequence, message.SenderKey,
        (await users.GetAsync(message.SenderKey))?.Name ?? "Former user", message.Body, DateTime.SpecifyKind(message.CreatedUtc, DateTimeKind.Utc));
    private DateTime UtcNow => clock.GetUtcNow().UtcDateTime;
    private static string Text(string? text, int max, string code)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length > max) throw new MessengerException(400, code);
        return text.Trim();
    }
}
