# Installation Instructions

## Prerequisites
- Node.js (v14 or higher)
- npm (Node Package Manager)
- Ubuntu Noble (24.04) ARM64 (for systemd service)

## Installation Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configuration
The default configuration is in `config.json`:
- Default username: `admin`
- Default password: `admin` (hashed using bcrypt)
- Default port: `3000`
- Default hostname: `localhost`

You can modify apps through the web interface or by editing `config.json` directly.

### 3. Run the Server
```bash
npm start
```

The server will be available at:
- Localhost: `http://localhost:3000`
- Network: `http://<server-ip>:3000` (accessible from other devices on the same network)

### 4. Setup Run on Startup (systemd user service)

The proxy server can automatically start when you log in using systemd user services. **No sudo required!**

#### Option 1: Enable via Web Interface (Recommended)

1. Navigate to Settings in the web interface
2. Toggle the "Run on Startup" switch
3. The service will be automatically configured and enabled
4. It will start automatically on your next login

#### Option 2: Manual Setup

If you prefer to set it up manually:

```bash
# The service file is automatically created when you toggle the switch in Settings
# Or you can check the status manually:
systemctl --user status proxy-server.service

# To enable manually (if needed):
systemctl --user enable proxy-server.service

# To disable manually:
systemctl --user disable proxy-server.service

# To start the service immediately:
systemctl --user start proxy-server.service

# To check status:
systemctl --user status proxy-server.service
```

## Usage

1. Navigate to `http://localhost:3000` or `http://<server-ip>:3000` from any device on the network
2. Login with default credentials (username: `admin`, password: `admin`)
3. You'll see the main dashboard with available apps
4. Go to Settings to:
   - Configure hostname for accessing apps on network devices
   - Add, edit, or delete applications
   - Toggle "Run on Startup" (uses systemd user service, no sudo required)
   - Change your password
   - Change your username

## Managing Apps

### Through Web Interface (Recommended)

1. Login and navigate to Settings
2. Scroll to "Manage Apps" section
3. Use the form to add new apps or edit/delete existing ones
4. Restart the server after making changes

### Manual Configuration

Edit `config.json` to add applications:

```json
{
  "hostname": "localhost",
  "apps": [
    {
      "name": "My App",
      "port": 8080,
      "path": "/myapp"
    }
  ]
}
```

Each app will be accessible through the proxy at `http://localhost:3000/myapp`

## Network Access

The proxy server listens on `0.0.0.0:3000`, allowing access from:
- The local machine: `http://localhost:3000`
- Other devices on the network: `http://<server-ip>:3000`
- By hostname: `http://<hostname>:3000`

## Security Notes

- Always change the default password after first login
- The default password hash in `config.json` is for 'admin'
- Password hashes are generated using bcrypt
- Session data is stored in memory (consider using a persistent store for production)
- The server is accessible on the network by default - ensure your network is trusted
