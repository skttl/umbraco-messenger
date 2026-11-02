using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Moq;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Messenger.Tests;

public sealed class MessengerBoundaryTests
{
    [Fact]
    public async Task Concurrent_sends_from_independent_connections_have_distinct_ordered_sequences()
    {
        var connection = $"Data Source=messenger-race-{Guid.NewGuid():N};Mode=Memory;Cache=Shared;Default Timeout=10";
        using var first = new ServiceFixture(connection); await first.MigrateAsync(); var c = await first.CreateAsync();
        using var second = new ServiceFixture(connection);
        foreach (var entry in first.Directory) second.Directory[entry.Key] = entry.Value;
        using var barrier = new Barrier(2);
        var sent = await Task.WhenAll(
            Task.Run(async () => { barrier.SignalAndWait(); return await first.Service.SendAsync(first.Alice, c.Id, new("One")); }),
            Task.Run(async () => { barrier.SignalAndWait(); return await second.Service.SendAsync(first.Bob, c.Id, new("Two")); }));
        Assert.Equal([2L, 3L], sent.Select(x => x.Sequence).Order());
        Assert.Equal(3, (await first.Service.MessagesAsync(first.Bob, c.Id, null, 50)).Items.Count);
    }

    [Fact]
    public async Task Participant_limit_rejection_rolls_back_the_entire_invitation()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        var extra = Enumerable.Range(0, 99).Select(i => f.AddUser($"User {i}")).ToArray();
        var error = await Assert.ThrowsAsync<MessengerException>(() => f.Service.InviteAsync(f.Alice, c.Id, new(extra, [])));
        Assert.Equal(409, error.Status);
        Assert.Equal(2, (await f.Service.DetailAsync(f.Alice, c.Id)).Participants.Count);
        Assert.Equal(0, f.Transactions);
        var atLimit = extra.Take(98).ToArray();
        var full = await f.Service.InviteAsync(f.Alice, c.Id, new(atLimit, []));
        Assert.Equal(100, full.Participants.Count);
    }

    [Fact]
    public async Task Live_events_recheck_receiver_account_and_current_membership()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        f.Presence.Touch(f.Alice, "alice"); f.Presence.Touch(f.Bob, "bob");
        await f.Service.TypingAsync(f.Alice, c.Id, "alice", true);
        Assert.Contains(f.LiveEvents, x => x.Kind == "typing" && x.Group == MessengerHub.UserGroup(f.Bob) && x.User == f.Alice);
        await f.Service.LeaveAsync(f.Bob, c.Id);
        f.LiveEvents.Clear(); f.Notifications.Clear();
        f.Clock.Advance(TimeSpan.FromSeconds(1));
        await f.Service.TypingAsync(f.Alice, c.Id, "alice", true);
        await f.Service.PresenceChangedAsync(f.Alice, true);
        await f.Service.SendAsync(f.Alice, c.Id, new("After leave"));
        Assert.Empty(f.LiveEvents);
        Assert.DoesNotContain(f.Notifications, x => x.Group == MessengerHub.UserGroup(f.Bob));
        await f.Service.InviteAsync(f.Alice, c.Id, new([f.Bob], []));
        Mock.Get(f.Directory[f.Bob]).SetupGet(x => x.IsApproved).Returns(false);
        f.Notifications.Clear();
        await f.Service.SendAsync(f.Alice, c.Id, new("Account disabled"));
        Assert.DoesNotContain(f.Notifications, x => x.Group == MessengerHub.UserGroup(f.Bob));
        await Assert.ThrowsAsync<MessengerException>(() => f.Service.HeartbeatAsync(f.Bob, c.Id, "bob"));
    }

    [Fact]
    public async Task Hub_uses_openiddict_subject_guid_instead_of_integer_name_identifier()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        var caller = new Mock<HubCallerContext>();
        caller.SetupGet(x => x.ConnectionId).Returns("bob-tab");
        caller.SetupGet(x => x.User).Returns(new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("sub", f.Bob.ToString()), new Claim(ClaimTypes.NameIdentifier, "42")], "OpenIddict")));
        var runtime = new Mock<IRuntimeState>(); runtime.SetupGet(x => x.Level).Returns(RuntimeLevel.Run);
        var group = new Mock<IGroupManager>();
        group.Setup(x => x.AddToGroupAsync("bob-tab", MessengerHub.UserGroup(f.Bob), default)).Returns(Task.CompletedTask);
        var hub = new MessengerHub(f.Service, f.Presence, runtime.Object) { Context = caller.Object, Groups = group.Object };
        await hub.OnConnectedAsync();
        Assert.True(f.Presence.IsOnline(f.Bob));
        group.Verify(x => x.AddToGroupAsync("bob-tab", MessengerHub.UserGroup(f.Bob), default), Times.Once);
        Assert.Contains(await hub.Heartbeat(c.Id), x => x.UserId == f.Bob && x.IsOnline);
        await hub.OnDisconnectedAsync(null); Assert.False(f.Presence.IsOnline(f.Bob));
    }
}
