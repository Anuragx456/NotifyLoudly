import { ConfigPlugin, withAppBuildGradle } from "@expo/config-plugins";

// Durable release-signing wiring: survives `expo prebuild --clean`.
// Release credentials come from MYAPP_UPLOAD_* project properties — supply via
// android/gradle.properties (gitignored), ORG_GRADLE_PROJECT_MYAPP_UPLOAD_*
// env vars, or -P flags. See docs/RELEASE_SIGNING.md.
//
// When the properties are absent the release block stays empty so
// assembleRelease/bundleRelease hard-fails instead of silently shipping a
// debug-signed artifact (which Play Protect flags and Play Console rejects).
const withReleaseSigning: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (config) => {
    let contents: string = config.modResults.contents;

    // 1. Inject signingConfigs.release after the prebuild-default debug block.
    // Idempotent: skip once the MYAPP_UPLOAD_* markers are present.
    if (!contents.includes("MYAPP_UPLOAD_STORE_FILE")) {
      const debugSigningBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;
      const releaseSigningBlock = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
    }`;
      if (contents.includes(debugSigningBlock)) {
        contents = contents.replace(debugSigningBlock, releaseSigningBlock);
      }
    }

    // 2. Point buildTypes.release at signingConfigs.release (prebuild
    // default is signingConfigs.debug). Hard-fail contract: no debug
    // fallback — with MYAPP_UPLOAD_* absent the empty signingConfigs.release
    // fails assembleRelease/bundleRelease at signing instead of silently
    // shipping a debug-signed artifact. See docs/RELEASE_SIGNING.md.
    //
    // Line-scoped rewrite, not exact-string match: handles both the
    // fresh-prebuild `signingConfig signingConfigs.debug` line and a stale
    // ternary fallback line, without touching the debug build type's own key.
    // Idempotent: once patched, the negative lookahead no longer matches.
    const buildTypesIdx = contents.indexOf("buildTypes");
    if (buildTypesIdx >= 0) {
      const releaseIdx = contents.indexOf("release {", buildTypesIdx);
      if (releaseIdx >= 0) {
        const releaseEnd = contents.indexOf("\n        }", releaseIdx);
        if (releaseEnd >= 0) {
          const head = contents.slice(0, releaseIdx);
          let body = contents.slice(releaseIdx, releaseEnd);
          const tail = contents.slice(releaseEnd);
          // Drop a stale sideload-fallback comment if present.
          body = body.replace(/^[ \t]*\/\/ Local sideload[^\r\n]*\r?\n/m, "");
          body = body.replace(
            /^[ \t]*signingConfig[ \t]+(?!signingConfigs\.release\b).*$/m,
            "            signingConfig signingConfigs.release",
          );
          contents = head + body + tail;
        }
      }
    }

    config.modResults.contents = contents;
    return config;
  });
};

export default withReleaseSigning;
