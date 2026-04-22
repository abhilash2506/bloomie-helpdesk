#!/bin/zsh
set -euo pipefail

ROOT="/Users/abhilashbisht/Desktop/Bloomie-Helpdesk"
SOURCE="$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
ICONSET="$ROOT/app-assets/Bloomie.iconset"
OUTPUT="$ROOT/app-assets/Bloomie.icns"

/bin/rm -rf "$ICONSET"
/bin/mkdir -p "$ICONSET"

/usr/bin/sips -z 16 16 "$SOURCE" --out "$ICONSET/icon_16x16.png" >/dev/null
/usr/bin/sips -z 32 32 "$SOURCE" --out "$ICONSET/icon_16x16@2x.png" >/dev/null
/usr/bin/sips -z 32 32 "$SOURCE" --out "$ICONSET/icon_32x32.png" >/dev/null
/usr/bin/sips -z 64 64 "$SOURCE" --out "$ICONSET/icon_32x32@2x.png" >/dev/null
/usr/bin/sips -z 128 128 "$SOURCE" --out "$ICONSET/icon_128x128.png" >/dev/null
/usr/bin/sips -z 256 256 "$SOURCE" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
/usr/bin/sips -z 256 256 "$SOURCE" --out "$ICONSET/icon_256x256.png" >/dev/null
/usr/bin/sips -z 512 512 "$SOURCE" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
/usr/bin/sips -z 512 512 "$SOURCE" --out "$ICONSET/icon_512x512.png" >/dev/null
/bin/cp "$SOURCE" "$ICONSET/icon_512x512@2x.png"

/usr/bin/iconutil --convert icns --output "$OUTPUT" "$ICONSET"
echo "Generated $OUTPUT"
