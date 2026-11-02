# Messenger client

Use Node 24.13+ and npm 11+ (the published Umbraco 18 backoffice/UUI peer requirement).

```
npm ci
npm test
npm run build
```

Build output is `../wwwroot/App_Plugins/Messenger`. The public manifest and dependency license text are copied on every build. Backoffice runtime imports are external; Lit, UUI, RxJS and SignalR dev dependencies supply their imported declaration types without bundling separate runtime copies.

`.npmrc` uses legacy-peer-deps because the backoffice development package declares the entire editor peer graph; this client needs only the imported compile peers. The generated fetch-client helpers are bundled and their generator's MIT license is included in public/DEPENDENCY_LICENSES.txt.

Start the demo on localhost:5189, then run `npm run generate-client` to regenerate `src/api` from its actual Messenger OpenAPI document. Do not edit generated files by hand. The js-yaml4.3.2 override is scoped to the generator's schema parser because npm audit reported high-severity YAML parser denial-of-service advisories. Generation is verified against the actual local JSON API document; remove the override when the upstream parser dependency is patched.

The first build must happen before building the Razor Class Library/demo so its static-web-assets manifest includes client files. If hashed chunk files change while the demo is running, rebuild/restart the demo before browser verification.

The UI keeps a dedicated authenticated SignalR connection in its global context, including while the panel is closed. REST data remains authoritative. Typing expires after five seconds; initial connection failures retry every five seconds, and reconnecting refetches current conversations/messages. Logout clears context and local compose/recipient state. Read markers are sent only for visible messages in an open focused active conversation. Failed read markers wait for explicit Retry instead of looping.
