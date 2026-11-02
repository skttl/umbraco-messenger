using NPoco;
using Umbraco.Cms.Infrastructure.Migrations;
using Umbraco.Cms.Core.Packaging;
using Umbraco.Cms.Infrastructure.Persistence.DatabaseAnnotations;
using Umbraco.Cms.Infrastructure.Persistence.DatabaseModelDefinitions;

namespace Umbraco.Community.Messenger;

public sealed class MessengerMigrationPlan() : PackageMigrationPlan("Umbraco.Community.Messenger")
{
    public override bool IgnoreCurrentState => false;
    protected override void DefinePlan() => To<CreateMessengerTables>("messenger-schema-v1");
}

public sealed class CreateMessengerTables(IMigrationContext context) : AsyncMigrationBase(context)
{
    protected override Task MigrateAsync()
    {
        if (!TableExists("messengerConversation")) Create.Table<ConversationDto>().Do();
        if (!TableExists("messengerParticipant")) Create.Table<ParticipantDto>().Do();
        if (!TableExists("messengerRange")) Create.Table<VisibilityRangeDto>().Do();
        if (!TableExists("messengerMessage")) Create.Table<MessageDto>().Do();
        return Task.CompletedTask;
    }
}

[TableName("messengerConversation"), PrimaryKey("id", AutoIncrement = false), ExplicitColumns]
public sealed class ConversationDto
{
    [Column("id"), PrimaryKeyColumn(AutoIncrement = false)] public Guid Id { get; set; }
    [Column("subject"), Length(120)] public string Subject { get; set; } = "";
    [Column("createdUtc")] public DateTime CreatedUtc { get; set; }
    [Column("lastSequence")] public long LastSequence { get; set; }
}

[TableName("messengerParticipant"), PrimaryKey("id", AutoIncrement = false), ExplicitColumns]
public sealed class ParticipantDto
{
    [Column("id"), PrimaryKeyColumn(AutoIncrement = false)] public Guid Id { get; set; }
    [Column("conversationId"), Index(IndexTypes.UniqueNonClustered, ForColumns = "conversationId,userKey", Name = "IX_messengerParticipant_member")] public Guid ConversationId { get; set; }
    [Column("userKey"), Index(IndexTypes.NonClustered, Name = "IX_messengerParticipant_user")] public Guid UserKey { get; set; }
    [Column("active")] public bool Active { get; set; }
    [Column("muted")] public bool Muted { get; set; }
    [Column("lastReadSequence")] public long LastReadSequence { get; set; }
}

[TableName("messengerRange"), PrimaryKey("id", AutoIncrement = false), ExplicitColumns]
public sealed class VisibilityRangeDto
{
    [Column("id"), PrimaryKeyColumn(AutoIncrement = false)] public Guid Id { get; set; }
    [Column("conversationId"), Index(IndexTypes.NonClustered, ForColumns = "conversationId,userKey", Name = "IX_messengerRange_member")] public Guid ConversationId { get; set; }
    [Column("userKey")] public Guid UserKey { get; set; }
    [Column("afterSequence")] public long AfterSequence { get; set; }
    [Column("throughSequence"), NullSetting(NullSetting = NullSettings.Null)] public long? ThroughSequence { get; set; }
}

[TableName("messengerMessage"), PrimaryKey("id", AutoIncrement = false), ExplicitColumns]
public sealed class MessageDto
{
    [Column("id"), PrimaryKeyColumn(AutoIncrement = false)] public Guid Id { get; set; }
    [Column("conversationId"), Index(IndexTypes.UniqueNonClustered, ForColumns = "conversationId,sequence", Name = "IX_messengerMessage_sequence")] public Guid ConversationId { get; set; }
    [Column("sequence")] public long Sequence { get; set; }
    [Column("senderKey")] public Guid SenderKey { get; set; }
    [Column("body"), SpecialDbType(SpecialDbTypes.NVARCHARMAX)] public string Body { get; set; } = "";
    [Column("createdUtc")] public DateTime CreatedUtc { get; set; }
}
