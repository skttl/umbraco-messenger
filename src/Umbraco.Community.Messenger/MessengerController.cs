using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Common.Attributes;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Core.Security;

namespace Umbraco.Community.Messenger;

[VersionedApiBackOfficeRoute("messenger")]
[ApiExplorerSettings(GroupName = "messenger")]
[MapToApi("messenger")]
[ProducesResponseType(typeof(ProblemDetails), 400)]
[ProducesResponseType(typeof(ProblemDetails), 403)]
[ProducesResponseType(typeof(ProblemDetails), 404)]
[ProducesResponseType(typeof(ProblemDetails), 409)]
public sealed class MessengerController(MessengerService service, IBackOfficeSecurityAccessor security) : ManagementApiControllerBase
{
    private Guid Actor => CurrentUserKey(security);

    [HttpGet("directory", Name = "getMessengerDirectory")]
    [ProducesResponseType(typeof(DirectoryResponse), 200)]
    public Task<IActionResult> Directory([FromQuery] string? query = null) => Result(() => service.DirectoryAsync(Actor, query));

    [HttpGet("conversations", Name = "getMessengerConversations")]
    [ProducesResponseType(typeof(ConversationListResponse), 200)]
    public Task<IActionResult> Conversations() => Result(() => service.ListAsync(Actor));

    [HttpPost("conversations", Name = "postMessengerConversation")]
    [ProducesResponseType(typeof(ConversationResponse), 201)]
    public Task<IActionResult> Create([FromBody] CreateConversationRequest request) => Result(() => service.CreateAsync(Actor, request), 201);

    [HttpGet("conversations/{id:guid}", Name = "getMessengerConversation")]
    [ProducesResponseType(typeof(ConversationResponse), 200)]
    public Task<IActionResult> Conversation(Guid id) => Result(() => service.DetailAsync(Actor, id));

    [HttpGet("conversations/{id:guid}/messages", Name = "getMessengerMessages")]
    [ProducesResponseType(typeof(MessagePage), 200)]
    public Task<IActionResult> Messages(Guid id, [FromQuery] long? beforeSequence = null, [FromQuery] int take = 50)
        => Result(() => service.MessagesAsync(Actor, id, beforeSequence, take));

    [HttpPost("conversations/{id:guid}/messages", Name = "postMessengerMessage")]
    [ProducesResponseType(typeof(MessageResponse), 201)]
    public Task<IActionResult> Send(Guid id, [FromBody] SendMessageRequest request) => Result(() => service.SendAsync(Actor, id, request), 201);

    [HttpPost("conversations/{id:guid}/participants", Name = "postMessengerParticipants")]
    [ProducesResponseType(typeof(ConversationResponse), 200)]
    public Task<IActionResult> Invite(Guid id, [FromBody] RecipientsRequest request) => Result(() => service.InviteAsync(Actor, id, request));

    [HttpDelete("conversations/{id:guid}/membership", Name = "deleteMessengerMembership")]
    [ProducesResponseType(204)]
    public Task<IActionResult> Leave(Guid id) => Complete(() => service.LeaveAsync(Actor, id));

    [HttpPut("conversations/{id:guid}/read", Name = "putMessengerRead")]
    [ProducesResponseType(204)]
    public Task<IActionResult> Read(Guid id, [FromBody] ReadRequest request) => Complete(() => service.ReadAsync(Actor, id, request.Sequence));

    [HttpPut("conversations/{id:guid}/mute", Name = "putMessengerMute")]
    [ProducesResponseType(204)]
    public Task<IActionResult> Mute(Guid id, [FromBody] MuteRequest request) => Complete(() => service.MuteAsync(Actor, id, request.Muted));

    private async Task<IActionResult> Result<T>(Func<Task<T>> action, int status = 200)
    {
        try { return StatusCode(status, await action()); }
        catch (MessengerException error) { return Failure(error); }
    }
    private async Task<IActionResult> Complete(Func<Task> action)
    {
        try { await action(); return NoContent(); }
        catch (MessengerException error) { return Failure(error); }
    }
    private ObjectResult Failure(MessengerException error) => StatusCode(error.Status,
        new ProblemDetails { Status = error.Status, Title = error.Code, Extensions = { ["code"] = error.Code } });
}
