// Android Auto: expose expo-audio's playback service (patched into a Media3 MediaLibraryService, see
// patches/expo-audio@*.patch) as a media browser service and declare the app as an Auto media app.
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SERVICE = 'expo.modules.audio.service.AudioControlsService';
const ACTIONS = [
  'androidx.media3.session.MediaSessionService',
  'androidx.media3.session.MediaLibraryService',
  'android.media.browse.MediaBrowserService',
];
const DESC = '<?xml version="1.0" encoding="utf-8"?>\n<automotiveApp>\n  <uses name="media" />\n</automotiveApp>\n';

function withAutoManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service ?? [];
    // Works whether or not expo-audio's plugin ran first: it only adds the service when it is missing.
    let svc = app.service.find((s) => s.$?.['android:name'] === SERVICE);
    if (!svc) {
      svc = { $: { 'android:name': SERVICE, 'android:foregroundServiceType': 'mediaPlayback' } };
      app.service.push(svc);
    }
    // The car's media browser binds from another app.
    svc.$['android:exported'] = 'true';
    const filter = svc['intent-filter']?.[0] ?? {};
    const have = new Set((filter.action ?? []).map((a) => a.$['android:name']));
    filter.action = [...(filter.action ?? []), ...ACTIONS.filter((a) => !have.has(a)).map((a) => ({ $: { 'android:name': a } }))];
    svc['intent-filter'] = [filter];

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      'com.google.android.gms.car.application',
      '@xml/automotive_app_desc',
      'resource',
    );
    return cfg;
  });
}

function withAutoDescriptor(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'automotive_app_desc.xml'), DESC);
      return cfg;
    },
  ]);
}

module.exports = function withAndroidAuto(config) {
  return withAutoDescriptor(withAutoManifest(config));
};
