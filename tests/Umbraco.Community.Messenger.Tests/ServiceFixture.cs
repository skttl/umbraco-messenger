using System.Data;
using Umbraco.Cms.Core.Scoping;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using NPoco;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Persistence.Querying;
using Umbraco.Cms.Infrastructure.Migrations;
using Umbraco.Cms.Infrastructure.Persistence;
using Umbraco.Cms.Infrastructure.Scoping;
using Umbraco.Cms.Persistence.Sqlite.Mappers;
using Umbraco.Cms.Persistence.Sqlite.Services;
using Umbraco.Cms.Core.Services;

namespace Umbraco.Community.Messenger.Tests;

public sealed class ServiceFixture : IDisposable
{
    public UmbracoDatabase Database { get; }
    public Mock<IUserService> Users { get; } = new();
    public Mock<IUserGroupService> Groups { get; } = new();
    public List<(string Group, Guid Conversation)> Notifications { get; } = [];
    public List<int> TransactionsAtNotification { get; } = [];
    public List<(string Kind, string Group, Guid Conversation, Guid User)> LiveEvents { get; } = [];
    public Dictionary<Guid, IUser> Directory { get; } = [];
    public MessengerService Service { get; }
    public MessengerPresence Presence { get; }
    public TestClock Clock { get; } = new();
    public int Transactions { get; private set; }
    private readonly SqliteConnection _keepAlive;
    public Guid Alice { get; }
    public Guid Bob { get; }
    public Guid Carol { get; }
    public Guid Eve { get; }

    public ServiceFixture(string? sharedConnection = null)
    {
        Alice = AddUser("Alice"); Bob = AddUser("Bob"); Carol = AddUser("Carol"); Eve = AddUser("Eve");
        Users.Setup(x => x.GetAsync(It.IsAny<Guid>())).Returns((Guid key) => Task.FromResult(Directory.GetValueOrDefault(key)));
        Users.Setup(x => x.GetAsync(It.IsAny<IEnumerable<Guid>>())).Returns((IEnumerable<Guid> keys) => Task.FromResult(keys.Where(Directory.ContainsKey).Select(x => Directory[x])));
        Groups.Setup(x => x.GetAsync(It.IsAny<IEnumerable<Guid>>())).ReturnsAsync([]);
        var cs = sharedConnection ?? $"Data Source=messenger-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";
        _keepAlive = new SqliteConnection(cs); _keepAlive.Open();
        var syntax = new SqliteSyntaxProvider(Options.Create(new GlobalSettings()), NullLogger<SqliteSyntaxProvider>.Instance);
        var context = new Mock<ISqlContext>();
        context.SetupGet(x => x.DatabaseType).Returns(DatabaseType.SQLite);
        context.SetupGet(x => x.SqlSyntax).Returns(syntax);
        Database = new(cs, context.Object, SqliteFactory.Instance, NullLogger<UmbracoDatabase>.Instance, null, null!, [new SqlitePocoGuidMapper()]);
        Database.OpenSharedConnection();
        var scopes = new Mock<Umbraco.Cms.Infrastructure.Scoping.IScopeProvider>();
        scopes.Setup(x => x.CreateScope(It.IsAny<IsolationLevel>(), It.IsAny<RepositoryCacheMode>(), It.IsAny<IEventDispatcher?>(),
                It.IsAny<IScopedNotificationPublisher?>(), It.IsAny<bool?>(), It.IsAny<bool>(), It.IsAny<bool>()))
            .Returns((IsolationLevel _, RepositoryCacheMode _, IEventDispatcher? _, IScopedNotificationPublisher? _, bool? _, bool _, bool auto) => Scope(auto));
        var clients = new Mock<IHubClients<IMessengerClient>>();
        clients.Setup(x => x.Group(It.IsAny<string>())).Returns((string group) =>
        {
            var client = new Mock<IMessengerClient>();
            client.Setup(x => x.ConversationChanged(It.IsAny<Guid>())).Callback((Guid id) =>
            {
                TransactionsAtNotification.Add(Transactions);
                Notifications.Add((group, id));
            }).Returns(Task.CompletedTask);
            client.Setup(x => x.TypingChanged(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<bool>()))
                .Callback((Guid conversation, Guid user, bool _) => LiveEvents.Add(("typing", group, conversation, user))).Returns(Task.CompletedTask);
            client.Setup(x => x.PresenceChanged(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<bool>()))
                .Callback((Guid conversation, Guid user, bool _) => LiveEvents.Add(("presence", group, conversation, user))).Returns(Task.CompletedTask);
            return client.Object;
        });
        var hub = new Mock<IHubContext<MessengerHub, IMessengerClient>>();
        hub.SetupGet(x => x.Clients).Returns(clients.Object);
        Presence = new(Clock);
        Service = new(scopes.Object, Users.Object, Groups.Object, hub.Object, Presence, Clock, NullLogger<MessengerService>.Instance);
    }
    private Umbraco.Cms.Infrastructure.Scoping.IScope Scope(bool auto)
    {
        var complete = auto;
        if (!auto) { Database.BeginTransaction(IsolationLevel.Serializable); Transactions++; }
        var scope = new Mock<Umbraco.Cms.Infrastructure.Scoping.IScope>();
        scope.SetupGet(x => x.Database).Returns(Database);
        scope.Setup(x => x.Complete()).Callback(() => complete = true).Returns(true);
        scope.Setup(x => x.Dispose()).Callback(() =>
        {
            if (auto) return;
            if (complete) Database.CompleteTransaction(); else Database.AbortTransaction();
            Transactions--;
        });
        return scope.Object;
    }
    public Guid AddUser(string name, bool enabled = true)
    {
        var key = Guid.NewGuid();
        var user = new Mock<IUser>();
        user.SetupGet(x => x.Key).Returns(key);
        user.SetupGet(x => x.Name).Returns(name);
        user.SetupGet(x => x.IsApproved).Returns(enabled);
        user.SetupGet(x => x.UserState).Returns(enabled ? UserState.Active : UserState.Disabled);
        Directory[key] = user.Object;
        return key;
    }
    public async Task MigrateAsync()
    {
        var context = new Mock<IMigrationContext>();
        context.SetupAllProperties();
        context.SetupGet(x => x.Database).Returns(Database);
        context.SetupGet(x => x.SqlContext).Returns(Database.SqlContext);
        context.SetupGet(x => x.Logger).Returns(NullLogger<IMigrationContext>.Instance);
        await new CreateMessengerTables(context.Object).RunAsync();
    }
    public Task<ConversationResponse> CreateAsync() => Service.CreateAsync(Alice, new("Subject", "First", [Bob], []));
    public void Dispose() { Database.Dispose(); _keepAlive.Dispose(); }
}

public sealed class TestClock : TimeProvider
{
    private DateTimeOffset _now = new(2026, 11, 2, 12, 0, 0, TimeSpan.Zero);
    public override DateTimeOffset GetUtcNow() => _now;
    public void Advance(TimeSpan duration) => _now += duration;
}
