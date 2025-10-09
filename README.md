# Proxy
A hosted proxy server with authentication and application management.

## Features

- **Authentication System**: Secure login with username and password
- **Application Management**: List and access localhost applications through the proxy
- **Run on Startup**: Toggle to enable/disable automatic startup on Ubuntu Noble ARM64
- **Configurable Credentials**: Change username and password from the web interface
- **Configuration File**: Manage apps and settings via JSON configuration

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Access the proxy at `http://localhost:3000`
   - Default username: `admin`
   - Default password: `admin`

## Documentation

See [INSTALL.md](INSTALL.md) for detailed installation and setup instructions.

## Configuration

Edit `config.json` to:
- Add/remove applications
- Configure server port
- Manage credentials (or use the web interface)

## License

GPL-2.0 - See LICENSE file for details
