# Releasing Fractal

Fractal ships as a **macOS arm64 Electron app** with:

- GitHub Releases
- `electron-updater`
- local Apple code signing
- local Apple notarization

## Local release credentials

Create a local `.env.release` file from `.env.release.example`.
Do **not** commit it.

Required variables:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Your local Keychain must also contain a valid:

- `Developer ID Application: Pablo Varela (2TZ4Q825M7)` certificate

## Local build

```bash
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm run dist:mac:arm64
```

Artifacts land in `release/`.

## Local release flow

The canonical release path is local, similar to Swift-Shift/Yonna.

```bash
cp .env.release.example .env.release
# fill it in once

./scripts/release-local.sh 0.0.2
```

That script will:

1. update `package.json` version if needed
2. refresh `pnpm-lock.yaml`
3. commit the version bump if needed
4. create `v0.0.2`
5. build/sign/notarize the macOS arm64 app locally
6. create the GitHub release if missing
7. upload:
   - `Fractal-<version>-arm64.dmg`
   - `Fractal-<version>-arm64.zip`
   - `latest-mac.yml`
   - `*.blockmap`

## GitHub Actions

GitHub Actions only runs a **sanity-check unsigned build** on tags. It is not responsible for signing, notarization, or publishing releases.

## Verify signing locally

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Fractal.app"
spctl -a -t exec -vv "release/mac-arm64/Fractal.app"
```

## Test auto-update

1. Install an older tagged release.
2. Publish a newer tagged release locally.
3. Launch the older installed app.
4. Use **Fractal → Check for Updates…**.
5. Download and install the update.
