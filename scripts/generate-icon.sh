#!/bin/bash

# Generate icon.icns from Icon Composer source for Electron
# Usage: ./scripts/generate-icon.sh

set -e

SOURCE_IMAGE="resources/icon.icon/Assets/A portion of a Fractal.png"
ICONSET_DIR="build/icon.iconset"
OUTPUT_ICNS="build/icon.icns"

# Required sizes for macOS app icons
SIZES=(16 32 64 128 256 512 1024)

# Create iconset directory
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

echo "Generating icon sizes..."

for size in "${SIZES[@]}"; do
    # Normal resolution
    sips -z "$size" "$size" "$SOURCE_IMAGE" --out "${ICONSET_DIR}/icon_${size}x${size}.png"
    
    # Retina (@2x) resolution for sizes that support it
    if [ "$size" -lt 1024 ]; then
        retina_size=$((size * 2))
        sips -z "$retina_size" "$retina_size" "$SOURCE_IMAGE" --out "${ICONSET_DIR}/icon_${size}x${size}@2x.png"
    fi
done

echo "Creating icon.icns..."
iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_ICNS"

# Cleanup
rm -rf "$ICONSET_DIR"

echo "✓ Generated $OUTPUT_ICNS"
