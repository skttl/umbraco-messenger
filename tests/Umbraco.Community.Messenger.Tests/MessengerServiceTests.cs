using Moq;
namespace Umbraco.Community.Messenger.Tests;

public sealed class MessengerServiceTests
{
    [Fact]
    public async Task Migration_is_repeatable_and_messages_persist_before_notification()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); await f.MigrateAsync();
        var conversation = await f.CreateAsync();
        Assert.Equal("First", (await f.Service.MessagesAsync(f.Bob, conversation.Id, null, 50)).Items.Single().Body);
        Assert.Contains(f.Notifications, x => x.Group == MessengerHub.UserGroup(f.Bob));
        Assert.NotEmpty(f.TransactionsAtNotification);
        Assert.All(f.TransactionsAtNotification, count => Assert.Equal(0, count));
        Assert.Equal(0, f.Transactions);
    }

    [Fact]
    public async Task Nonparticipant_cannot_read_send_invite_change_preferences_or_observe_presence()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        await Error(404, () => f.Service.DetailAsync(f.Eve, c.Id));
        await Error(404, () => f.Service.MessagesAsync(f.Eve, c.Id, null, 10));
        await Error(404, () => f.Service.SendAsync(f.Eve, c.Id, new("intrusion")));
        await Error(404, () => f.Service.InviteAsync(f.Eve, c.Id, new([f.Carol], [])));
        await Error(404, () => f.Service.MuteAsync(f.Eve, c.Id, true));
        await Error(404, () => f.Service.ReadAsync(f.Eve, c.Id, 1));
        await Error(404, () => f.Service.HeartbeatAsync(f.Eve, c.Id, "spy"));
        await Error(404, () => f.Service.TypingAsync(f.Eve, c.Id, "spy", true));
        Assert.Single((await f.Service.MessagesAsync(f.Alice, c.Id, null, 50)).Items);
    }

    [Fact]
    public async Task Leave_retains_history_but_rejoin_preserves_gap_and_blocks_stale_socket()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        f.Presence.Touch(f.Bob, "old-tab");
        await f.Service.LeaveAsync(f.Bob, c.Id);
        f.Notifications.Clear();
        await f.Service.SendAsync(f.Alice, c.Id, new("Hidden while absent"));
        Assert.DoesNotContain(f.Notifications, x => x.Group == MessengerHub.UserGroup(f.Bob));
        Assert.Single((await f.Service.MessagesAsync(f.Bob, c.Id, null, 50)).Items);
        Assert.Empty((await f.Service.DetailAsync(f.Bob, c.Id)).Participants);
        await Error(403, () => f.Service.SendAsync(f.Bob, c.Id, new("no")));
        await Error(403, () => f.Service.InviteAsync(f.Bob, c.Id, new([f.Carol], [])));
        await Error(403, () => f.Service.ReadAsync(f.Bob, c.Id, 1));
        await Error(403, () => f.Service.MuteAsync(f.Bob, c.Id, false));
        await Error(403, () => f.Service.HeartbeatAsync(f.Bob, c.Id, "old-tab"));
        await Error(403, () => f.Service.TypingAsync(f.Bob, c.Id, "old-tab", true));
        await f.Service.InviteAsync(f.Alice, c.Id, new([f.Bob], []));
        await f.Service.SendAsync(f.Bob, c.Id, new("After rejoin"));
        Assert.Equal(["First", "After rejoin"], (await f.Service.MessagesAsync(f.Bob, c.Id, null, 50)).Items.Select(x => x.Body));
    }

    [Fact]
    public async Task Inviter_can_share_only_visible_ranges_and_an_authorized_user_can_later_fill_gaps()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        await f.Service.LeaveAsync(f.Bob, c.Id);
        await f.Service.SendAsync(f.Alice, c.Id, new("Bob cannot share this"));
        await f.Service.InviteAsync(f.Alice, c.Id, new([f.Bob], []));
        await f.Service.SendAsync(f.Alice, c.Id, new("Visible after rejoin"));
        await f.Service.InviteAsync(f.Bob, c.Id, new([f.Carol], [], true));
        Assert.Equal([1L, 3L], (await f.Service.MessagesAsync(f.Carol, c.Id, null, 50)).Items.Select(x => x.Sequence));
        await f.Service.InviteAsync(f.Alice, c.Id, new([f.Carol], [], true));
        Assert.Equal([1L, 2L, 3L], (await f.Service.MessagesAsync(f.Carol, c.Id, null, 50)).Items.Select(x => x.Sequence));
    }

    [Fact]
    public async Task Future_only_invite_hides_prior_messages_and_all_active_participants_can_invite()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        await f.Service.InviteAsync(f.Bob, c.Id, new([f.Carol], []));
        Assert.Empty((await f.Service.MessagesAsync(f.Carol, c.Id, null, 50)).Items);
        await f.Service.SendAsync(f.Carol, c.Id, new("New member"));
        Assert.Equal("New member", (await f.Service.MessagesAsync(f.Carol, c.Id, null, 50)).Items.Single().Body);
    }

    [Fact]
    public async Task Group_expansion_deduplicates_excludes_disabled_and_remains_a_snapshot()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync();
        var disabled = f.AddUser("Disabled", false);
        var groupKey = Guid.NewGuid();
        var group = new Moq.Mock<Umbraco.Cms.Core.Models.Membership.IUserGroup>();
        group.SetupGet(x => x.Key).Returns(groupKey); group.SetupGet(x => x.Id).Returns(42);
        f.Groups.Setup(x => x.GetAsync(Moq.It.IsAny<IEnumerable<Guid>>())).ReturnsAsync([group.Object]);
        f.Users.Setup(x => x.GetAllInGroup(42)).Returns([f.Directory[f.Bob], f.Directory[disabled], f.Directory[f.Bob]]);
        var c = await f.Service.CreateAsync(f.Alice, new("Group", "Text", [f.Bob], [groupKey]));
        Assert.Equal(2, c.Participants.Count);
        Assert.DoesNotContain(c.Participants, x => x.Id == disabled);
        f.Users.Setup(x => x.GetAllInGroup(42)).Returns([f.Directory[f.Carol]]);
        await Error(404, () => f.Service.DetailAsync(f.Carol, c.Id));
        Assert.Contains((await f.Service.DetailAsync(f.Bob, c.Id)).Participants, x => x.Id == f.Bob);
    }

    [Fact]
    public async Task Muted_unread_stays_in_list_but_not_header_and_read_marker_is_monotonic()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        Assert.Equal(1, (await f.Service.ListAsync(f.Bob)).UnreadConversationCount);
        await f.Service.MuteAsync(f.Bob, c.Id, true);
        var list = await f.Service.ListAsync(f.Bob);
        Assert.Equal(0, list.UnreadConversationCount); Assert.Equal(1, list.Items.Single().UnreadCount);
        await f.Service.SendAsync(f.Alice, c.Id, new("Second"));
        await f.Service.ReadAsync(f.Bob, c.Id, 2); await f.Service.ReadAsync(f.Bob, c.Id, 1);
        Assert.Equal(2, (await f.Service.DetailAsync(f.Bob, c.Id)).LastReadSequence);
        Assert.Equal(0, (await f.Service.DetailAsync(f.Bob, c.Id)).UnreadCount);
    }

    [Fact]
    public async Task Paging_is_keyset_ordered_and_read_cannot_mark_hidden_or_future_messages()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        await f.Service.SendAsync(f.Alice, c.Id, new("Second"));
        await f.Service.SendAsync(f.Alice, c.Id, new("Third"));
        var page = await f.Service.MessagesAsync(f.Bob, c.Id, null, 2);
        Assert.Equal([2L, 3L], page.Items.Select(x => x.Sequence)); Assert.Equal(2, page.NextBeforeSequence);
        Assert.Equal(1, (await f.Service.MessagesAsync(f.Bob, c.Id, page.NextBeforeSequence, 2)).Items.Single().Sequence);
        await Error(400, () => f.Service.ReadAsync(f.Bob, c.Id, 4));
        await f.Service.LeaveAsync(f.Bob, c.Id); await f.Service.SendAsync(f.Alice, c.Id, new("Hidden"));
        await f.Service.InviteAsync(f.Alice, c.Id, new([f.Bob], []));
        await Error(400, () => f.Service.ReadAsync(f.Bob, c.Id, 4));
    }

    [Theory]
    [InlineData(0)] [InlineData(101)]
    public async Task Invalid_paging_is_rejected(int take)
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        await Error(400, () => f.Service.MessagesAsync(f.Bob, c.Id, null, take));
    }

    [Fact]
    public async Task Text_and_recipient_validation_prevents_partial_writes_and_plain_text_is_retained()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync();
        await Error(400, () => f.Service.CreateAsync(f.Alice, new(" ", "Body", [f.Bob], [])));
        await Error(400, () => f.Service.CreateAsync(f.Alice, new(new string('a', 121), "Body", [f.Bob], [])));
        await Error(400, () => f.Service.CreateAsync(f.Alice, new("Subject", "", [f.Bob], [])));
        await Error(400, () => f.Service.CreateAsync(f.Alice, new("Subject", new string('a', 100_001), [f.Bob], [])));
        await Error(400, () => f.Service.CreateAsync(f.Alice, new("Subject", "Body", [], [])));
        await Error(400, () => f.Service.CreateAsync(f.Alice, new("Subject", "Body", [Guid.NewGuid()], [])));
        await Error(400, () => f.Service.CreateAsync(f.Alice, new("Subject", "Body", [Guid.Empty], [])));
        Assert.Empty((await f.Service.ListAsync(f.Alice)).Items);
        var c = await f.CreateAsync();
        var text = await f.Service.SendAsync(f.Alice, c.Id, new("<script>alert('x')</script>"));
        Assert.Equal("<script>alert('x')</script>", text.Body);
        await Error(400, () => f.Service.SendAsync(f.Alice, c.Id, new(" ")));
        Assert.Equal(2, (await f.Service.MessagesAsync(f.Bob, c.Id, null, 50)).Items.Count);
    }

    [Fact]
    public async Task Disabled_actor_is_rejected_on_service_and_hub_operations()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        var disabled = f.AddUser("Disabled", false);
        await Error(403, () => f.Service.ListAsync(disabled));
        await Error(403, () => f.Service.SendAsync(disabled, c.Id, new("No")));
        await Error(403, () => f.Service.HeartbeatAsync(disabled, c.Id, "socket"));
        await Error(403, () => f.Service.TypingAsync(disabled, c.Id, "socket", true));
    }

    [Fact]
    public async Task Presence_snapshot_only_contains_shared_active_participants()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync(); var c = await f.CreateAsync();
        f.Presence.Touch(f.Eve, "other"); f.Presence.Touch(f.Bob, "bob");
        var snapshot = await f.Service.HeartbeatAsync(f.Alice, c.Id, "alice");
        Assert.Equal(2, snapshot.Count); Assert.DoesNotContain(snapshot, x => x.UserId == f.Eve);
        Assert.True(snapshot.Single(x => x.UserId == f.Bob).IsOnline);
        await f.Service.LeaveAsync(f.Bob, c.Id);
        Assert.DoesNotContain(await f.Service.HeartbeatAsync(f.Alice, c.Id, "alice"), x => x.UserId == f.Bob);
    }

    [Theory]
    [InlineData(99_999)]
    [InlineData(100_000)]
    public async Task Long_messages_are_persisted_in_full_for_creation_and_replies(int length)
    {
        using var f = new ServiceFixture(); await f.MigrateAsync();
        var initial = new string('æ', length - 1) + "ø";
        var reply = new string('é', length - 1) + "ñ";
        var c = await f.Service.CreateAsync(f.Alice, new("Long messages", initial, [f.Bob], []));
        var sent = await f.Service.SendAsync(f.Bob, c.Id, new(reply));
        Assert.Equal(reply, sent.Body);
        Assert.Equal([initial, reply], (await f.Service.MessagesAsync(f.Bob, c.Id, null, 50)).Items.Select(x => x.Body));
    }

    [Fact]
    public async Task Overlong_creation_and_reply_are_rejected_without_partial_writes()
    {
        using var f = new ServiceFixture(); await f.MigrateAsync();
        var body = new string('a', 100_001);
        var createError = await Assert.ThrowsAsync<MessengerException>(() => f.Service.CreateAsync(f.Alice, new("Too long", body, [f.Bob], [])));
        Assert.Equal(400, createError.Status); Assert.Equal("invalidBody", createError.Code);
        Assert.Empty((await f.Service.ListAsync(f.Alice)).Items);
        var c = await f.CreateAsync(); f.Notifications.Clear();
        var replyError = await Assert.ThrowsAsync<MessengerException>(() => f.Service.SendAsync(f.Bob, c.Id, new(body)));
        Assert.Equal(400, replyError.Status); Assert.Equal("invalidBody", replyError.Code);
        Assert.Equal("First", (await f.Service.MessagesAsync(f.Alice, c.Id, null, 50)).Items.Single().Body);
        Assert.Empty(f.Notifications);
    }

    private static async Task Error(int status, Func<Task> action)
        => Assert.Equal(status, (await Assert.ThrowsAsync<MessengerException>(action)).Status);
}
