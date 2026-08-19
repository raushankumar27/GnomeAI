#!/usr/bin/env bash

# Exit immediately if any command fails
set -e

echo "=========================================================="
echo "      Intel Level Zero NPU Driver Installer for Ubuntu"
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run this script with sudo:"
  echo "sudo ./install_npu.sh"
  exit 1
fi

# Get the actual user who invoked sudo
ACTUAL_USER="${SUDO_USER:-$USER}"

echo "[1/5] Installing core dependencies (libtbb12, libze1)..."
apt-get update
apt-get install -y libtbb12 libze1 wget

# Create a secure temp directory inside the workspace
TEMP_DIR="$(mktemp -d -p "$(pwd)")"
echo "[2/5] Creating temporary directory at: $TEMP_DIR"
cd "$TEMP_DIR"

URL="https://github.com/intel/linux-npu-driver/releases/download/v1.33.0/linux-npu-driver-v1.33.0.20260529-26625960453-ubuntu2404.tar.gz"
FILE_NAME="linux-npu-driver.tar.gz"

echo "[3/5] Downloading Intel NPU driver (v1.33.0)..."
wget -O "$FILE_NAME" "$URL"

echo "[4/5] Extracting and installing driver .deb packages..."
tar -xf "$FILE_NAME"
# Install all extracted debian packages
dpkg -i *.deb

# Clean up the temp directory
echo "Cleaning up temporary files..."
cd - > /dev/null
rm -rf "$TEMP_DIR"

echo "[5/5] Adding user '$ACTUAL_USER' to the 'render' group for NPU access..."
usermod -aG render "$ACTUAL_USER"

echo "=========================================================="
echo "✓ NPU Driver Installation Completed successfully!"
echo "⚠ IMPORTANT: You MUST log out and log back in (or reboot)"
echo "  for group membership changes to take effect."
echo "=========================================================="
