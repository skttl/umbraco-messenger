# Development and demo

Requires .NET 10 and Node 24.13 or later with npm 11. Archive validation additionally uses Python 3 (available on the Linux CI runner). Install and build the client before building the server, demo or package:

```sh
cd src/Umbraco.Community.Messenger/Client
npm ci
npm test
npm run build
cd ../../..
dotnet restore Umbraco.Community.Messenger.slnx --configfile NuGet.Config
dotnet test tests/Umbraco.Community.Messenger.Tests --configuration Release --no-restore
dotnet build demo/Messenger.TestSite --configuration Debug --no-restore
dotnet pack src/Umbraco.Community.Messenger --configuration Release --no-restore --output artifacts
python scripts/validate-package.py artifacts/Umbraco.Community.Messenger.17.0.0.nupkg 17.0.0
```

The checked-in npm configuration handles the backoffice's peer dependency graph. The generated authenticated TypeScript SDK is committed under the client source; `npm run generate-client` regenerates it from the running local demo's OpenAPI endpoint. Client assets are bundled into static web assets; consuming sites need no npm build.

## Run the demo

```sh
dotnet run --project demo/Messenger.TestSite --no-launch-profile -- --environment Development --urls http://localhost:5189
```

Open `http://localhost:5189/umbraco`. In Development only, the demo creates ignored `demo/Messenger.TestSite/appsettings.Local.json` with a random administrator password, and `appsettings.DemoUsers.Local.json` with two random synthetic Editor logins and passwords. Read these local files privately to sign in; never commit or paste their credentials. No invitation or password email is sent. Existing local files are kept unchanged. Editor accounts are seeded transactionally after boot, keyed by their saved GUIDs, and subsequent launches do not reset their passwords. Run only one demo instance at a time.

The demo stores data in ignored `demo/Messenger.TestSite/umbraco/Data/Messenger18.sqlite.db` on main; the 17 branch uses `Messenger17.sqlite.db`. Never point an older Umbraco major at a database upgraded by a newer major. Existing older demo files remain untouched. Local credential files are excluded from publish output and the NuGet package.

If the database exists but the administrator settings are missing, startup fails visibly. Restore the original local settings or follow Umbraco's supported administrator password recovery process; the demo never resets a database. Invalid local JSON also fails visibly. The demo is for local development and is not a production deployment template.

## Release preparation

CI checks both release branches. Stable and prerelease tags are supported, for example `v18.0.0` and `v18.0.0-rc1`. A `v18.x.y` tag must refer to a commit on main; `v17.x.y` must refer to v17/main. The project version must match the tag without its `v` prefix. The publishing workflow verifies package identity, version, bounded dependency range and archive contents before GitHub OIDC authentication. Publishing requires separately configured NuGet trusted publishing, a release environment and its `NUGET_USER` secret. None is configured by building this repository.

## Umbraco 17 demo image dependency

The 17 demo pins patched ImageSharp 3.2.0. Its build target permits Debug builds without a license key and reports a warning; a Release build of the demo requires a valid Six Labors license. This dependency belongs to the demo and is not shipped by the Messenger library package.
