# Example Usage

This document provides examples of how to use the Proxy Server.

## Default Configuration

The server comes with two example apps configured:

```json
{
  "port": 3000,
  "hostname": "localhost",
  "credentials": {
    "username": "admin",
    "password": "$2b$10$EwOIqMwzZ7V3UtD9HC6R8uFf91Py05XIcAw1fX/WKgU4dEA3hYdYS"
  },
  "runOnStartup": false,
  "apps": [
    {
      "name": "Example App 1",
      "port": 8080,
      "path": "/app1"
    },
    {
      "name": "Example App 2",
      "port": 8081,
      "path": "/app2"
    }
  ]
}
```

## Network Access

The proxy server listens on `0.0.0.0:3000` by default, making it accessible from:
- Localhost: `http://localhost:3000`
- Same network: `http://<server-ip>:3000` (e.g., `http://192.168.1.100:3000`)
- By hostname: `http://<hostname>:3000` (e.g., `http://myserver:3000`)

## Managing Apps

### Method 1: Through Web Interface (Recommended)

1. Login and go to Settings
2. Scroll to "Manage Apps" section
3. Fill in the "Add New App" form:
   - App Name: Display name for the app
   - Port: Port number where the app runs
   - Path: URL path to access the app (e.g., `/myapp`)
4. Click "Add App"
5. Restart the server for changes to take effect

You can also edit or delete existing apps using the buttons next to each app.

### Method 2: Edit config.json Manually

Let's say you have the following applications running locally:
- A web app on port 3001
- An API server on port 5000
- A development server on port 8000

Edit `config.json`:

```json
{
  "port": 3000,
  "hostname": "localhost",
  "credentials": {
    "username": "admin",
    "password": "$2b$10$EwOIqMwzZ7V3UtD9HC6R8uFf91Py05XIcAw1fX/WKgU4dEA3hYdYS"
  },
  "runOnStartup": false,
  "apps": [
    {
      "name": "My Web App",
      "port": 3001,
      "path": "/webapp"
    },
    {
      "name": "API Server",
      "port": 5000,
      "path": "/api"
    },
    {
      "name": "Dev Server",
      "port": 8000,
      "path": "/dev"
    }
  ]
}
```

Then restart the proxy server:

```bash
npm start
```

### Accessing Your Apps

Now you can access your apps through the proxy:
- Web App: http://localhost:3000/webapp
- API Server: http://localhost:3000/api
- Dev Server: http://localhost:3000/dev

All requests will be authenticated through the proxy login system.

## Configuring Hostname

The hostname setting determines where the proxy forwards requests. This is useful when:
- Apps run on a different machine on your network
- You want to use a device's network name instead of localhost

### Through Web Interface

1. Login and go to Settings
2. In "Hostname Configuration" section, enter:
   - Device hostname (e.g., `myserver`)
   - IP address (e.g., `192.168.1.50`)
   - Or keep `localhost` for local apps
3. Click "Update Hostname"
4. Restart the server

Now apps will be accessed at `http://<hostname>:PORT` instead of `http://localhost:PORT`.

### Example: Accessing Apps on Another Device

If you have apps running on `192.168.1.50`:
1. Set hostname to `192.168.1.50` in settings
2. Add apps with their respective ports
3. The proxy will forward to `http://192.168.1.50:PORT`

## Changing Default Password

### Method 1: Through Web Interface

1. Login with default credentials (username: `admin`, password: `admin`)
2. Go to Settings
3. Use the "Change Password" form
4. Enter current password and new password
5. Click "Update Password"

### Method 2: Generate Hash Manually

If you want to set a password before first login:

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10).then(hash => console.log(hash));"
```

Copy the output hash and replace it in `config.json`:

```json
{
  "credentials": {
    "username": "admin",
    "password": "<paste-hash-here>"
  }
}
```

## Systemd User Service Setup (Run on Startup)

The proxy server can automatically start when you log in using systemd user services. **No sudo required!**

### Quick Setup via Web Interface (Recommended)

1. Login to the proxy server web interface
2. Navigate to Settings
3. Toggle the "Run on Startup" switch
4. The service will be automatically configured and enabled
5. It will start automatically on your next login

### Manual Setup (Alternative)

If you prefer manual setup or need to troubleshoot:

```bash
# Check service status
systemctl --user status proxy-server.service

# Enable the service (if not done via web interface)
systemctl --user enable proxy-server.service

# Start the service immediately
systemctl --user start proxy-server.service

# Disable the service
systemctl --user disable proxy-server.service
```

### Verify Service Status

```bash
systemctl --user status proxy-server.service
```

### View Logs

```bash
journalctl --user -u proxy-server.service -f
```

### How It Works

- The web interface automatically creates a user-level systemd service file at `~/.config/systemd/user/proxy-server.service`
- The service runs under your user account (no sudo needed)
- It starts automatically when you log in
- No manual path configuration required

## Use Cases

### 1. Development Environment Gateway

Use the proxy as a single entry point for all your development services:
- Frontend dev server (port 3000) → /frontend
- Backend API (port 5000) → /api
- Database admin (port 8080) → /dbadmin

### 2. Protected Local Services

Add authentication to services that don't have built-in auth:
- Local Jupyter notebook → /jupyter
- Local documentation server → /docs
- Local monitoring dashboard → /monitor

### 3. Team Development Server

Run multiple team member projects on the same server:
- Alice's app (port 3001) → /alice
- Bob's app (port 3002) → /bob
- Charlie's app (port 3003) → /charlie

Everyone accesses through a single authenticated proxy.

### 4. Network Device Management

Access apps running on different network devices:
1. Set hostname to device IP (e.g., `192.168.1.100`)
2. Add apps with their ports
3. Access via proxy from any network device

## Security Notes

- Always change the default password on first use
- Keep `config.json` secure (it contains password hashes)
- Consider using HTTPS in production (add reverse proxy like nginx)
- The systemd service runs as a specific user (set in service file)
- Sessions are stored in memory by default (restart clears sessions)
