using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

internal static class DevelopmentSettings
{
    internal static void Configure(WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsDevelopment()) return;
        Directory.CreateDirectory(Path.Combine(builder.Environment.ContentRootPath, "umbraco", "Data"));
        var path = Path.Combine(builder.Environment.ContentRootPath, "appsettings.Local.json");
        if (!File.Exists(path))
        {
            var database = Path.Combine(builder.Environment.ContentRootPath, "umbraco", "Data", "Messenger19.sqlite.db");
            if (File.Exists(database))
                throw new InvalidOperationException("The demo database exists but appsettings.Local.json is missing. Restore your local settings or reset the admin password using Umbraco's supported recovery process.");

            var settings = new
            {
                Umbraco = new
                {
                    CMS = new
                    {
                        Unattended = new
                        {
                            InstallUnattended = true,
                            UpgradeUnattended = true,
                            UnattendedUserName = "Messenger Admin",
                            UnattendedUserEmail = "admin@example.com",
                            UnattendedUserPassword = "Msgr!9-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(24))
                        },
                        Imaging = new { HMACSecretKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)) }
                    }
                }
            };
            try
            {
                using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                JsonSerializer.Serialize(file, settings, new JsonSerializerOptions { WriteIndented = true });
            }
            catch (IOException) when (File.Exists(path))
            {
                // Another demo process created the settings; configuration loading validates them.
            }
        }
        builder.Configuration.AddJsonFile(path, optional: false, reloadOnChange: false);
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:umbracoDbDSN"] = "Data Source=|DataDirectory|/Messenger19.sqlite.db;Cache=Shared;Foreign Keys=True;Pooling=True",
            ["ConnectionStrings:umbracoDbDSN_ProviderName"] = "Microsoft.Data.Sqlite",
            ["Umbraco:CMS:Unattended:UnattendedUserEmail"] = "admin@example.com",
            ["Umbraco:CMS:Unattended:UnattendedUserPassword"] = "1234567890"
        });
    }
}
