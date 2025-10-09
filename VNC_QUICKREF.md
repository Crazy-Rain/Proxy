# VNC Quick Reference

## Quick Start with VNC

### 1. Start a VNC Server
```bash
# Ubuntu/Debian
vncserver :1  # Starts on port 5901

# Check if running
ps aux | grep vnc
```

### 2. Add to Config
Edit `config.json`:
```json
{
  "apps": [
    {
      "name": "My VNC Desktop",
      "port": 5901,
      "path": "/vnc"
    }
  ]
}
```

### 3. Restart Proxy
```bash
npm start
```

### 4. Access
- Go to: `http://localhost:3000`
- Click "Access App" for your VNC server
- Enter VNC password when prompted

## Common VNC Ports
- `5900` - Display :0
- `5901` - Display :1  
- `5902` - Display :2

## Viewer Controls
- **Connect** - Manually connect to VNC server
- **Disconnect** - Close VNC connection
- **🌙/☀️** - Toggle dark mode
- **Back to Dashboard** - Return to main page

## Troubleshooting

### Cannot Connect
```bash
# Check VNC server is running
vncserver -list

# Check port is open
netstat -tulpn | grep 590

# Restart VNC server
vncserver -kill :1
vncserver :1
```

### Black Screen
```bash
# Check VNC log
cat ~/.vnc/*.log

# Set display resolution
vncserver -geometry 1920x1080 :1
```

### Authentication Issues
```bash
# Reset VNC password
vncpasswd
```

## Security Tip
For remote access, use SSH tunnel:
```bash
ssh -L 5901:localhost:5901 user@server
```
Then configure proxy to connect to `localhost:5901`

## See Also
- [VNC_SETUP.md](VNC_SETUP.md) - Full setup guide
- [README.md](README.md) - Project overview
- [USAGE.md](USAGE.md) - General usage examples
