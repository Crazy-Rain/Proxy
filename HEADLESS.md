# Headless Display Setup Guide

This guide provides multiple solutions for accessing a graphical interface remotely on a headless Nanopi R76S or similar ARM64 devices without a physical monitor.

## Overview

When running on a headless system (no monitor connected), you may still need to view and interact with graphical applications. This guide presents several alternatives to traditional VNC, which can have installation issues on ARM devices.

## Solution Options

### Option 1: noVNC (Recommended for Beginners)

noVNC provides VNC access through a web browser, eliminating the need for VNC client software.

#### Prerequisites
```bash
sudo apt update
sudo apt install -y x11vnc websockify python3-numpy
```

#### Setup

1. **Start X server for headless operation:**
```bash
# Install virtual framebuffer
sudo apt install -y xvfb

# Start Xvfb (X virtual framebuffer)
Xvfb :1 -screen 0 1920x1080x24 &
export DISPLAY=:1
```

**Note**: The `&` at the end of shell commands runs them in the background. This is correct for manual shell commands but should NOT be used in systemd service files - systemd handles process management automatically.

2. **Start your desktop environment (optional):**
```bash
# Install a lightweight desktop if needed
sudo apt install -y xfce4 xfce4-goodies

# Start XFCE on the virtual display
startxfce4 &
```

3. **Start x11vnc server:**

