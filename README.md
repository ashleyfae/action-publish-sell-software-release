# Publish Sell Software Release

A GitHub Action that publishes WordPress plugin releases to a [Laravel sell-software](https://github.com/ashleyfae/sell-software) platform via the [laravel-git-releases](https://github.com/ashleyfae/laravel-git-releases) API.

## Features

- Automatically parses changelog from WordPress `readme.txt` format and sends it as release notes
- Automatically parses PHP and WordPress version requirements from `readme.txt` headers
- Converts changelog markdown to HTML
- Authenticates via Laravel Sanctum bearer token
- Sends release metadata to the `POST /api/releases` endpoint

## Inputs

### `asset-url` (required)

API URL to the release zip asset. Use `${{ steps.build-zip.outputs.asset-url }}` from `ashleyfae/action-build-release-zip`.

### `file-name` (required)

Name of the release zip file (e.g. `my-plugin-1.0.0.zip`). Use `${{ steps.build-zip.outputs.file-name }}`.

### `releasable-type` (required)

The releasable model type on the software platform. Typically `"product"`.

### `releasable-id` (required)

The numeric ID of the product on the software platform.

### `pre-release` (optional)

Whether this is a pre-release. Defaults to `'false'`.

### `readme-file` (optional)

Relative path to your `readme.txt` file. Defaults to `'readme.txt'`.

The action parses:
- **Changelog**: Most recent entry from `== Changelog ==`, converted to HTML `<ul>` list, sent as `notes`
- **Requirements**: `Requires at least:` → WordPress, `Requires PHP:` → PHP, sent as `[{name, version}]` array

## Required Secrets & Variables

Configure the following in your repository settings:

| Name | Type | Description |
|------|------|-------------|
| `SOFTWARE_API_TOKEN` | Secret | Sanctum bearer token for the software platform API |
| `SOFTWARE_API_BASE_URL` | Variable | Base URL of your software platform (e.g. `https://software.example.com`) |
| `SOFTWARE_PRODUCT_ID` | Variable | Numeric ID of the product on the software platform |

## Example Workflow

Copy and paste this into `.github/workflows/deploy.yml` in your plugin repository. Set `releasable-id` to your product's ID on the software platform.

The workflow supports both automatic deployment on release publish and manual dispatch (useful for redeploying an existing release without creating a new one).

```yaml
name: Deploy Release

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      tag_name:
        description: 'Tag name to deploy (e.g. 1.2.0)'
        required: true
      pre_release:
        description: 'Is this a pre-release?'
        type: boolean
        default: false

jobs:
  build:
    name: Build & Deploy Release
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Build and upload release zip
        id: build-zip
        uses: ashleyfae/action-build-release-zip@main
        with:
          composer-install: 'false'
          tag-name: ${{ inputs.tag_name || github.event.release.tag_name }}

      - name: Checkout code
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.tag_name || github.event.release.tag_name }}

      - name: Publish release to software platform
        uses: ashleyfae/action-publish-sell-software-release@main
        with:
          asset-url: ${{ steps.build-zip.outputs.asset-url }}
          file-name: ${{ steps.build-zip.outputs.file-name }}
          release-version: ${{ inputs.tag_name || github.event.release.tag_name }}
          pre-release: ${{ inputs.pre_release || github.event.release.prerelease || 'false' }}
          releasable-type: 'product'
          releasable-id: ${{ vars.SOFTWARE_PRODUCT_ID }}
        env:
          SOFTWARE_API_BASE_URL: ${{ vars.SOFTWARE_API_BASE_URL }}
          SOFTWARE_API_TOKEN: ${{ secrets.SOFTWARE_API_TOKEN }}
```

### With Composer Dependencies

If your plugin requires Composer dependencies:

```yaml
      - name: Build and upload release zip
        id: build-zip
        uses: ashleyfae/action-build-release-zip@main
        with:
          composer-install: 'true'
```

### With Custom readme.txt Path

```yaml
      - name: Publish release to software platform
        uses: ashleyfae/action-publish-sell-software-release@main
        with:
          asset-url: ${{ steps.build-zip.outputs.asset-url }}
          file-name: ${{ steps.build-zip.outputs.file-name }}
          pre-release: ${{ github.event.release.prerelease }}
          releasable-type: 'product'
          releasable-id: ${{ vars.SOFTWARE_PRODUCT_ID }}
          readme-file: 'docs/readme.txt'
        env:
          SOFTWARE_API_BASE_URL: ${{ vars.SOFTWARE_API_BASE_URL }}
          SOFTWARE_API_TOKEN: ${{ secrets.SOFTWARE_API_TOKEN }}
```

## readme.txt Format

### Plugin Headers

Requirements are parsed from standard WordPress plugin headers:

```
=== My Plugin ===
Requires at least: 5.0
Requires PHP: 8.0
```

This produces:

```json
[
  { "name": "wp", "version": "5.0" },
  { "name": "php", "version": "8.0" }
]
```

### Changelog Format

```
== Changelog ==

**1.2.0 - 1 January 2026**

* New: Added some cool feature
* Fix: Fixed a bug

**1.1.0 - 1 June 2025**

* Initial release.
```

The most recent version entry is extracted and converted to HTML:

```html
<ul>
  <li>New: Added some cool feature</li>
  <li>Fix: Fixed a bug</li>
</ul>
```

## API Request

The action sends a `POST` request to `{SOFTWARE_API_BASE_URL}/api/releases` with a `Bearer` token and the following JSON body:

```json
{
  "releasable_type": "product",
  "releasable_id": 1,
  "git_repo": "owner/my-plugin",
  "git_tag": "1.2.0",
  "git_asset_url": "https://api.github.com/repos/owner/my-plugin/releases/assets/12345",
  "notes": "<ul>\n  <li>Fix: some bug</li>\n</ul>",
  "requirements": [
    { "name": "wp", "version": "5.0" },
    { "name": "php", "version": "8.0" }
  ],
  "pre_release": false
}
```

## Debugging

To test changelog parsing locally without running the full action:

```bash
node publish-release.js test-changelog path/to/readme.txt
```

## License

MIT
