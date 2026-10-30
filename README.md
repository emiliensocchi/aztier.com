A simple frontend for the [Azure administrative tiering](https://github.com/emiliensocchi/azure-tiering) (AzTier) project.

## Run locally

The site is static (no build step). Serve the folder over HTTP, since browsers block `fetch()` of `config.json` from `file://`:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Then open http://127.0.0.1:8000. Data is loaded from the URLs in `config.json`, which point to the `main` branch of the azure-tiering repository.

## Share links

The URL hash reflects the current view: `#<azure|entra|msgraph>[-tier-<n>...][?asset=<id>]`, e.g. `#entra-tier-0?asset=e8611ab8-c189-46e8-94e1-60213ab1f814`.
