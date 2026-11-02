using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Umbraco.Cms.Web.Common.Authorization;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Services;
using Umbraco.Extensions;

namespace Umbraco.Community.Messenger;

public interface IMessengerClient
{
    Task ConversationChanged(Guid conversationId);
    Task TypingChanged(Guid conversationId, Guid userId, bool isTyping);
    Task PresenceChanged(Guid conversationId, Guid userId, bool isOnline);
}

[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]
public sealed class MessengerHub(MessengerService service, MessengerPresence presence, IRuntimeState runtime) : Hub<IMessengerClient>
{
    public static string UserGroup(Guid key) => $"messenger:user:{key:N}";
    private Guid Actor => Context.User?.Identity?.GetUserKey() ?? throw new HubException("unauthenticated");

    public override async Task OnConnectedAsync()
    {
        try
        {
            if (runtime.Level != RuntimeLevel.Run) { Context.Abort(); return; }
            var actor = Actor;
            await service.ValidateAccessAsync(actor);
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(actor));
            if (presence.Touch(actor, Context.ConnectionId)) await service.PresenceChangedAsync(actor, true);
            await base.OnConnectedAsync();
        }
        catch (MessengerException) { Context.Abort(); }
    }
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var actor = Context.User?.Identity?.GetUserKey();
        if (actor.HasValue && presence.Remove(actor.Value, Context.ConnectionId))
            await service.PresenceChangedAsync(actor.Value, false);
        await base.OnDisconnectedAsync(exception);
    }
    public async Task<IReadOnlyList<PresenceResponse>> Heartbeat(Guid conversationId)
    {
        try { return await service.HeartbeatAsync(Actor, conversationId, Context.ConnectionId); }
        catch (MessengerException error) { throw new HubException(error.Code); }
    }
    public async Task Typing(Guid conversationId, bool isTyping)
    {
        try { await service.TypingAsync(Actor, conversationId, Context.ConnectionId, isTyping); }
        catch (MessengerException error) { throw new HubException(error.Code); }
    }
}
