# VNC Setup Guide

The proxy server now includes integrated noVNC support, allowing you to view and interact with VNC servers directly in your browser.

## What is VNC?

VNC (Virtual Network Computing) is a graphical desktop-sharing system that uses the Remote Frame Buffer protocol (RFB) to remotely control another computer. With the integrated noVNC client, you can access VNC servers through your web browser without installing any additional software.

## How It Works

When you click "Access App" for any application in the dashboard, the viewer page will attempt to connect to a VNC server running on the configured host and port using WebSocket protocol.

### Connection Flow:
1. Click "Access App" on the dashboard
2. The viewer page loads with noVNC client
3. Click "Connect" to establish connection to VNC server
4. If the VNC server requires authentication, you'll be prompted for a password
5. Once connected, you can interact with the remote desktop

## Configuring VNC Servers

### Adding a VNC App to the Proxy

1. Ensure you have a VNC server running on a specific port
2. Add the VNC server to your `config.json`:

```json
{
  "apps": [
    {
      "name": "My VNC Desktop",
      "port": 5900,
      "path": "/vnc-desktop"
    }
  ]
}
```

3. Restart the proxy server
4. Access your VNC desktop at `http://localhost:3000/vnc-desktop`

### Common VNC Server Ports

- **5900**: Default VNC server port (display :0)
- **5901**: VNC server display :1
- **5902**: VNC server display :2
- And so on...

## Setting Up a VNC Server

### On Ubuntu/Debian:

```bash
# Install TigerVNC server
sudo apt-get install tigervnc-standalone-server

# Start VNC server on display :1 (port 5901)
vncserver :1

# Set VNC password when prompted
```

### On Raspberry Pi:

```bash
# Install RealVNC server (usually pre-installed)
sudo apt-get install realvnc-vnc-server

# Enable VNC
sudo raspi-config
# Navigate to: Interface Options > VNC > Enable

# Start VNC server
vncserver :1
```

### On macOS:

macOS has built-in VNC server (Screen Sharing):

1. Go to System Preferences > Sharing
2. Enable "Screen Sharing"
3. Configure VNC password in "Computer Settings"
4. Default VNC port is 5900

### On Windows:

Install a VNC server like:
- TightVNC: https://www.tightvnc.com/
- UltraVNC: https://www.uvnc.com/
- RealVNC: https://www.realvnc.com/

## WebSocket Configuration

The noVNC client requires a WebSocket connection to the VNC server. The proxy automatically handles WebSocket connections on the configured ports.

### Direct WebSocket Connection

The viewer connects directly to: `ws://hostname:port`

Make sure your VNC server is accessible on the network and the firewall allows connections on the VNC port.

## Security Considerations

### Important Security Notes:

1. **Password Protection**: Always set a password on your VNC server
2. **Network Security**: VNC traffic is not encrypted by default
3. **Firewall Rules**: Only expose VNC ports to trusted networks
4. **Use SSH Tunneling**: For secure remote access, tunnel VNC through SSH

### SSH Tunnel Example:

```bash
# Create SSH tunnel for VNC
ssh -L 5901:localhost:5901 user@remote-host

# Then configure proxy to connect to localhost:5901
```

## Troubleshooting

### Connection Failed

**Problem**: "Error: Connection closed" message appears

**Solutions**:
- Verify VNC server is running: `ps aux | grep vnc`
- Check port is correct: `netstat -tulpn | grep <port>`
- Verify hostname/IP is correct in config
- Check firewall rules: `sudo ufw status`

### Authentication Failed

**Problem**: Cannot authenticate to VNC server

**Solutions**:
- Ensure VNC password is set correctly
- Try resetting VNC password: `vncpasswd`
- Check VNC server authentication settings

### Black Screen

**Problem**: Connected but screen is black

**Solutions**:
- VNC server might not have a desktop session running
- Restart VNC server with: `vncserver -kill :1 && vncserver :1`
- Check VNC server logs: `~/.vnc/*.log`

### Performance Issues

**Problem**: Slow or laggy connection

**Solutions**:
- Reduce screen resolution in VNC server settings
- Lower color depth (use 16-bit instead of 24-bit)
- Check network bandwidth and latency
- Disable desktop effects on the remote system

## Advanced Configuration

### Custom VNC Options

The noVNC client in the viewer page is configured with:
- `scaleViewport: true` - Automatically scales the remote desktop to fit the browser window
- `resizeSession: true` - Allows dynamic resolution changes

### Multiple VNC Servers

You can configure multiple VNC servers in your `config.json`:

```json
{
  "apps": [
    {
      "name": "Desktop 1",
      "port": 5900,
      "path": "/desktop1"
    },
    {
      "name": "Desktop 2", 
      "port": 5901,
      "path": "/desktop2"
    },
    {
      "name": "Server Monitor",
      "port": 5902,
      "path": "/monitor"
    }
  ]
}
```

## Additional Resources

- **noVNC GitHub**: https://github.com/novnc/noVNC
- **VNC Protocol**: https://www.rfc-editor.org/rfc/rfc6143.html
- **TigerVNC Documentation**: https://tigervnc.org/
- **VNC Security Best Practices**: https://www.realvnc.com/en/connect/docs/security.html

## Support

For issues related to:
- **Proxy Server**: Check server logs and GitHub issues
- **VNC Servers**: Consult VNC server documentation
- **noVNC Client**: Visit https://github.com/novnc/noVNC/issues
