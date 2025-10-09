const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Load configuration
let config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'proxy-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.redirect('/login');
}

// Routes
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Proxy Server - Login</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .login-container {
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          width: 300px;
        }
        h2 {
          margin-top: 0;
          color: #333;
          text-align: center;
        }
        input {
          width: 100%;
          padding: 12px;
          margin: 10px 0;
          border: 1px solid #ddd;
          border-radius: 5px;
          box-sizing: border-box;
        }
        button {
          width: 100%;
          padding: 12px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
        button:hover {
          background: #5568d3;
        }
        .error {
          color: red;
          font-size: 14px;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h2>Proxy Server Login</h2>
        <form method="POST" action="/login">
          <input type="text" name="username" placeholder="Username" required>
          <input type="password" name="password" placeholder="Password" required>
          <button type="submit">Login</button>
          ${req.query.error ? '<div class="error">Invalid credentials</div>' : ''}
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === config.credentials.username && 
      await bcrypt.compare(password, config.credentials.password)) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/', requireAuth, (req, res) => {
  const appsList = config.apps.map(app => `
    <div class="app-card">
      <h3>${app.name}</h3>
      <p>Port: ${app.port}</p>
      <a href="${app.path}" class="btn">Access App</a>
    </div>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Proxy Server - Main Page</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background: #f5f5f5;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        .apps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }
        .app-card {
          background: white;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .app-card h3 {
          margin-top: 0;
          color: #333;
        }
        .btn {
          display: inline-block;
          padding: 10px 20px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin-top: 10px;
        }
        .btn:hover {
          background: #5568d3;
        }
        .btn-secondary {
          background: #6c757d;
        }
        .btn-secondary:hover {
          background: #545b62;
        }
        .nav-buttons {
          display: flex;
          gap: 10px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Proxy Server Dashboard</h1>
        <div class="nav-buttons">
          <a href="/settings" class="btn btn-secondary">Settings</a>
          <a href="/logout" class="btn btn-secondary">Logout</a>
        </div>
      </div>
      <div class="container">
        <h2>Available Apps</h2>
        <div class="apps-grid">
          ${appsList}
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/settings', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Proxy Server - Settings</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background: #f5f5f5;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        .settings-section {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
        input, select {
          width: 100%;
          padding: 12px;
          margin: 10px 0;
          border: 1px solid #ddd;
          border-radius: 5px;
          box-sizing: border-box;
        }
        button, .btn {
          display: inline-block;
          padding: 12px 20px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          text-decoration: none;
          font-size: 16px;
        }
        button:hover, .btn:hover {
          background: #5568d3;
        }
        .btn-secondary {
          background: #6c757d;
        }
        .btn-secondary:hover {
          background: #545b62;
        }
        .btn-danger {
          background: #dc3545;
        }
        .btn-danger:hover {
          background: #c82333;
        }
        .btn-small {
          padding: 6px 12px;
          font-size: 14px;
          margin-left: 10px;
        }
        .toggle-container {
          display: flex;
          align-items: center;
          gap: 15px;
          margin: 20px 0;
        }
        .toggle {
          position: relative;
          width: 60px;
          height: 30px;
        }
        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .4s;
          border-radius: 30px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 22px;
          width: 22px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        input:checked + .slider {
          background-color: #667eea;
        }
        input:checked + .slider:before {
          transform: translateX(30px);
        }
        .message {
          padding: 10px;
          margin: 10px 0;
          border-radius: 5px;
        }
        .success {
          background: #d4edda;
          color: #155724;
        }
        .error {
          background: #f8d7da;
          color: #721c24;
        }
        .app-list {
          margin-top: 20px;
        }
        .app-item {
          background: #f8f9fa;
          padding: 15px;
          margin: 10px 0;
          border-radius: 5px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .app-info {
          flex: 1;
        }
        .app-actions {
          display: flex;
          gap: 10px;
        }
        .two-column {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 768px) {
          .two-column {
            grid-template-columns: 1fr;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Settings</h1>
        <a href="/" class="btn btn-secondary">Back to Dashboard</a>
      </div>
      <div class="container">
        <div class="settings-section">
          <h2>Hostname Configuration</h2>
          <p>Set the hostname for accessing apps running on this device. Use the device's network name or IP address.</p>
          <form id="hostnameForm">
            <input type="text" name="hostname" placeholder="Hostname (e.g., myserver, 192.168.1.100)" value="${config.hostname || 'localhost'}" required>
            <button type="submit">Update Hostname</button>
          </form>
          <div id="hostnameMessage"></div>
          <p style="margin-top: 15px; font-size: 14px; color: #666;">
            <strong>Note:</strong> Apps will be accessible at http://${config.hostname || 'localhost'}:PORT
          </p>
        </div>

        <div class="settings-section">
          <h2>Manage Apps</h2>
          <p>Add, edit, or remove applications. Changes require server restart to take effect.</p>
          
          <h3>Add New App</h3>
          <form id="addAppForm">
            <input type="text" name="name" placeholder="App Name" required>
            <input type="number" name="port" placeholder="Port" required min="1" max="65535">
            <input type="text" name="path" placeholder="Path (e.g., /myapp)" required pattern="^/[a-zA-Z0-9-_/]*$">
            <button type="submit">Add App</button>
          </form>
          <div id="addAppMessage"></div>

          <h3>Current Apps</h3>
          <div id="appsList" class="app-list">
            ${config.apps.map(app => `
              <div class="app-item" data-path="${app.path}">
                <div class="app-info">
                  <strong>${app.name}</strong><br>
                  <small>Port: ${app.port} | Path: ${app.path}</small>
                </div>
                <div class="app-actions">
                  <button class="btn btn-small btn-secondary edit-app" data-path="${app.path}" data-name="${app.name}" data-port="${app.port}">Edit</button>
                  <button class="btn btn-small btn-danger delete-app" data-path="${app.path}">Delete</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="two-column">
          <div class="settings-section">
            <h2>Run on Startup (Ubuntu Noble ARM64)</h2>
            <div class="toggle-container">
              <label class="toggle">
                <input type="checkbox" id="startupToggle" ${config.runOnStartup ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
              <span>Enable automatic startup on system boot</span>
            </div>
            <div id="startupMessage"></div>
          </div>

          <div class="settings-section">
            <h2>Change Password</h2>
            <form id="passwordForm">
              <input type="password" name="currentPassword" placeholder="Current Password" required>
              <input type="password" name="newPassword" placeholder="New Password" required>
              <input type="password" name="confirmPassword" placeholder="Confirm New Password" required>
              <button type="submit">Update Password</button>
            </form>
            <div id="passwordMessage"></div>
          </div>
        </div>

        <div class="settings-section">
          <h2>Change Username</h2>
          <form id="usernameForm">
            <input type="text" name="newUsername" placeholder="New Username" required>
            <input type="password" name="password" placeholder="Current Password" required>
            <button type="submit">Update Username</button>
          </form>
          <div id="usernameMessage"></div>
        </div>
      </div>

      <script>
        // Handle hostname change
        document.getElementById('hostnameForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const data = Object.fromEntries(formData);
          const messageDiv = document.getElementById('hostnameMessage');
          
          try {
            const response = await fetch('/api/change-hostname', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.success) {
              messageDiv.innerHTML = '<div class="message success">' + result.message + '</div>';
            } else {
              messageDiv.innerHTML = '<div class="message error">' + result.error + '</div>';
            }
          } catch (error) {
            messageDiv.innerHTML = '<div class="message error">Error: ' + error.message + '</div>';
          }
        });

        // Handle add app
        document.getElementById('addAppForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const data = Object.fromEntries(formData);
          const messageDiv = document.getElementById('addAppMessage');
          
          try {
            const response = await fetch('/api/apps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.success) {
              messageDiv.innerHTML = '<div class="message success">' + result.message + '</div>';
              e.target.reset();
              setTimeout(() => location.reload(), 2000);
            } else {
              messageDiv.innerHTML = '<div class="message error">' + result.error + '</div>';
            }
          } catch (error) {
            messageDiv.innerHTML = '<div class="message error">Error: ' + error.message + '</div>';
          }
        });

        // Handle edit app
        document.querySelectorAll('.edit-app').forEach(btn => {
          btn.addEventListener('click', async () => {
            const path = btn.dataset.path;
            const name = btn.dataset.name;
            const port = btn.dataset.port;
            
            const newName = prompt('Enter new name:', name);
            if (!newName) return;
            
            const newPort = prompt('Enter new port:', port);
            if (!newPort) return;
            
            const newPath = prompt('Enter new path:', path);
            if (!newPath) return;
            
            try {
              const response = await fetch('/api/apps/' + encodeURIComponent(path), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, port: parseInt(newPort), path: newPath })
              });
              const result = await response.json();
              
              if (result.success) {
                alert(result.message);
                location.reload();
              } else {
                alert('Error: ' + result.error);
              }
            } catch (error) {
              alert('Error: ' + error.message);
            }
          });
        });

        // Handle delete app
        document.querySelectorAll('.delete-app').forEach(btn => {
          btn.addEventListener('click', async () => {
            const path = btn.dataset.path;
            
            if (!confirm('Are you sure you want to delete this app?')) return;
            
            try {
              const response = await fetch('/api/apps/' + encodeURIComponent(path), {
                method: 'DELETE'
              });
              const result = await response.json();
              
              if (result.success) {
                alert(result.message);
                location.reload();
              } else {
                alert('Error: ' + result.error);
              }
            } catch (error) {
              alert('Error: ' + error.message);
            }
          });
        });

        // Handle startup toggle
        document.getElementById('startupToggle').addEventListener('change', async (e) => {
          const enabled = e.target.checked;
          const messageDiv = document.getElementById('startupMessage');
          
          try {
            const response = await fetch('/api/startup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled })
            });
            const data = await response.json();
            
            if (data.success) {
              messageDiv.innerHTML = '<div class="message success">Startup setting updated successfully</div>';
            } else {
              messageDiv.innerHTML = '<div class="message error">Failed to update: ' + data.error + '</div>';
              e.target.checked = !enabled; // Revert toggle
            }
          } catch (error) {
            messageDiv.innerHTML = '<div class="message error">Error: ' + error.message + '</div>';
            e.target.checked = !enabled; // Revert toggle
          }
        });

        // Handle password change
        document.getElementById('passwordForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const data = Object.fromEntries(formData);
          const messageDiv = document.getElementById('passwordMessage');
          
          if (data.newPassword !== data.confirmPassword) {
            messageDiv.innerHTML = '<div class="message error">Passwords do not match</div>';
            return;
          }
          
          try {
            const response = await fetch('/api/change-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.success) {
              messageDiv.innerHTML = '<div class="message success">Password updated successfully</div>';
              e.target.reset();
            } else {
              messageDiv.innerHTML = '<div class="message error">' + result.error + '</div>';
            }
          } catch (error) {
            messageDiv.innerHTML = '<div class="message error">Error: ' + error.message + '</div>';
          }
        });

        // Handle username change
        document.getElementById('usernameForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const data = Object.fromEntries(formData);
          const messageDiv = document.getElementById('usernameMessage');
          
          try {
            const response = await fetch('/api/change-username', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const result = await response.json();
            
            if (result.success) {
              messageDiv.innerHTML = '<div class="message success">Username updated successfully</div>';
              e.target.reset();
            } else {
              messageDiv.innerHTML = '<div class="message error">' + result.error + '</div>';
            }
          } catch (error) {
            messageDiv.innerHTML = '<div class="message error">Error: ' + error.message + '</div>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// API endpoints
app.post('/api/startup', requireAuth, async (req, res) => {
  const { enabled } = req.body;
  
  try {
    config.runOnStartup = enabled;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    const servicePath = '/etc/systemd/system/proxy-server.service';
    
    if (enabled) {
      // Enable the service
      exec('sudo systemctl enable proxy-server.service', (error, stdout, stderr) => {
        if (error) {
          console.error('Error enabling service:', error);
          return res.json({ success: false, error: 'Failed to enable service. Make sure systemd service is installed.' });
        }
        res.json({ success: true });
      });
    } else {
      // Disable the service
      exec('sudo systemctl disable proxy-server.service', (error, stdout, stderr) => {
        if (error) {
          console.error('Error disabling service:', error);
          return res.json({ success: false, error: 'Failed to disable service. Make sure systemd service is installed.' });
        }
        res.json({ success: true });
      });
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  try {
    const isValid = await bcrypt.compare(currentPassword, config.credentials.password);
    
    if (!isValid) {
      return res.json({ success: false, error: 'Current password is incorrect' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    config.credentials.password = hashedPassword;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/change-username', requireAuth, async (req, res) => {
  const { newUsername, password } = req.body;
  
  try {
    const isValid = await bcrypt.compare(password, config.credentials.password);
    
    if (!isValid) {
      return res.json({ success: false, error: 'Password is incorrect' });
    }
    
    config.credentials.username = newUsername;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/change-hostname', requireAuth, async (req, res) => {
  const { hostname } = req.body;
  
  try {
    config.hostname = hostname || 'localhost';
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: 'Hostname updated. Please restart the server for changes to take effect.' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/apps', requireAuth, async (req, res) => {
  const { name, port, path } = req.body;
  
  try {
    if (!name || !port || !path) {
      return res.json({ success: false, error: 'Name, port, and path are required' });
    }
    
    // Check if path already exists
    if (config.apps.some(app => app.path === path)) {
      return res.json({ success: false, error: 'Path already exists' });
    }
    
    config.apps.push({ name, port: parseInt(port), path });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: 'App added. Please restart the server for changes to take effect.' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.put('/api/apps/:path', requireAuth, async (req, res) => {
  const oldPath = decodeURIComponent(req.params.path);
  const { name, port, path: newPath } = req.body;
  
  try {
    const appIndex = config.apps.findIndex(app => app.path === oldPath);
    
    if (appIndex === -1) {
      return res.json({ success: false, error: 'App not found' });
    }
    
    // Check if new path conflicts with another app
    if (newPath !== oldPath && config.apps.some(app => app.path === newPath)) {
      return res.json({ success: false, error: 'Path already exists' });
    }
    
    config.apps[appIndex] = { name, port: parseInt(port), path: newPath };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: 'App updated. Please restart the server for changes to take effect.' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.delete('/api/apps/:path', requireAuth, async (req, res) => {
  const path = decodeURIComponent(req.params.path);
  
  try {
    const appIndex = config.apps.findIndex(app => app.path === path);
    
    if (appIndex === -1) {
      return res.json({ success: false, error: 'App not found' });
    }
    
    config.apps.splice(appIndex, 1);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: 'App removed. Please restart the server for changes to take effect.' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/apps', requireAuth, async (req, res) => {
  res.json({ apps: config.apps, hostname: config.hostname || 'localhost' });
});

// Setup proxy for each app
config.apps.forEach(appConfig => {
  app.use(appConfig.path, requireAuth, createProxyMiddleware({
    target: `http://${config.hostname || 'localhost'}:${appConfig.port}`,
    changeOrigin: true,
    pathRewrite: {
      [`^${appConfig.path}`]: '',
    },
  }));
});

// Start server
const PORT = config.port || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server running on http://0.0.0.0:${PORT}`);
  console.log(`Accessible on network via http://<hostname>:${PORT}`);
  console.log(`Default credentials: username='admin', password='admin'`);
});
