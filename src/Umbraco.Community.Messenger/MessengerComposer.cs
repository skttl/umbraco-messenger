using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Web.Common.ApplicationBuilder;

namespace Umbraco.Community.Messenger;

public sealed class MessengerComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.TryAddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<MessengerPresence>();
        builder.Services.AddScoped<MessengerService>();
        builder.Services.AddSignalR();
        builder.Services.Configure<UmbracoPipelineOptions>(options => options.AddFilter(new UmbracoPipelineFilter("Messenger", endpoints: app =>
        {
            app.UseEndpoints(endpoints => endpoints.MapHub<MessengerHub>(Constants.System.UmbracoPathSegment + "/messengerHub",
                hub => hub.CloseOnAuthenticationExpiration = true));
        })));
        builder.AddBackOfficeOpenApiDocument("messenger", document => document.WithTitle("Messenger API")
            .WithBackOfficeAuthentication().WithJsonOptions(Constants.JsonOptionsNames.BackOffice));
    }
}
