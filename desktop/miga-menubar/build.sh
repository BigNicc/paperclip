#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Paperclip MIGA.app"
BUILD_DIR="$ROOT_DIR/build"
APP_DIR="$BUILD_DIR/$APP_NAME"
MACOS_DIR="$APP_DIR/Contents/MacOS"
EXECUTABLE="$MACOS_DIR/PaperclipMIGA"
PLIST="$APP_DIR/Contents/Info.plist"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"

xcrun swiftc \
  -target arm64-apple-macos14.0 \
  -framework AppKit \
  -framework SwiftUI \
  -framework WebKit \
  "$ROOT_DIR"/Sources/*.swift \
  -o "$EXECUTABLE"

cat > "$PLIST" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>PaperclipMIGA</string>
  <key>CFBundleIdentifier</key>
  <string>de.migaconsulting.paperclip.menubar</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Paperclip MIGA</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

echo "Built app:"
echo "$APP_DIR"
