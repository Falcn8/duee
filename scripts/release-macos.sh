#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Duee"
EXECUTABLE_NAME="Duee"
BUNDLE_ID="${BUNDLE_ID:-com.duee.app}"
VERSION="${VERSION:-$(git -C "$ROOT_DIR" describe --tags --always 2>/dev/null || date +%Y.%m.%d)}"
ICON_SOURCE="${ICON_SOURCE:-$ROOT_DIR/logo.png}"

RELEASE_DIR="$ROOT_DIR/release"
STAGING_DIR="$RELEASE_DIR/staging"
APP_DIR="$STAGING_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

ZIP_PATH="$RELEASE_DIR/${APP_NAME}-macOS-${VERSION}.zip"
DMG_PATH="$RELEASE_DIR/${APP_NAME}-macOS-${VERSION}.dmg"
CHECKSUM_PATH="$RELEASE_DIR/${APP_NAME}-macOS-${VERSION}.sha256"
FINAL_APP_DIR="$RELEASE_DIR/$APP_NAME.app"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

echo "==> Checking prerequisites"
need_cmd swift
need_cmd sips
need_cmd iconutil
need_cmd ditto
need_cmd shasum
need_cmd codesign

if [[ ! -f "$ICON_SOURCE" ]]; then
  echo "Icon source not found: $ICON_SOURCE" >&2
  exit 1
fi

echo "==> Building release binary"
BIN_PATH="$(swift build -c release --package-path "$ROOT_DIR" --show-bin-path)"
APP_BINARY="$BIN_PATH/$EXECUTABLE_NAME"

if [[ ! -x "$APP_BINARY" ]]; then
  echo "Release binary not found: $APP_BINARY" >&2
  exit 1
fi

echo "==> Preparing app bundle"
rm -rf "$STAGING_DIR" "$FINAL_APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
cp "$APP_BINARY" "$MACOS_DIR/$EXECUTABLE_NAME"
chmod 755 "$MACOS_DIR/$EXECUTABLE_NAME"

ICONSET_DIR="$STAGING_DIR/AppIcon.iconset"
mkdir -p "$ICONSET_DIR"

make_icon() {
  local output_name="$1"
  local size="$2"
  sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET_DIR/$output_name" >/dev/null
}

echo "==> Generating AppIcon.icns from $ICON_SOURCE"
make_icon "icon_16x16.png" 16
make_icon "icon_16x16@2x.png" 32
make_icon "icon_32x32.png" 32
make_icon "icon_32x32@2x.png" 64
make_icon "icon_128x128.png" 128
make_icon "icon_128x128@2x.png" 256
make_icon "icon_256x256.png" 256
make_icon "icon_256x256@2x.png" 512
make_icon "icon_512x512.png" 512
make_icon "icon_512x512@2x.png" 1024
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns"

cat > "$CONTENTS_DIR/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleExecutable</key>
    <string>${EXECUTABLE_NAME}</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

echo "==> Signing app bundle"
if [[ "${SKIP_CODESIGN:-0}" == "1" ]]; then
  echo "Skipping codesign because SKIP_CODESIGN=1"
else
  CODESIGN_IDENTITY="${CODESIGN_IDENTITY:--}"
  xattr -cr "$APP_DIR"
  if [[ "$CODESIGN_IDENTITY" == "-" ]]; then
    codesign --force --deep --sign - "$APP_DIR"
  else
    codesign --force --deep --options runtime --timestamp --sign "$CODESIGN_IDENTITY" "$APP_DIR"
  fi
  codesign --verify --deep --strict --verbose=2 "$APP_DIR"
fi

echo "==> Packaging artifacts"
mkdir -p "$RELEASE_DIR"
rm -f "$ZIP_PATH" "$DMG_PATH" "$CHECKSUM_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$ZIP_PATH"
if command -v hdiutil >/dev/null 2>&1; then
  hdiutil create -volname "$APP_NAME" -srcfolder "$APP_DIR" -ov -format UDZO "$DMG_PATH" >/dev/null
fi
ditto "$APP_DIR" "$FINAL_APP_DIR"

{
  shasum -a 256 "$ZIP_PATH"
  if [[ -f "$DMG_PATH" ]]; then
    shasum -a 256 "$DMG_PATH"
  fi
} > "$CHECKSUM_PATH"

echo "==> Done"
ls -lh "$FINAL_APP_DIR" "$ZIP_PATH" "$CHECKSUM_PATH" ${DMG_PATH:+$DMG_PATH} 2>/dev/null || true
echo "Release artifacts are in: $RELEASE_DIR"
