// Dev/preview builds read the local content-pack server over plain HTTP (e.g.
// `http://10.0.2.2:8787/manifest.json` on the Android emulator, or a LAN IP on a physical
// device). Android 9+ blocks cleartext traffic by default in release builds, so FR-105 installs
// failed on the emulator with:
//   UnknownServiceException: CLEARTEXT communication to 10.0.2.2 not permitted by network
//   security policy
//
// This plugin sets `android:usesCleartextTraffic="true"` ONLY when `APP_VARIANT=preview`
// (injected by the `preview` EAS profile). Production builds leave the default, so shipped
// binaries still require HTTPS.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withPreviewCleartext(config) {
  return withAndroidManifest(config, (config) => {
    if (process.env.APP_VARIANT !== 'preview') return config;
    const application = config.modResults.manifest.application?.[0];
    if (application !== undefined) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return config;
  });
};
