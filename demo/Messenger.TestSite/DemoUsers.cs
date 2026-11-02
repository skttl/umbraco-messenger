using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Scoping;
using Umbraco.Cms.Core.Services;
using File = System.IO.File;

internal static class DemoUsers
{
    internal sealed record Account(Guid Key, string Name, string Email, string Password);

    internal static void Configure(WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsDevelopment()) return;
        var path = Path.Combine(builder.Environment.ContentRootPath, "appsettings.DemoUsers.Local.json");
        if (!File.Exists(path))
        {
            var accounts = Enumerable.Range(1, 2).Select(i => new Account(Guid.NewGuid(), $"Demo Editor {i}",
                $"messenger-{Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant()}@example.test",
                "Msgr!9-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(24)))).ToArray();
            // CreateNew prevents another startup from overwriting saved credentials.
            using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            JsonSerializer.Serialize(file, new { DemoUsers = accounts }, new JsonSerializerOptions { WriteIndented = true });
        }
        builder.Configuration.AddJsonFile(path, optional: false, reloadOnChange: false);
    }

    internal static async Task SeedAsync(WebApplication app)
    {
        if (!app.Environment.IsDevelopment()) return;
        var accounts = app.Configuration.GetSection("DemoUsers").Get<Account[]>()
            ?? throw new InvalidOperationException("DemoUsers local configuration is missing.");
        if (accounts.Length != 2 || accounts.Any(a => a.Key == Guid.Empty || string.IsNullOrWhiteSpace(a.Email) || string.IsNullOrWhiteSpace(a.Password)))
            throw new InvalidOperationException("DemoUsers local configuration must contain two valid accounts.");
        using var services = app.Services.CreateScope();
        var users = services.ServiceProvider.GetRequiredService<IUserService>();
        var scopes = services.ServiceProvider.GetRequiredService<ICoreScopeProvider>();
        foreach (var account in accounts)
        {
            using var transaction = scopes.CreateCoreScope();
            var existing = await users.GetAsync(account.Key);
            if (existing is not null)
            {
                if (existing.Email != account.Email || existing.Username != account.Email)
                    throw new InvalidOperationException("A demo user key belongs to a different account.");
                transaction.Complete();
                continue;
            }
            var created = await users.CreateAsync(Constants.Security.SuperUserKey, new UserCreateModel
            {
                Id = account.Key, Name = account.Name, Email = account.Email, UserName = account.Email,
                Kind = UserKind.Default, UserGroupKeys = new HashSet<Guid> { Constants.Security.EditorGroupKey }
            }, approveUser: true);
            if (!created.Success || created.Result.CreatedUser is null)
                throw new InvalidOperationException($"Demo editor creation failed: {created.Status}");
            var changed = await users.ChangePasswordAsync(Constants.Security.SuperUserKey,
                new ChangeUserPasswordModel { UserKey = created.Result.CreatedUser.Key, NewPassword = account.Password });
            if (!changed.Success)
                throw new InvalidOperationException($"Demo editor password setup failed: {changed.Status}");
            transaction.Complete();
        }
    }
}
