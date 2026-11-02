using Microsoft.AspNetCore.Authorization;
using Umbraco.Cms.Web.Common.Authorization;

namespace Umbraco.Community.Messenger.Tests;

public sealed class MessengerPresenceTests
{
    [Fact]
    public void Multiple_tabs_stay_online_until_last_disconnect_and_expire_at_ttl()
    {
        var time = new TestClock(); var presence = new MessengerPresence(time); var user = Guid.NewGuid();
        Assert.True(presence.Touch(user, "one")); Assert.False(presence.Touch(user, "two"));
        Assert.False(presence.Remove(user, "one")); Assert.True(presence.IsOnline(user));
        time.Advance(TimeSpan.FromSeconds(44)); Assert.True(presence.IsOnline(user));
        presence.Touch(user, "two"); time.Advance(TimeSpan.FromSeconds(44)); Assert.True(presence.IsOnline(user));
        time.Advance(TimeSpan.FromSeconds(1)); Assert.False(presence.IsOnline(user));
        Assert.True(presence.Touch(user, "three")); Assert.True(presence.Remove(user, "three")); Assert.False(presence.IsOnline(user));
    }
    [Fact]
    public void Typing_is_rate_limited_and_disconnected_or_expired_connections_cannot_type()
    {
        var time = new TestClock(); var presence = new MessengerPresence(time); var user = Guid.NewGuid();
        Assert.False(presence.CanType("unknown", true));
        presence.Touch(user, "one"); Assert.True(presence.CanType("one", true)); Assert.False(presence.CanType("one", false));
        time.Advance(TimeSpan.FromMilliseconds(300)); Assert.True(presence.CanType("one", false));
        time.Advance(TimeSpan.FromSeconds(45)); Assert.False(presence.CanType("one", true));
    }
    [Fact]
    public void Connection_cannot_be_impersonated_and_hub_carries_backoffice_auth_policy()
    {
        var presence = new MessengerPresence(new TestClock()); var user = Guid.NewGuid();
        presence.Touch(user, "one");
        Assert.Throws<MessengerException>(() => presence.Touch(Guid.NewGuid(), "one"));
        Assert.False(presence.Remove(Guid.NewGuid(), "one")); Assert.True(presence.IsOnline(user));
        Assert.Contains(typeof(MessengerHub).GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>(),
            x => x.Policy == AuthorizationPolicies.BackOfficeAccess);
        Assert.DoesNotContain(typeof(MessengerHub).GetMethods(), x => x.Name is "Join" or "Subscribe" or "JoinGroup");
    }
}
