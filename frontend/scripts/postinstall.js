const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Fix 1: expo-router/build/primitives is a directory but required as a file
const primsShim = path.join(root, 'node_modules/expo-router/build/primitives.js');
if (!fs.existsSync(primsShim)) {
  fs.writeFileSync(primsShim, "module.exports = require('./primitives/index.js');\n");
  console.log('postinstall: created expo-router/build/primitives.js shim');
}

// Fix 2: @expo/metro expects metro-runtime in a nested node_modules path.
// Symlink it to the top-level metro-runtime so all subpath imports work.
const metroNodeModules = path.join(root, 'node_modules/@expo/metro/node_modules');
const metroRuntimeLink = path.join(metroNodeModules, 'metro-runtime');
const linkExists = (() => { try { fs.lstatSync(metroRuntimeLink); return true; } catch { return false; } })();
if (!linkExists) {
  fs.mkdirSync(metroNodeModules, { recursive: true });
  fs.symlinkSync(path.join('..', '..', '..', '..', 'metro-runtime'), metroRuntimeLink);
  console.log('postinstall: symlinked @expo/metro/node_modules/metro-runtime');
}

// Fix 3: @react-native-voice/voice uses jcenter() (shut down) and SDK 28.
// Patch its build.gradle to use mavenCentral() and modern SDK versions.
const voiceBuildGradle = path.join(root, 'node_modules/@react-native-voice/voice/android/build.gradle');
if (fs.existsSync(voiceBuildGradle)) {
  let gradle = fs.readFileSync(voiceBuildGradle, 'utf8');
  const original = gradle;

  // Replace jcenter() with mavenCentral() everywhere
  gradle = gradle.replace(/jcenter\(\)/g, 'mavenCentral()');

  // Bump SDK versions from 28 → 35
  gradle = gradle.replace(
    'def DEFAULT_COMPILE_SDK_VERSION = 28',
    'def DEFAULT_COMPILE_SDK_VERSION = 35',
  );
  gradle = gradle.replace(
    'def DEFAULT_TARGET_SDK_VERSION = 28',
    'def DEFAULT_TARGET_SDK_VERSION = 35',
  );

  // Replace old support library with AndroidX
  gradle = gradle.replace(
    /implementation "com\.android\.support:appcompat-v7:\$\{supportVersion\}"/,
    'implementation "androidx.appcompat:appcompat:1.6.1"',
  );

  // Remove the outdated buildToolsVersion line (optional in modern AGP)
  gradle = gradle.replace(
    /\s*buildToolsVersion rootProject\.hasProperty\('buildToolsVersion'\) \? rootProject\.buildToolsVersion : DEFAULT_BUILD_TOOLS_VERSION\n/,
    '\n',
  );

  if (gradle !== original) {
    fs.writeFileSync(voiceBuildGradle, gradle);
    console.log('postinstall: patched @react-native-voice/voice android/build.gradle');
  }
}
