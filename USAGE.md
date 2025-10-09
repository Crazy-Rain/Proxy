# Example Usage

This document provides examples of how to use the Proxy Server.

## Default Configuration

The server comes with two example apps configured:

```json
{
  "port": 3000,
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

## Adding Your Own Apps

Let's say you have the following applications running locally:
- A web app on port 3001
- An API server on port 5000
- A development server on port 8000

### Step 1: Edit config.json

```json
{
  "port": 3000,
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

### Step 2: Restart the Proxy Server

```bash
npm start
```

### Step 3: Access Your Apps

Now you can access your apps through the proxy:
- Web App: http://localhost:3000/webapp
- API Server: http://localhost:3000/api
- Dev Server: http://localhost:3000/dev

All requests will be authenticated through the proxy login system.

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

## Ubuntu Systemd Service Setup

### Quick Setup

1. Copy the service file:
```bash
sudo cp proxy-server.service /etc/systemd/system/
```

2. Edit the service file with your paths:
```bash
sudo nano /etc/systemd/system/proxy-server.service
```

Update:
- `User=` to your username
- `WorkingDirectory=` to your installation path
- `ExecStart=` to your node binary and server.js paths

3. Reload systemd:
```bash
sudo systemctl daemon-reload
```

4. Enable via web interface or command line:
```bash
sudo systemctl enable proxy-server.service
sudo systemctl start proxy-server.service
```

### Verify Service Status

```bash
systemctl status proxy-server.service
```

### View Logs

```bash
journalctl -u proxy-server.service -f
```

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

## Security Notes

- Always change the default password on first use
- Keep `config.json` secure (it contains password hashes)
- Consider using HTTPS in production (add reverse proxy like nginx)
- The systemd service runs as a specific user (set in service file)
- Sessions are stored in memory by default (restart clears sessions)
