# Proxy
A hosted proxy server with authentication and application management, featuring integrated noVNC support for VNC server access.

## Features

- **Authentication System**: Secure login with username and password
- **Application Management**: Add, edit, and delete apps through the web interface
- **VNC Support**: Built-in noVNC client for accessing VNC servers directly in the browser
- **Network Accessibility**: Access from any device on the same network
- **Hostname Configuration**: Configure the hostname for app targets (use device name or IP)
- **Run on Startup**: Toggle to enable/disable automatic startup (systemd user service, no sudo required)
- **Configurable Credentials**: Change username and password from the web interface
- **Configuration File**: Settings persisted in JSON format

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Access the proxy at `http://localhost:3000` or `http://<your-server-ip>:3000` from network
   - Default username: `admin`
   - Default password: `admin`

## Documentation

- [INSTALL.md](INSTALL.md) - Detailed installation and setup instructions
- [USAGE.md](USAGE.md) - Usage examples and common use cases
- [VNC_SETUP.md](VNC_SETUP.md) - Guide for setting up and using VNC servers

## Configuration

The web interface provides:
- Hostname configuration for accessing apps on network devices
- App management (add/edit/delete applications)
- Password and username changes
- Startup service toggle

Or edit `config.json` directly to configure settings.

## License

GPL-2.0 - See LICENSE file for details
