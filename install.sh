# Check if script has sudo privileges
if [ "$EUID" -ne 0 ] && ! sudo -v >/dev/null 2>&1; then
    echo "This script requires sudo privileges to install to /usr/local/bin"
    echo "Please run with sudo: sudo ./install.sh"
    exit 1
fi

#!/bin/bash

echo "Installing cloudrunify..."

# Download the binary
curl -L https://github.com/gurneesh9/cloudrunify/releases/download/v0.0.1/cloudrunify.cjs -o cloudrunify.cjs

# Check if download was successful
if [ $? -ne 0 ]; then
    echo "Failed to download cloudrunify"
    exit 1
fi

# Make it executable
chmod +x cloudrunify.cjs

# Move to /usr/local/bin (requires sudo)
sudo mv cloudrunify.cjs /usr/local/bin/cloudrunify

# Check if move was successful
if [ $? -ne 0 ]; then
    echo "Failed to install cloudrunify. Please run with sudo privileges."
    exit 1
fi

echo "✨ Cloudrunify installed successfully!"
echo "Run 'cloudrunify --help' to get started"
