# Release signing & versioning — NotifyLoudly

This app is **Expo bare / prebuild**. `app.json` is the source of truth for
`version` / `android.versionCode`; `android/` is generated and `.gitignore`'d.

## 1. Generate a release keystore (once, outside the repo)

```bash
# Choose your own passwords; store the file where backups survive.
keytool -genkeypair -v -storetype JKS \
  -keystore ~/notifyloudly-release.jks -alias notifyloudly \
  -keyalg RSA -keysize 4096 -validity 10000
# Record: store path, store password, alias, key password — keep them out of git.
```

`*.jks` is already `.gitignore`'d. Never commit the keystore or its passwords.

## 2. Wire signing for release builds

Signing is wired durably by `plugins/withReleaseSigning.ts` (registered in
`app.json` `plugins`), which injects `signingConfigs.release` into
`android/app/build.gradle` via `withAppBuildGradle` on every prebuild — no
manual patching after `prebuild --clean`:

```gradle
signingConfigs {
    debug  { /* android / androiddebugkey — prebuild default */ }
    release {
        if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
            storeFile file(MYAPP_UPLOAD_STORE_FILE)
            storePassword MYAPP_UPLOAD_STORE_PASSWORD
            keyAlias MYAPP_UPLOAD_KEY_ALIAS
            keyPassword MYAPP_UPLOAD_KEY_PASSWORD
        }
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release   // NOT .debug
        // …
    }
}
```

Supply the four properties **without committing them** — any one of:

* `android/gradle.properties` (gitignored via `/android`) — convenient for local:
  ```
  MYAPP_UPLOAD_STORE_FILE=/home/you/notifyloudly-release.jks
  MYAPP_UPLOAD_STORE_PASSWORD=…
  MYAPP_UPLOAD_KEY_ALIAS=notifyloudly
  MYAPP_UPLOAD_KEY_PASSWORD=…
  ```
* Env vars: `ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_FILE`, … (Gradle maps
  `ORG_GRADLE_PROJECT_*` to project properties).
* `-P` flags on the Gradle invocation.

If the properties are absent, `signingConfigs.release` is left empty and
`assembleRelease`/`bundleRelease` will fail at signing — this is intentional
(we prefer a hard failure over silently shipping a `debug`-signed release).

## 3. Version contract

* Bump `expo.version` and `expo.android.versionCode` in `app.json` for every
  build you hand out (even for local sideload). `versionCode` is an integer and
  must strictly increase.
* Then run `npx expo prebuild --clean` so `android/app/build.gradle`
  `versionCode`/`versionName` pick up the new values. Never hand-edit the
  generated `android/app/build.gradle` version — edit `app.json` and re-prebuild.

## 4. Build commands (you run these — not CI here)

```bash
bun run typecheck && bun test
npx expo prebuild --clean --platform android   # regenerate android/ (withReleaseSigning plugin injects signingConfigs.release)
./gradlew -p android assembleRelease            # APK
./gradlew -p android bundleRelease              # AAB (for Play, when needed)
apksigner verify --print-certs android/app/build/outputs/bundle/release/app-release.aab
# last line should show your release alias (e.g. notifyloudly), NOT androiddebugkey
```

## 5. Checklist before handing a build out

- [ ] `app.json` `version` / `versionCode` bumped and committed
- [ ] Release keystore present and `MYAPP_UPLOAD_*` supplied
- [ ] `grep -n "signingConfigs.release" android/app/build.gradle` shows the patch
- [ ] `apksigner verify` prints the release cert, not `androiddebugkey`
- [ ] Fresh-install the signed artifact on a real device and exercise
      `docs/reliability-checklist.md` end-to-end
