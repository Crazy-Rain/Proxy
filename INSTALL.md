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

### 4. Setup Run on Startup (Ubuntu Noble ARM64)

To enable the proxy server to run on system startup:

1. Copy the service file to systemd directory:
```bash
sudo cp proxy-server.service /etc/systemd/system/
```

2. Update the service file with your actual paths:
```bash
sudo nano /etc/systemd/system/proxy-server.service
```
Update the `User`, `WorkingDirectory`, and `ExecStart` paths to match your installation.

3. Reload systemd:
```bash
sudo systemctl daemon-reload
```

4. You can now enable/disable the service from the web interface Settings page, or manually:
```bash
# Enable
sudo systemctl enable proxy-server.service

# Disable
sudo systemctl disable proxy-server.service

# Start the service
sudo systemctl start proxy-server.service

# Check status
sudo systemctl status proxy-server.service
```

## Usage

1. Navigate to `http://localhost:3000` or `http://<server-ip>:3000` from any device on the network
2. Login with default credentials (username: `admin`, password: `admin`)
3. You'll see the main dashboard with available apps
4. Go to Settings to:
   - Configure hostname for accessing apps on network devices
   - Add, edit, or delete applications
   - Toggle "Run on Startup" for Ubuntu Noble ARM64
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
