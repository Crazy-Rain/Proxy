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

You can modify the apps list in `config.json` to add your own localhost applications.

### 3. Run the Server
```bash
npm start
```

The server will be available at `http://localhost:3000`

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

1. Navigate to `http://localhost:3000` (or your configured port)
2. Login with default credentials (username: `admin`, password: `admin`)
3. You'll see the main dashboard with available apps
4. Go to Settings to:
   - Toggle "Run on Startup" for Ubuntu Noble ARM64
   - Change your password
   - Change your username

## Adding Apps

Edit `config.json` to add applications that are running on localhost:

```json
{
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

## Security Notes

- Always change the default password after first login
- The default password hash in `config.json` is for 'admin'
- Password hashes are generated using bcrypt
- Session data is stored in memory (consider using a persistent store for production)
