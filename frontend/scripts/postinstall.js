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
if (!fs.existsSync(metroRuntimeLink)) {
  fs.mkdirSync(metroNodeModules, { recursive: true });
  fs.symlinkSync(path.join('..', '..', '..', '..', 'metro-runtime'), metroRuntimeLink);
  console.log('postinstall: symlinked @expo/metro/node_modules/metro-runtime');
}
