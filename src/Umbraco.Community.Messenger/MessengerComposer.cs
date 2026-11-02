using Asp.Versioning;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
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
        builder.Services.Configure<SwaggerGenOptions>(options =>
        {
            options.SwaggerDoc("messenger", new OpenApiInfo { Title = "Messenger API", Version = "1.0" });
            options.OperationFilter<MessengerSecurityFilter>();
        });
        builder.Services.AddSingleton<IOperationIdHandler, MessengerOperationIds>();
    }
}

public sealed class MessengerSecurityFilter : BackOfficeSecurityRequirementsOperationFilterBase
{
    protected override string ApiName => "messenger";
}

public sealed class MessengerOperationIds(IOptions<ApiVersioningOptions> options) : OperationIdHandler(options)
{
    protected override bool CanHandle(ApiDescription api, ControllerActionDescriptor action)
        => action.ControllerTypeInfo.AsType() == typeof(MessengerController);

    public override string Handle(ApiDescription api)
        => api.ActionDescriptor.AttributeRouteInfo?.Name
           ?? throw new InvalidOperationException("Messenger API operations require an explicit route name.");
}
