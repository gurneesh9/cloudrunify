# Check if script has sudo privileges
if [ "$EUID" -ne 0 ] && ! sudo -v >/dev/null 2>&1; then
    echo "This script requires sudo privileges to install to /usr/local/bin"
    echo "Please run with sudo: sudo ./install.sh"
    exit 1
fi

#!/bin/bash

echo "Installing cloudrunify..."

# Download the binary based on the OS architecture
if [[ "$OSTYPE" == "darwin"* && "$(uname -m)" == "arm64" ]]; then
    curl -L https://github.com/gurneesh9/cloudrunify/releases/download/v0.0.1/cr-mac-arm64 -o cloudrunify
elif [[ "$OSTYPE" == "linux-gnu"* && "$(uname -m)" == "x86_64" ]]; then
    curl -L https://github.com/gurneesh9/cloudrunify/releases/download/v0.0.1/cr-linux -o cloudrunify
else
    echo "Unsupported OS or architecture. Please use macOS ARM64 or Linux AMD64."
    exit 1
fi

# Check if download was successful
if [ $? -ne 0 ]; then
    echo "Failed to download cloudrunify"
    exit 1
fi

# Make it executable
chmod +x cloudrunify

# Move to /usr/local/bin (requires sudo)
sudo mv cloudrunify /usr/local/bin/cloudrunify

# Check if move was successful
if [ $? -ne 0 ]; then
    echo "Failed to install cloudrunify. Please run with sudo privileges."
    exit 1
fi

echo "✨ Cloudrunify installed successfully!"
echo "Run 'cloudrunify --help' to get started"