**⚠️ Security Warning**: The example below uses `-nopw` (no password) for simplicity during initial setup. For production use, always add password authentication using `-rfbauth` or access through SSH tunneling. See the [Security Considerations](#security-considerations) section below.

```bash
x11vnc -display :1 -nopw -listen 0.0.0.0 -xkb -forever -shared &
```

4. **Start noVNC:**
```bash
# Clone noVNC
cd ~
git clone https://github.com/novnc/noVNC.git
cd noVNC

# Start websockify (connects VNC to web browser)
./utils/novnc_proxy --vnc localhost:5900 --listen 6080
```

5. **Access via browser:**
   - Open: `http://<nanopi-ip>:6080/vnc.html`
   - Click "Connect"
   - You should see your graphical desktop

#### Create systemd service (autostart):

**⚠️ Important**: Replace `yourusername` with your actual Linux username in the service file below.

**Note**: Do NOT use `&` at the end of commands in systemd service files - systemd handles backgrounding automatically.

Create `/etc/systemd/system/headless-display.service`:
```ini
[Unit]
Description=Headless Display with noVNC
After=network.target

[Service]
Type=simple
User=yourusername
Environment="DISPLAY=:1"
ExecStart=/bin/bash -c 'Xvfb :1 -screen 0 1920x1080x24 & sleep 2; x11vnc -display :1 -nopw -listen 0.0.0.0 -xkb -forever -shared & sleep 2; /home/yourusername/noVNC/utils/novnc_proxy --vnc localhost:5900 --listen 6080'
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable headless-display
sudo systemctl start headless-display
```

---

### Option 2: X11 Forwarding (Lightweight)

The simplest solution - forward X11 applications over SSH. No server-side desktop needed.

#### Setup

1. **Install X11 server on your client machine:**
   - **Windows**: Install [VcXsrv](https://sourceforge.net/projects/vcxsrv/) or [Xming](https://sourceforge.net/projects/xming/)
   - **macOS**: Install [XQuartz](https://www.xquartz.org/)
   - **Linux**: X11 is usually pre-installed

2. **Enable X11 forwarding on Nanopi:**
```bash
sudo nano /etc/ssh/sshd_config
```

Add or uncomment:
```
X11Forwarding yes
X11DisplayOffset 10
X11UseLocalhost no
```

Restart SSH:
```bash
sudo systemctl restart sshd
```

3. **Connect from client with X11 forwarding:**
```bash
ssh -X user@nanopi-ip
```

Or for compressed connection (slower network):
```bash
ssh -C -X user@nanopi-ip
```

4. **Run GUI applications:**
```bash
# Test with a simple app
xterm &

# Or run your desired GUI application
firefox &
gedit &
```

The application window will appear on your client machine.

**Pros**: Simple, secure, no additional services
**Cons**: Only forwards individual apps, not full desktop; can be slow over slow networks

---

### Option 3: XPRA (Best for Performance)

XPRA is like "screen for X11" - it's faster than VNC and supports session persistence.

#### Installation

```bash
# Add XPRA repository
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:mikhailnov/xpra
sudo apt update
sudo apt install -y xpra
```

**Note**: If the PPA is not available or fails on ARM64, you can try:
1. Installing from Ubuntu's default repositories: `sudo apt install xpra` (may be an older version)
2. Building from source - see [XPRA documentation](https://github.com/Xpra-org/xpra/wiki) for ARM64-specific instructions

#### Usage

1. **Start XPRA server on Nanopi:**
```bash
# Start a session
xpra start :100

# Or start with a specific app
xpra start :100 --start=xfce4-session
```

2. **Connect from client:**

**Method A - SSH tunnel (recommended):**
```bash
# From your client machine
xpra attach ssh://user@nanopi-ip/100
```

**Method B - Direct connection:**
```bash
# On Nanopi, allow network connections
xpra start :100 --bind-tcp=0.0.0.0:10000

# From client
xpra attach tcp://nanopi-ip:10000
```

3. **HTML5 Client (browser-based):**
```bash
# On Nanopi
xpra start :100 --bind-tcp=0.0.0.0:10000 --html=on

# Access from browser
http://nanopi-ip:10000/
```

#### Create systemd service:

**⚠️ Important**: Replace `yourusername` with your actual Linux username in the service file below.

Create `/etc/systemd/system/xpra.service`:
```ini
[Unit]
Description=XPRA Server
After=network.target

[Service]
Type=simple
User=yourusername
Environment="DISPLAY=:100"
ExecStart=/usr/bin/xpra start :100 --bind-tcp=0.0.0.0:10000 --html=on --start=xfce4-session --daemon=no
ExecStop=/usr/bin/xpra stop :100
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

**Pros**: Fast, persistent sessions, HTML5 client available
**Cons**: Requires client installation (except for HTML5 mode)

---

### Option 4: Wayvnc + Wayland (Modern Approach)

For a modern Wayland-based setup that's lightweight and ARM-friendly.

#### Installation

**Note**: Verify package availability on your system first: `apt-cache search wayvnc`. On some ARM64 systems, wayvnc may need to be built from source.

```bash
sudo apt install -y wayland weston wayvnc
```

#### Setup

1. **Start Weston (Wayland compositor):**
```bash
# Set up virtual display
export XDG_RUNTIME_DIR=/tmp
export WAYLAND_DISPLAY=wayland-1

# Start Weston in headless mode
weston --backend=headless-backend.so --width=1920 --height=1080 &
```

2. **Start Wayvnc:**
```bash
wayvnc 0.0.0.0 5900
```

3. **Connect with VNC client:**
Use any VNC viewer to connect to `nanopi-ip:5900`

**Pros**: Modern, lightweight, works well on ARM
**Cons**: Requires Wayland-compatible applications

---

## Integration with Proxy Server

You can add your headless display solution to the Proxy Server dashboard:

1. **Edit config.json:**
```json
{
  "apps": [
    {
      "name": "Remote Desktop (noVNC)",
      "port": 6080,
      "path": "/desktop",
      "icon": "🖥️"
    }
  ]
}
```

2. **Access through proxy:**
Visit your proxy at `http://nanopi-ip:3000`, login, and access the desktop through the dashboard.

---

## Troubleshooting

### Display Issues

**Problem**: Cannot connect to display
```bash
# Check if X server is running
ps aux | grep X

# Check display variable
echo $DISPLAY

# Test X server
xdpyinfo -display :1
```

**Problem**: Permission denied
```bash
# Grant X server access
xhost +local:
```

### Network Issues

**Problem**: Cannot connect from remote machine
```bash
# Check if service is listening
sudo netstat -tulpn | grep <port>

# Check firewall
sudo ufw status
sudo ufw allow <port>/tcp
```

### Performance Issues

**Problem**: Slow/laggy display

1. **Reduce resolution:**
```bash
Xvfb :1 -screen 0 1280x720x16 &  # Lower resolution and color depth
```

2. **Use XPRA instead** - it's designed for network efficiency

3. **Optimize X11 forwarding:**
```bash
ssh -C -c aes128-ctr -X user@nanopi-ip  # Use compression and faster cipher
```

---

## Security Considerations

1. **Always use authentication:**
   - For x11vnc: Use `-rfbauth` option to set password
   - For XPRA: Use `--auth=tcp:filename` with password file
   - For SSH: Use key-based authentication

2. **Use SSH tunneling when possible:**
```bash
# Example: Tunnel VNC through SSH
ssh -L 5900:localhost:5900 user@nanopi-ip
# Then connect VNC to localhost:5900
```

3. **Firewall rules:**
```bash
# Only allow from specific IP
sudo ufw allow from 192.168.1.0/24 to any port 6080
```

4. **Use the Proxy Server:**
The proxy server provides authentication. Access your display through it instead of exposing ports directly.

---

## Recommended Setup for Nanopi R76S

Based on the device's ARM64 architecture and potential VNC issues, here's the recommended approach:

### Quick Setup (Easiest)

1. **Use X11 forwarding** for occasional GUI access - no server setup needed
2. **Or use XPRA HTML5** for browser-based access - single command to start

### Full Desktop Setup (Most Features)

1. **Install noVNC** - works in any browser, no client software
2. **Run behind the Proxy Server** - adds authentication and management
3. **Create systemd service** - automatic startup

### Commands Summary:

**⚠️ Security Warning**: The quick test commands below use `-nopw` (no password) for simplicity. For production use, always add password authentication or use SSH tunneling. See the [Security Considerations](#security-considerations) section.

```bash
# Quick test
sudo apt install -y xvfb x11vnc
Xvfb :1 -screen 0 1920x1080x24 &
export DISPLAY=:1
startxfce4 &
x11vnc -display :1 -nopw -forever &

# Access with VNC client at: nanopi-ip:5900
```

---

## Additional Resources

- [noVNC Documentation](https://github.com/novnc/noVNC)
- [XPRA Wiki](https://github.com/Xpra-org/xpra/wiki)
- [X11 Forwarding Guide](https://wiki.archlinux.org/title/OpenSSH#X11_forwarding)
- [Wayland Documentation](https://wayland.freedesktop.org/)

## Questions?

If you encounter issues specific to the Nanopi R76S, check:
- Nanopi forums for ARM-specific solutions
- Ubuntu ARM64 documentation
- This proxy server's GitHub issues

The proxy server terminal (`/terminal` endpoint) can help with running commands and troubleshooting without needing SSH access.
