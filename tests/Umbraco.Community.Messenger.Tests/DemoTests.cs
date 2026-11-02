using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Hosting;

namespace Umbraco.Community.Messenger.Tests;

public sealed class DemoTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "MessengerDemoTests", Guid.NewGuid().ToString("N"));
    private WebApplicationBuilder Builder(string environment = "Development")
    {
        Directory.CreateDirectory(_root);
        return WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = environment, ContentRootPath = _root });
    }

    [Fact]
    public void ExistingAdminSettingsAreNeverOverwritten()
    {
        var builder = Builder();
        var path = Path.Combine(_root, "appsettings.Local.json");
        const string original = "{\"Custom\":\"keep\"}";
        File.WriteAllText(path, original);
        DevelopmentSettings.Configure(builder);
        Assert.Equal(original, File.ReadAllText(path));
    }

    [Fact]
    public void ProductionWritesNoCredentialFiles()
    {
        var builder = Builder(Environments.Production);
        DevelopmentSettings.Configure(builder);
        DemoUsers.Configure(builder);
        Assert.Empty(Directory.GetFiles(_root, "*.json"));
    }

    [Fact]
    public void ExistingDatabaseWithoutAdminSettingsFailsWithoutChangingData()
    {
        var builder = Builder();
        var directory = Directory.CreateDirectory(Path.Combine(_root, "umbraco", "Data"));
        var path = Path.Combine(directory.FullName, "Messenger17.sqlite.db");
        File.WriteAllText(path, "existing data");
        Assert.Throws<InvalidOperationException>(() => DevelopmentSettings.Configure(builder));
        Assert.Equal("existing data", File.ReadAllText(path));
        Assert.False(File.Exists(Path.Combine(_root, "appsettings.Local.json")));
    }

    [Fact]
    public void MalformedExistingAdminSettingsFailWithoutReplacement()
    {
        var builder = Builder();
        var path = Path.Combine(_root, "appsettings.Local.json");
        File.WriteAllText(path, "invalid json");
        Assert.Throws<InvalidDataException>(() => DevelopmentSettings.Configure(builder));
        Assert.Equal("invalid json", File.ReadAllText(path));
    }

    [Fact]
    public void GeneratedAdminPasswordMeetsBoundsAndStaysStable()
    {
        var builder = Builder();
        DevelopmentSettings.Configure(builder);
        var path = Path.Combine(_root, "appsettings.Local.json");
        var original = File.ReadAllText(path);
        using var json = JsonDocument.Parse(original);
        AssertPassword(json.RootElement.GetProperty("Umbraco").GetProperty("CMS").GetProperty("Unattended").GetProperty("UnattendedUserPassword").GetString()!);
        DevelopmentSettings.Configure(Builder());
        Assert.Equal(original, File.ReadAllText(path));
    }

    [Fact]
    public void GeneratedDemoAccountsAreDistinctSyntheticAndStable()
    {
        DemoUsers.Configure(Builder());
        var path = Path.Combine(_root, "appsettings.DemoUsers.Local.json");
        var original = File.ReadAllText(path);
        using var json = JsonDocument.Parse(original);
        var accounts = json.RootElement.GetProperty("DemoUsers").EnumerateArray().ToArray();
        Assert.Equal(2, accounts.Length);
        Assert.Equal(2, accounts.Select(a => a.GetProperty("Key").GetGuid()).Distinct().Count());
        Assert.Equal(2, accounts.Select(a => a.GetProperty("Email").GetString()).Distinct().Count());
        foreach (var account in accounts)
        {
            Assert.EndsWith("@example.test", account.GetProperty("Email").GetString());
            AssertPassword(account.GetProperty("Password").GetString()!);
        }
        DemoUsers.Configure(Builder());
        Assert.Equal(original, File.ReadAllText(path));
    }

    private static void AssertPassword(string password)
    {
        Assert.InRange(password.Length, 12, 128);
        Assert.Contains(password, char.IsUpper);
        Assert.Contains(password, char.IsLower);
        Assert.Contains(password, char.IsDigit);
        Assert.Contains(password, c => !char.IsLetterOrDigit(c));
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);
}
