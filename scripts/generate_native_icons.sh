#!/bin/zsh
set -euo pipefail

ROOT="/Users/abhilashbisht/Desktop/Bloomie-Helpdesk"
SVG="$ROOT/app-assets/bloomie-icon.svg"
TMP_DIR="/tmp/bloomie-native-icons"
PNG_SOURCE="$TMP_DIR/bloomie-icon.svg.png"

/bin/rm -rf "$TMP_DIR"
/bin/mkdir -p "$TMP_DIR"
/usr/bin/qlmanage -t -s 1024 -o "$TMP_DIR" "$SVG" >/dev/null 2>&1

generate_png() {
  local size="$1"
  local out="$2"
  /bin/mkdir -p "$(/usr/bin/dirname "$out")"
  /usr/bin/sips -z "$size" "$size" "$PNG_SOURCE" --out "$out" >/dev/null
}

generate_png 48 "$ROOT/android/app/src/main/res/mipmap-mdpi/ic_launcher.png"
generate_png 48 "$ROOT/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png"
generate_png 48 "$ROOT/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png"
generate_png 72 "$ROOT/android/app/src/main/res/mipmap-hdpi/ic_launcher.png"
generate_png 72 "$ROOT/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png"
generate_png 72 "$ROOT/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png"
generate_png 96 "$ROOT/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png"
generate_png 96 "$ROOT/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png"
generate_png 96 "$ROOT/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png"
generate_png 144 "$ROOT/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png"
generate_png 144 "$ROOT/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png"
generate_png 144 "$ROOT/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png"
generate_png 192 "$ROOT/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"
generate_png 192 "$ROOT/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png"
generate_png 192 "$ROOT/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"

generate_png 40 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-20@2x.png"
generate_png 60 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-20@3x.png"
generate_png 58 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-29@2x.png"
generate_png 87 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-29@3x.png"
generate_png 80 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-40@2x.png"
generate_png 120 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-40@3x.png"
generate_png 120 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-60@2x.png"
generate_png 180 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-60@3x.png"
generate_png 76 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-76.png"
generate_png 152 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-76@2x.png"
generate_png 167 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-83.5@2x.png"
generate_png 1024 "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

/bin/cat > "$ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json" <<'JSON'
{
  "images": [
    { "idiom": "iphone", "size": "20x20", "scale": "2x", "filename": "AppIcon-20@2x.png" },
    { "idiom": "iphone", "size": "20x20", "scale": "3x", "filename": "AppIcon-20@3x.png" },
    { "idiom": "iphone", "size": "29x29", "scale": "2x", "filename": "AppIcon-29@2x.png" },
    { "idiom": "iphone", "size": "29x29", "scale": "3x", "filename": "AppIcon-29@3x.png" },
    { "idiom": "iphone", "size": "40x40", "scale": "2x", "filename": "AppIcon-40@2x.png" },
    { "idiom": "iphone", "size": "40x40", "scale": "3x", "filename": "AppIcon-40@3x.png" },
    { "idiom": "iphone", "size": "60x60", "scale": "2x", "filename": "AppIcon-60@2x.png" },
    { "idiom": "iphone", "size": "60x60", "scale": "3x", "filename": "AppIcon-60@3x.png" },
    { "idiom": "ipad", "size": "76x76", "scale": "1x", "filename": "AppIcon-76.png" },
    { "idiom": "ipad", "size": "76x76", "scale": "2x", "filename": "AppIcon-76@2x.png" },
    { "idiom": "ipad", "size": "83.5x83.5", "scale": "2x", "filename": "AppIcon-83.5@2x.png" },
    { "idiom": "ios-marketing", "size": "1024x1024", "scale": "1x", "filename": "AppIcon-512@2x.png" }
  ],
  "info": { "version": 1, "author": "xcode" }
}
JSON

echo "Generated native Bloomie mascot icons."
