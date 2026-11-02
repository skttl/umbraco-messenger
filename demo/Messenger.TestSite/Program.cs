var builder = WebApplication.CreateBuilder(args);
DevelopmentSettings.Configure(builder);
DemoUsers.Configure(builder);

builder.CreateUmbracoBuilder()
    .AddBackOffice()
    .AddWebsite()
    .AddComposers()
    .Build();

var app = builder.Build();
await app.BootUmbracoAsync();
await DemoUsers.SeedAsync(app);
app.UseUmbraco()
    .WithMiddleware(u => { u.UseBackOffice(); u.UseWebsite(); })
    .WithEndpoints(u => { u.UseBackOfficeEndpoints(); u.UseWebsiteEndpoints(); });
await app.RunAsync();
