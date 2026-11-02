using System.Security.Cryptography;
using System.Text.Json;

internal static class DevelopmentSettings
{
    internal static void Configure(WebApplicationBuilder builder)
    {
        if (!builder.Environment.IsDevelopment()) return;
        var path = Path.Combine(builder.Environment.ContentRootPath, "appsettings.Local.json");
        if (!File.Exists(path))
        {
            var database = Path.Combine(builder.Environment.ContentRootPath, "umbraco", "Data", "Messenger.sqlite.db");
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
    }
}
