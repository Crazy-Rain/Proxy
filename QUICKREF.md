# Quick Reference

## Default Credentials
- **Username**: `admin`
- **Password**: `admin`

## Quick Start
```bash
npm install
npm start
```
Visit: http://localhost:3000

## File Overview

| File | Purpose |
|------|---------|
| `server.js` | Main application server |
| `package.json` | Node.js dependencies |
| `config.json` | Configuration (credentials, apps, settings) |
| `proxy-server.service` | Systemd service for Ubuntu Noble ARM64 |
| `.gitignore` | Excludes node_modules and logs from git |

## Documentation Files

| File | Content |
|------|---------|
| `README.md` | Quick start guide |
| `INSTALL.md` | Detailed installation instructions |
| `USAGE.md` | Usage examples and common use cases |
| `HEADLESS.md` | Remote display setup for headless operation |
| `SUMMARY.md` | Technical implementation details |
| `QUICKREF.md` | This quick reference |

## Key URLs

| URL | Purpose |
|-----|---------|
| `/` | Main dashboard (requires auth) |
| `/login` | Login page |
| `/logout` | Logout |
| `/settings` | Settings page (requires auth) |
| `/app1` | Example app 1 proxy (requires auth) |
| `/app2` | Example app 2 proxy (requires auth) |

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/startup` | POST | Toggle run on startup |
| `/api/change-password` | POST | Update password |
| `/api/change-username` | POST | Update username |

## Adding Apps

Edit `config.json`:
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

Then restart: `npm start`

## Systemd Service (Ubuntu Noble ARM64)

1. Copy service:
   ```bash
   sudo cp proxy-server.service /etc/systemd/system/
   ```

2. Edit paths in service file:
   ```bash
   sudo nano /etc/systemd/system/proxy-server.service
   ```

3. Reload and enable:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable proxy-server.service
   sudo systemctl start proxy-server.service
   ```

4. Or use the toggle in Settings page

## Generate Password Hash

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your-password', 10).then(hash => console.log(hash));"
```

## Common Commands

```bash
# Install
npm install

# Start server
npm start

# View logs (if running as service)
journalctl -u proxy-server.service -f

# Check service status
systemctl status proxy-server.service

# Stop service
sudo systemctl stop proxy-server.service
```

## Troubleshooting

**Can't login?**
- Check username/password in `config.json`
- Default is admin/admin

**App not showing?**
- Check `config.json` apps array
- Restart server after config changes

**Service not starting?**
- Check paths in service file
- Check Node.js is installed
- Check file permissions

**Password change not working?**
- Verify current password is correct
- Check new passwords match
- Look for error message on page

## Headless Display (No Monitor)

Quick setup for remote GUI access on headless devices:

```bash
# Install required packages
sudo apt install -y xvfb x11vnc
git clone https://github.com/novnc/noVNC.git ~/noVNC

# Start virtual display
Xvfb :1 -screen 0 1920x1080x24 &
export DISPLAY=:1

# Start desktop (optional)
startxfce4 &

# Start VNC server
x11vnc -display :1 -nopw -forever &

# Start web-based VNC viewer
~/noVNC/utils/novnc_proxy --vnc localhost:5900 --listen 6080 &
```

Access at `http://device-ip:6080/vnc.html`

For more options (XPRA, X11 forwarding, etc.), see [HEADLESS.md](HEADLESS.md)
