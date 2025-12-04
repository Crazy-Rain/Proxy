# Proxy
A hosted proxy server with authentication and application management.

## Features

- **Authentication System**: Secure login with username and password
- **Application Management**: Add, edit, and delete apps through the web interface
- **Network Accessibility**: Access from any device on the same network
- **Hostname Configuration**: Configure the hostname for app targets (use device name or IP)
- **Run on Startup**: Toggle to enable/disable automatic startup (systemd user service, no sudo required)
- **Configurable Credentials**: Change username and password from the web interface
- **Configuration File**: Settings persisted in JSON format
- **Headless Display Support**: Run and access graphical interfaces remotely without a monitor (see [HEADLESS.md](HEADLESS.md))
- **Built-in Remote Desktop**: Full remote desktop control through VNC, accessible directly from the dashboard

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

## Remote Desktop

The proxy includes a built-in remote desktop feature that allows you to view and control remote desktops via VNC:

1. Click the **Remote Desktop** button in the dashboard navigation
2. Enter the VNC server host, port (default: 5900), and password (if required)
3. Click **Connect** to establish the connection
4. Use your mouse and keyboard to interact with the remote desktop

**Features:**
- Full mouse and keyboard control
- Adjustable scaling (local scaling, remote resize, or no scaling)
- View-only mode option
- Fullscreen support
- Works with any standard VNC server (x11vnc, TigerVNC, RealVNC, etc.)

**Setting up a VNC server:**
```bash
# Install x11vnc
sudo apt install x11vnc

# Start VNC server (no password)
x11vnc -display :0 -forever -shared

# Or with password
x11vnc -display :0 -forever -shared -rfbauth ~/.vnc/passwd
```

See [HEADLESS.md](HEADLESS.md) for detailed setup instructions for headless systems.

## Documentation

- [INSTALL.md](INSTALL.md) - Detailed installation and setup instructions
- [USAGE.md](USAGE.md) - Usage examples and common use cases
- [HEADLESS.md](HEADLESS.md) - Remote display setup for headless operation (no monitor)

## Configuration

The web interface provides:
- Hostname configuration for accessing apps on network devices
- App management (add/edit/delete applications)
- Password and username changes
- Startup service toggle
- Remote desktop settings (VNC host/port)

Or edit `config.json` directly to configure settings.

## License

GPL-2.0 - See LICENSE file for details
