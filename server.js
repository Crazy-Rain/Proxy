const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const http = require('http');
const socketIo = require('socket.io');
const pty = require('node-pty');
const os = require('os');
const multer = require('multer');
const net = require('net');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const CONFIG_FILE = path.join(__dirname, 'config.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Load configuration
let config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'icon-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOADS_DIR));
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
          transition: background 0.3s ease;
        }
        body.dark-mode {
          background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%);
        }
        .login-container {
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          width: 300px;
          transition: background 0.3s ease, color 0.3s ease;
        }
        body.dark-mode .login-container {
          background: #2d2d3a;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        h2 {
          margin-top: 0;
          color: #333;
          text-align: center;
          transition: color 0.3s ease;
        }
        body.dark-mode h2 {
          color: #e0e0e0;
        }
        input {
          width: 100%;
          padding: 12px;
          margin: 10px 0;
          border: 1px solid #ddd;
          border-radius: 5px;
          box-sizing: border-box;
          transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
        }
        body.dark-mode input {
          background: #1a1a2e;
          border-color: #444;
          color: #e0e0e0;
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
        body.dark-mode .error {
          color: #ff6b6b;
        }
        .dark-mode-toggle {
          position: fixed;
          top: 20px;
          right: 20px;
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          cursor: pointer;
          font-size: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.3s ease;
        }
        .dark-mode-toggle:hover {
          background: rgba(255,255,255,0.3);
        }
        body.dark-mode .dark-mode-toggle {
          background: rgba(255,255,255,0.1);
        }
        body.dark-mode .dark-mode-toggle:hover {
          background: rgba(255,255,255,0.2);
        }
      </style>
    </head>
    <body>
      <button class="dark-mode-toggle" onclick="toggleDarkMode()" aria-label="Toggle dark mode">🌙</button>
      <div class="login-container">
        <h2>Proxy Server Login</h2>
        <form method="POST" action="/login">
          <input type="text" name="username" placeholder="Username" required>
          <input type="password" name="password" placeholder="Password" required>
          <button type="submit">Login</button>
          ${req.query.error ? '<div class="error">Invalid credentials</div>' : ''}
        </form>
      </div>
      <script>
        // Dark mode functionality
        function toggleDarkMode() {
          document.body.classList.toggle('dark-mode');
          const isDark = document.body.classList.contains('dark-mode');
          localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
          document.querySelector('.dark-mode-toggle').textContent = isDark ? '☀️' : '🌙';
        }
        
        // Load dark mode preference
        if (localStorage.getItem('darkMode') === 'enabled') {
          document.body.classList.add('dark-mode');
          document.querySelector('.dark-mode-toggle').textContent = '☀️';
        }
      </script>
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
      ${app.icon ? (app.icon.startsWith('/uploads/') ? `<div class="app-icon"><img src="${app.icon}" alt="App icon" style="width: 64px; height: 64px; object-fit: cover; border-radius: 8px;"></div>` : `<div class="app-icon">${app.icon}</div>`) : ''}
      <h3>${app.name}</h3>
      <p>Port: ${app.port}</p>
      <a href="/viewer?app=${encodeURIComponent(app.path)}" class="btn">Access App</a>
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
          transition: background 0.3s ease;
        }
        body.dark-mode {
          background: #1a1a2e;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.3s ease;
        }
        body.dark-mode .header {
          background: linear-gradient(135deg, #2d2d3a 0%, #1a1a2e 100%);
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
          transition: background 0.3s ease, box-shadow 0.3s ease;
        }
        body.dark-mode .app-card {
          background: #2d2d3a;
          box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
        .app-card h3 {
          margin-top: 0;
          color: #333;
          transition: color 0.3s ease;
        }
        body.dark-mode .app-card h3 {
          color: #e0e0e0;
        }
        .app-card p {
          transition: color 0.3s ease;
        }
        body.dark-mode .app-card p {
          color: #b0b0b0;
        }
        .app-icon {
          font-size: 48px;
          text-align: center;
          margin-bottom: 10px;
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
          align-items: center;
        }
        .dark-mode-toggle {
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          cursor: pointer;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.3s ease;
        }
        .dark-mode-toggle:hover {
          background: rgba(255,255,255,0.3);
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Proxy Server Dashboard</h1>
        <div class="nav-buttons">
          <button class="dark-mode-toggle" onclick="toggleDarkMode()" aria-label="Toggle dark mode">🌙</button>
          <a href="/remote-desktop" class="btn btn-secondary">Remote Desktop</a>
          <a href="/terminal" class="btn btn-secondary">Terminal</a>
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
      <script>
        // Dark mode functionality
        function toggleDarkMode() {
          document.body.classList.toggle('dark-mode');
          const isDark = document.body.classList.contains('dark-mode');
          localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
          document.querySelector('.dark-mode-toggle').textContent = isDark ? '☀️' : '🌙';
        }
        
        // Load dark mode preference
        if (localStorage.getItem('darkMode') === 'enabled') {
          document.body.classList.add('dark-mode');
          document.querySelector('.dark-mode-toggle').textContent = '☀️';
        }
      </script>
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
          transition: background 0.3s ease;
        }
        body.dark-mode {
          background: #1a1a2e;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.3s ease;
        }
        body.dark-mode .header {
          background: linear-gradient(135deg, #2d2d3a 0%, #1a1a2e 100%);
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
          transition: background 0.3s ease, box-shadow 0.3s ease;
        }
        body.dark-mode .settings-section {
          background: #2d2d3a;
          box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
        .settings-section h2,
        .settings-section h3 {
          transition: color 0.3s ease;
        }
        body.dark-mode .settings-section h2,
        body.dark-mode .settings-section h3 {
          color: #e0e0e0;
        }
        .settings-section p,
        .settings-section label,
        .settings-section small {
          transition: color 0.3s ease;
        }
        body.dark-mode .settings-section p,
        body.dark-mode .settings-section label,
        body.dark-mode .settings-section small {
          color: #b0b0b0;
        }
        input, select {
          width: 100%;
          padding: 12px;
          margin: 10px 0;
          border: 1px solid #ddd;
          border-radius: 5px;
          box-sizing: border-box;
          transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
        }
        body.dark-mode input,
        body.dark-mode select {
          background: #1a1a2e;
          border-color: #444;
          color: #e0e0e0;
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
        body.dark-mode .success {
          background: #1e4620;
          color: #a3d9a5;
        }
        body.dark-mode .error {
          background: #5a1f1f;
          color: #ff9999;
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
          transition: background 0.3s ease;
        }
        body.dark-mode .app-item {
          background: #1a1a2e;
        }
        .app-info {
          flex: 1;
          transition: color 0.3s ease;
        }
        body.dark-mode .app-info {
          color: #e0e0e0;
        }
        body.dark-mode .app-info strong {
          color: #e0e0e0;
        }
        body.dark-mode .app-info small {
          color: #b0b0b0;
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
        .dark-mode-toggle {
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          cursor: pointer;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.3s ease;
          padding: 0;
          margin-right: 10px;
        }
        .dark-mode-toggle:hover {
          background: rgba(255,255,255,0.3);
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Settings</h1>
        <div style="display: flex; align-items: center; gap: 10px;">
          <button class="dark-mode-toggle" onclick="toggleDarkMode()" aria-label="Toggle dark mode">🌙</button>
          <a href="/" class="btn btn-secondary">Back to Dashboard</a>
        </div>
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
            <div style="margin: 10px 0;">
              <label style="display: block; margin-bottom: 5px; font-weight: bold;">Icon:</label>
              <div style="display: flex; gap: 10px; align-items: center;">
                <input type="text" name="icon" id="iconInput" placeholder="Emoji or text (optional)" style="flex: 1;">
                <button type="button" id="uploadIconBtn" class="btn btn-secondary" style="white-space: nowrap;">Browse Image</button>
              </div>
              <input type="file" id="iconFileInput" accept="image/*" style="display: none;">
              <div id="iconPreview" style="margin-top: 10px;"></div>
            </div>
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
                  ${app.icon ? (app.icon.startsWith('/uploads/') ? `<img src="${app.icon}" alt="icon" style="width: 32px; height: 32px; object-fit: cover; border-radius: 4px; margin-right: 10px; vertical-align: middle;">` : `<span style="font-size: 24px; margin-right: 10px;">${app.icon}</span>`) : ''}
                  <strong>${app.name}</strong><br>
                  <small>Port: ${app.port} | Path: ${app.path}</small>
                </div>
                <div class="app-actions">
                  <button class="btn btn-small btn-secondary edit-app" data-path="${app.path}" data-name="${app.name}" data-port="${app.port}" data-icon="${app.icon || ''}">Edit</button>
                  <button class="btn btn-small btn-danger delete-app" data-path="${app.path}">Delete</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="two-column">
          <div class="settings-section">
            <h2>Run on Startup</h2>
            <div class="toggle-container">
              <label class="toggle">
                <input type="checkbox" id="startupToggle" ${config.runOnStartup ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
              <span>Enable automatic startup on system boot (systemd user service)</span>
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
        // Icon upload functionality
        let uploadedIconPath = null;
        
        document.getElementById('uploadIconBtn').addEventListener('click', () => {
          document.getElementById('iconFileInput').click();
        });
        
        document.getElementById('iconFileInput').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          const formData = new FormData();
          formData.append('icon', file);
          
          try {
            const response = await fetch('/api/upload-icon', {
              method: 'POST',
              body: formData
            });
            const result = await response.json();
            
            if (result.success) {
              uploadedIconPath = result.iconPath;
              document.getElementById('iconInput').value = result.iconPath;
              document.getElementById('iconPreview').innerHTML = 
                '<img src="' + result.iconPath + '" alt="Preview" style="width: 64px; height: 64px; object-fit: cover; border-radius: 8px; border: 2px solid #667eea;">';
            } else {
              alert('Upload failed: ' + result.error);
            }
          } catch (error) {
            alert('Error uploading file: ' + error.message);
          }
        });
      
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
            const icon = btn.dataset.icon;
            
            const newName = prompt('Enter new name:', name);
            if (!newName) return;
            
            const newIcon = prompt('Enter new icon (emoji or text, leave empty for none):', icon);
            
            const newPort = prompt('Enter new port:', port);
            if (!newPort) return;
            
            const newPath = prompt('Enter new path:', path);
            if (!newPath) return;
            
            try {
              const response = await fetch('/api/apps/' + encodeURIComponent(path), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, port: parseInt(newPort), path: newPath, icon: newIcon })
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
              const msg = data.message || 'Startup setting updated successfully';
              messageDiv.innerHTML = '<div class="message success">' + msg + '</div>';
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

        // Dark mode functionality
        function toggleDarkMode() {
          document.body.classList.toggle('dark-mode');
          const isDark = document.body.classList.contains('dark-mode');
          localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
          document.querySelector('.dark-mode-toggle').textContent = isDark ? '☀️' : '🌙';
        }
        
        // Load dark mode preference
        if (localStorage.getItem('darkMode') === 'enabled') {
          document.body.classList.add('dark-mode');
          document.querySelector('.dark-mode-toggle').textContent = '☀️';
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/terminal', requireAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Proxy Server - Terminal</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background: #f5f5f5;
          transition: background 0.3s ease;
        }
        body.dark-mode {
          background: #1a1a2e;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.3s ease;
        }
        body.dark-mode .header {
          background: linear-gradient(135deg, #2d2d3a 0%, #1a1a2e 100%);
        }
        .btn {
          display: inline-block;
          padding: 10px 20px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 5px;
        }
        .btn-secondary {
          background: #6c757d;
        }
        .btn-secondary:hover {
          background: #545b62;
        }
        .container {
          max-width: 1200px;
          margin: 20px auto;
          padding: 20px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          transition: background 0.3s ease, box-shadow 0.3s ease;
        }
        body.dark-mode .container {
          background: #2d2d3a;
          box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
        .container p {
          transition: color 0.3s ease;
        }
        body.dark-mode .container p {
          color: #b0b0b0;
        }
        #terminal {
          height: 600px;
        }
        .xterm {
          height: 100%;
        }
        .xterm-viewport {
          background-color: #1e1e1e;
        }
        .dark-mode-toggle {
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          cursor: pointer;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.3s ease;
          padding: 0;
          margin-right: 10px;
        }
        .dark-mode-toggle:hover {
          background: rgba(255,255,255,0.3);
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Terminal</h1>
        <div style="display: flex; align-items: center; gap: 10px;">
          <button class="dark-mode-toggle" onclick="toggleDarkMode()" aria-label="Toggle dark mode">🌙</button>
          <a href="/" class="btn btn-secondary">Back to Dashboard</a>
        </div>
      </div>
      <div class="container">
        <p><strong>Note:</strong> Web terminal requires proper permissions. If it doesn't work, you may need to SSH into the device directly.</p>
        <div id="terminal"></div>
      </div>
      
      <script src="/socket.io/socket.io.js"></script>
      <script>
        // Dark mode functionality
        function toggleDarkMode() {
          document.body.classList.toggle('dark-mode');
          const isDark = document.body.classList.contains('dark-mode');
          localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
          document.querySelector('.dark-mode-toggle').textContent = isDark ? '☀️' : '🌙';
        }
        
        // Load dark mode preference
        if (localStorage.getItem('darkMode') === 'enabled') {
          document.body.classList.add('dark-mode');
          document.querySelector('.dark-mode-toggle').textContent = '☀️';
        }
        
        // Simple terminal implementation using socket.io
        const socket = io();
        const terminalDiv = document.getElementById('terminal');
        
        // Create a simple terminal interface
        const output = document.createElement('pre');
        output.style.cssText = 'background: #1e1e1e; color: #d4d4d4; padding: 10px; margin: 0; font-family: monospace; height: 580px; overflow-y: auto;';
        const input = document.createElement('input');
        input.type = 'text';
        input.style.cssText = 'width: 100%; padding: 10px; font-family: monospace; background: #2d2d2d; color: #d4d4d4; border: none; box-sizing: border-box;';
        input.placeholder = 'Type command and press Enter...';
        
        terminalDiv.appendChild(output);
        terminalDiv.appendChild(input);
        
        // Start terminal session
        socket.emit('start-terminal');
        
        // Receive terminal output
        socket.on('terminal-output', (data) => {
          output.textContent += data;
          output.scrollTop = output.scrollHeight;
        });
        
        // Send terminal input
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const cmd = input.value + '\\n';
            socket.emit('terminal-input', cmd);
            input.value = '';
          }
        });
        
        // Focus input
        input.focus();
      </script>
    </body>
    </html>
  `);
});

// Remote Desktop page
app.get('/remote-desktop', requireAuth, (req, res) => {
  const vncConfig = config.remoteDesktop || { host: 'localhost', port: 5900 };
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Proxy Server - Remote Desktop</title>
      <style>
        * {
          box-sizing: border-box;
        }
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background: #1a1a2e;
          color: #e0e0e0;
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 10px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }
        .header h1 {
          margin: 0;
          font-size: 1.2rem;
        }
        .header-buttons {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .btn {
          padding: 8px 16px;
          background: rgba(255,255,255,0.2);
          color: white;
          text-decoration: none;
          border-radius: 5px;
          border: none;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.3s ease;
        }
        .btn:hover {
          background: rgba(255,255,255,0.3);
        }
        .btn-success {
          background: #28a745;
        }
        .btn-success:hover {
          background: #218838;
        }
        .btn-danger {
          background: #dc3545;
        }
        .btn-danger:hover {
          background: #c82333;
        }
        .toolbar {
          background: #2d2d3a;
          padding: 10px 20px;
          display: flex;
          gap: 15px;
          align-items: center;
          flex-wrap: wrap;
          flex-shrink: 0;
          border-bottom: 1px solid #444;
        }
        .toolbar label {
          font-size: 14px;
          color: #b0b0b0;
        }
        .toolbar input, .toolbar select {
          padding: 6px 10px;
          border-radius: 4px;
          border: 1px solid #444;
          background: #1a1a2e;
          color: #e0e0e0;
          font-size: 14px;
        }
        .toolbar input:focus, .toolbar select:focus {
          outline: none;
          border-color: #667eea;
        }
        .status {
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 14px;
          font-weight: bold;
        }
        .status.disconnected {
          background: #dc3545;
          color: white;
        }
        .status.connecting {
          background: #ffc107;
          color: #000;
        }
        .status.connected {
          background: #28a745;
          color: white;
        }
        .vnc-container {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          background: #000;
          position: relative;
        }
        #vnc-screen {
          max-width: 100%;
          max-height: 100%;
        }
        .placeholder {
          text-align: center;
          color: #666;
        }
        .placeholder h2 {
          margin-bottom: 10px;
        }
        .placeholder p {
          margin: 5px 0;
          font-size: 14px;
        }
        .info-panel {
          background: #2d2d3a;
          padding: 15px 20px;
          border-top: 1px solid #444;
          font-size: 13px;
          flex-shrink: 0;
        }
        .info-panel strong {
          color: #667eea;
        }
        .fullscreen-btn {
          position: absolute;
          bottom: 20px;
          right: 20px;
          z-index: 100;
          background: rgba(0,0,0,0.7);
          border: 1px solid #444;
        }
        .control-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .separator {
          width: 1px;
          height: 30px;
          background: #444;
          margin: 0 10px;
        }
        @media (max-width: 768px) {
          .toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .separator {
            display: none;
          }
          .control-group {
            flex-wrap: wrap;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🖥️ Remote Desktop</h1>
        <div class="header-buttons">
          <a href="/" class="btn">Back to Dashboard</a>
        </div>
      </div>
      
      <div class="toolbar">
        <div class="control-group">
          <label for="vnc-host">Host:</label>
          <input type="text" id="vnc-host" value="${vncConfig.host}" placeholder="localhost" style="width: 120px;">
        </div>
        <div class="control-group">
          <label for="vnc-port">Port:</label>
          <input type="number" id="vnc-port" value="${vncConfig.port}" placeholder="5900" style="width: 80px;">
        </div>
        <div class="control-group">
          <label for="vnc-password">Password:</label>
          <input type="password" id="vnc-password" placeholder="VNC Password (if any)" style="width: 150px;">
        </div>
        
        <div class="separator"></div>
        
        <div class="control-group">
          <button id="connect-btn" class="btn btn-success" onclick="connectVNC()">Connect</button>
          <button id="disconnect-btn" class="btn btn-danger" onclick="disconnectVNC()" style="display: none;">Disconnect</button>
          <span id="status" class="status disconnected">Disconnected</span>
        </div>
        
        <div class="separator"></div>
        
        <div class="control-group">
          <label for="scale-mode">Scale:</label>
          <select id="scale-mode" onchange="updateScaling()">
            <option value="remote">Remote Resize</option>
            <option value="local" selected>Local Scaling</option>
            <option value="none">None</option>
          </select>
        </div>
        <div class="control-group">
          <label>
            <input type="checkbox" id="view-only" onchange="updateViewOnly()"> View Only
          </label>
        </div>
      </div>
      
      <div class="vnc-container" id="vnc-container">
        <div class="placeholder" id="placeholder">
          <h2>🖥️ Remote Desktop Control</h2>
          <p>Connect to a VNC server to view and control a remote desktop.</p>
          <p>Enter the VNC server host, port, and password (if required), then click Connect.</p>
          <p style="margin-top: 20px; color: #888;">
            <strong>Tip:</strong> Make sure a VNC server (like x11vnc, TigerVNC, or RealVNC) is running on the target machine.
          </p>
        </div>
        <div id="vnc-screen" style="display: none;"></div>
        <button class="btn fullscreen-btn" onclick="toggleFullscreen()" id="fullscreen-btn" style="display: none;">⛶ Fullscreen</button>
      </div>
      
      <div class="info-panel">
        <strong>How to set up VNC:</strong> 
        Install a VNC server on your target machine (e.g., <code>sudo apt install x11vnc</code>), 
        then start it with <code>x11vnc -display :0 -forever -shared</code>. 
        See <a href="/headless-setup" style="color: #667eea;">HEADLESS.md</a> for detailed instructions.
        | <strong>Keyboard shortcuts:</strong> Ctrl+Alt+Del, Send clipboard, etc. work when connected.
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        let rfb = null;
        let socket = null;
        
        // Status management
        function setStatus(status, text) {
          const statusEl = document.getElementById('status');
          statusEl.className = 'status ' + status;
          statusEl.textContent = text;
        }
        
        // Connect to VNC
        function connectVNC() {
          const host = document.getElementById('vnc-host').value || 'localhost';
          const port = parseInt(document.getElementById('vnc-port').value) || 5900;
          const password = document.getElementById('vnc-password').value || '';
          
          setStatus('connecting', 'Connecting...');
          
          // Initialize socket connection for VNC proxy
          socket = io();
          
          socket.emit('vnc-connect', { host, port, password });
          
          socket.on('vnc-connected', () => {
            setStatus('connected', 'Connected');
            document.getElementById('connect-btn').style.display = 'none';
            document.getElementById('disconnect-btn').style.display = 'inline-block';
            document.getElementById('placeholder').style.display = 'none';
            document.getElementById('vnc-screen').style.display = 'block';
            document.getElementById('fullscreen-btn').style.display = 'block';
            initVNCCanvas();
          });
          
          socket.on('vnc-frame', (data) => {
            updateVNCFrame(data);
          });
          
          socket.on('vnc-error', (error) => {
            setStatus('disconnected', 'Error: ' + error);
            alert('VNC Error: ' + error);
            disconnectVNC();
          });
          
          socket.on('vnc-disconnected', () => {
            setStatus('disconnected', 'Disconnected');
            cleanupVNC();
          });
        }
        
        // Disconnect from VNC
        function disconnectVNC() {
          if (socket) {
            socket.emit('vnc-disconnect');
            socket.disconnect();
            socket = null;
          }
          cleanupVNC();
        }
        
        function cleanupVNC() {
          document.getElementById('connect-btn').style.display = 'inline-block';
          document.getElementById('disconnect-btn').style.display = 'none';
          document.getElementById('placeholder').style.display = 'block';
          document.getElementById('vnc-screen').style.display = 'none';
          document.getElementById('fullscreen-btn').style.display = 'none';
          setStatus('disconnected', 'Disconnected');
        }
        
        // VNC Canvas handling
        let vncCanvas = null;
        let vncCtx = null;
        let screenWidth = 1920;
        let screenHeight = 1080;
        
        function initVNCCanvas() {
          const container = document.getElementById('vnc-screen');
          container.innerHTML = '<canvas id="vnc-canvas"></canvas>';
          vncCanvas = document.getElementById('vnc-canvas');
          vncCtx = vncCanvas.getContext('2d');
          
          vncCanvas.width = screenWidth;
          vncCanvas.height = screenHeight;
          vncCanvas.style.background = '#000';
          
          // Add event listeners for mouse and keyboard
          vncCanvas.addEventListener('mousedown', handleMouseDown);
          vncCanvas.addEventListener('mouseup', handleMouseUp);
          vncCanvas.addEventListener('mousemove', handleMouseMove);
          vncCanvas.addEventListener('wheel', handleWheel);
          vncCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
          
          // Keyboard events
          vncCanvas.tabIndex = 1;
          vncCanvas.addEventListener('keydown', handleKeyDown);
          vncCanvas.addEventListener('keyup', handleKeyUp);
          vncCanvas.focus();
          
          updateScaling();
        }
        
        function updateVNCFrame(data) {
          if (!vncCanvas || !vncCtx) return;
          
          if (data.width && data.height && !data.imageData) {
            screenWidth = data.width;
            screenHeight = data.height;
            vncCanvas.width = screenWidth;
            vncCanvas.height = screenHeight;
            updateScaling();
            return;
          }
          
          if (data.imageData && data.format === 'raw32') {
            // Decode base64 raw pixel data
            const binaryStr = atob(data.imageData);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            
            // Create ImageData from raw pixels (BGRA -> RGBA)
            const imageData = vncCtx.createImageData(data.w, data.h);
            for (let i = 0; i < bytes.length; i += 4) {
              const j = i;
              imageData.data[j] = bytes[i + 2];     // R (from B)
              imageData.data[j + 1] = bytes[i + 1]; // G
              imageData.data[j + 2] = bytes[i];     // B (from R)
              imageData.data[j + 3] = 255;          // A
            }
            
            vncCtx.putImageData(imageData, data.x, data.y);
          } else if (data.imageData) {
            const img = new Image();
            img.onload = () => {
              vncCtx.drawImage(img, data.x || 0, data.y || 0);
            };
            img.src = 'data:image/png;base64,' + data.imageData;
          }
        }
        
        // Input handlers
        function getMousePos(e) {
          const rect = vncCanvas.getBoundingClientRect();
          const scaleX = screenWidth / rect.width;
          const scaleY = screenHeight / rect.height;
          return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY)
          };
        }
        
        function handleMouseDown(e) {
          if (!socket || document.getElementById('view-only').checked) return;
          const pos = getMousePos(e);
          socket.emit('vnc-mouse', { type: 'down', x: pos.x, y: pos.y, button: e.button });
        }
        
        function handleMouseUp(e) {
          if (!socket || document.getElementById('view-only').checked) return;
          const pos = getMousePos(e);
          socket.emit('vnc-mouse', { type: 'up', x: pos.x, y: pos.y, button: e.button });
        }
        
        function handleMouseMove(e) {
          if (!socket || document.getElementById('view-only').checked) return;
          const pos = getMousePos(e);
          socket.emit('vnc-mouse', { type: 'move', x: pos.x, y: pos.y });
        }
        
        function handleWheel(e) {
          if (!socket || document.getElementById('view-only').checked) return;
          e.preventDefault();
          const pos = getMousePos(e);
          socket.emit('vnc-mouse', { type: 'wheel', x: pos.x, y: pos.y, deltaX: e.deltaX, deltaY: e.deltaY });
        }
        
        function handleKeyDown(e) {
          if (!socket || document.getElementById('view-only').checked) return;
          e.preventDefault();
          socket.emit('vnc-key', { type: 'down', key: e.key, keyCode: e.keyCode, code: e.code });
        }
        
        function handleKeyUp(e) {
          if (!socket || document.getElementById('view-only').checked) return;
          e.preventDefault();
          socket.emit('vnc-key', { type: 'up', key: e.key, keyCode: e.keyCode, code: e.code });
        }
        
        // Scaling
        function updateScaling() {
          if (!vncCanvas) return;
          const mode = document.getElementById('scale-mode').value;
          const container = document.getElementById('vnc-container');
          
          switch (mode) {
            case 'local':
              vncCanvas.style.maxWidth = '100%';
              vncCanvas.style.maxHeight = '100%';
              vncCanvas.style.width = 'auto';
              vncCanvas.style.height = 'auto';
              break;
            case 'remote':
              // Request server to resize
              if (socket) {
                socket.emit('vnc-resize', { 
                  width: container.clientWidth, 
                  height: container.clientHeight 
                });
              }
              break;
            case 'none':
              vncCanvas.style.maxWidth = 'none';
              vncCanvas.style.maxHeight = 'none';
              vncCanvas.style.width = screenWidth + 'px';
              vncCanvas.style.height = screenHeight + 'px';
              break;
          }
        }
        
        function updateViewOnly() {
          // View only is handled client-side by ignoring input events
        }
        
        // Fullscreen
        function toggleFullscreen() {
          const container = document.getElementById('vnc-container');
          if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => {
              alert('Fullscreen error: ' + err.message);
            });
          } else {
            document.exitFullscreen();
          }
        }
        
        // Handle window resize
        window.addEventListener('resize', () => {
          updateScaling();
        });
        
        // Save settings on change
        document.getElementById('vnc-host').addEventListener('change', saveSettings);
        document.getElementById('vnc-port').addEventListener('change', saveSettings);
        
        function saveSettings() {
          const host = document.getElementById('vnc-host').value;
          const port = document.getElementById('vnc-port').value;
          fetch('/api/remote-desktop-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host, port: parseInt(port) })
          });
        }
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
    
    const os = require('os');
    const userServiceDir = path.join(os.homedir(), '.config', 'systemd', 'user');
    const serviceName = 'proxy-server.service';
    const serviceFile = path.join(userServiceDir, serviceName);
    
    // Create user systemd directory if it doesn't exist
    if (!fs.existsSync(userServiceDir)) {
      fs.mkdirSync(userServiceDir, { recursive: true });
    }
    
    if (enabled) {
      // Create the service file
      const nodeExec = process.execPath;
      const serverPath = path.join(__dirname, 'server.js');
      
      const serviceContent = `[Unit]
Description=Hosted Proxy Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${__dirname}
ExecStart=${nodeExec} ${serverPath}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
`;
      
      fs.writeFileSync(serviceFile, serviceContent);
      
      // Enable and start the service using systemctl --user
      exec('systemctl --user daemon-reload', (reloadError) => {
        if (reloadError) {
          console.error('Error reloading systemd:', reloadError);
          return res.json({ success: false, error: 'Failed to reload systemd daemon.' });
        }
        
        exec('systemctl --user enable proxy-server.service', (enableError) => {
          if (enableError) {
            console.error('Error enabling service:', enableError);
            return res.json({ success: false, error: 'Failed to enable service: ' + enableError.message });
          }
          
          res.json({ success: true, message: 'Service enabled. It will start automatically on next login.' });
        });
      });
    } else {
      // Disable the service
      exec('systemctl --user disable proxy-server.service', (error, stdout, stderr) => {
        if (error) {
          console.error('Error disabling service:', error);
          return res.json({ success: false, error: 'Failed to disable service: ' + error.message });
        }
        
        // Optionally remove the service file
        if (fs.existsSync(serviceFile)) {
          fs.unlinkSync(serviceFile);
        }
        
        exec('systemctl --user daemon-reload', () => {
          res.json({ success: true, message: 'Service disabled successfully.' });
        });
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
  const { name, port, path, icon } = req.body;
  
  try {
    if (!name || !port || !path) {
      return res.json({ success: false, error: 'Name, port, and path are required' });
    }
    
    // Check if path already exists
    if (config.apps.some(app => app.path === path)) {
      return res.json({ success: false, error: 'Path already exists' });
    }
    
    const newApp = { name, port: parseInt(port), path };
    if (icon) {
      newApp.icon = icon;
    }
    config.apps.push(newApp);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: 'App added. Please restart the server for changes to take effect.' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.put('/api/apps/:path', requireAuth, async (req, res) => {
  const oldPath = decodeURIComponent(req.params.path);
  const { name, port, path: newPath, icon } = req.body;
  
  try {
    const appIndex = config.apps.findIndex(app => app.path === oldPath);
    
    if (appIndex === -1) {
      return res.json({ success: false, error: 'App not found' });
    }
    
    // Check if new path conflicts with another app
    if (newPath !== oldPath && config.apps.some(app => app.path === newPath)) {
      return res.json({ success: false, error: 'Path already exists' });
    }
    
    const updatedApp = { name, port: parseInt(port), path: newPath };
    if (icon) {
      updatedApp.icon = icon;
    }
    config.apps[appIndex] = updatedApp;
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

// File upload endpoint for icons
app.post('/api/upload-icon', requireAuth, upload.single('icon'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const iconPath = `/uploads/${req.file.filename}`;
    res.json({ success: true, iconPath: iconPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remote desktop settings API
app.post('/api/remote-desktop-settings', requireAuth, async (req, res) => {
  const { host, port } = req.body;
  
  try {
    if (!config.remoteDesktop) {
      config.remoteDesktop = {};
    }
    config.remoteDesktop.host = host || 'localhost';
    config.remoteDesktop.port = parseInt(port) || 5900;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    res.json({ success: true, message: 'Remote desktop settings saved.' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.get('/api/remote-desktop-settings', requireAuth, (req, res) => {
  const settings = config.remoteDesktop || { host: 'localhost', port: 5900 };
  res.json({ success: true, settings });
});

// App viewer page
app.get('/viewer', requireAuth, (req, res) => {
  const appPath = req.query.app;
  
  if (!appPath) {
    return res.redirect('/');
  }
  
  const app = config.apps.find(a => a.path === appPath);
  
  if (!app) {
    return res.redirect('/');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${app.name} - Proxy Server</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #f5f5f5;
          transition: background 0.3s ease;
        }
        body.dark-mode {
          background: #1a1a2e;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header h1 {
          margin: 0;
          font-size: 20px;
        }
        .header-buttons {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .btn {
          padding: 8px 16px;
          background: rgba(255,255,255,0.2);
          color: white;
          text-decoration: none;
          border-radius: 5px;
          border: 1px solid rgba(255,255,255,0.3);
          transition: background 0.3s ease;
        }
        .btn:hover {
          background: rgba(255,255,255,0.3);
        }
        .dark-mode-toggle {
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.3s ease;
          padding: 0;
        }
        .dark-mode-toggle:hover {
          background: rgba(255,255,255,0.3);
        }
        .iframe-container {
          flex: 1;
          display: flex;
          overflow: hidden;
        }
        iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${app.name}</h1>
        <div class="header-buttons">
          <button class="dark-mode-toggle" onclick="toggleDarkMode()" aria-label="Toggle dark mode">🌙</button>
          <a href="/" class="btn">Back to Dashboard</a>
        </div>
      </div>
      <div class="iframe-container">
        <iframe src="${app.path}" title="${app.name}"></iframe>
      </div>
      <script>
        // Dark mode functionality
        function toggleDarkMode() {
          document.body.classList.toggle('dark-mode');
          const isDark = document.body.classList.contains('dark-mode');
          localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
          document.querySelector('.dark-mode-toggle').textContent = isDark ? '☀️' : '🌙';
        }
        
        // Load dark mode preference
        if (localStorage.getItem('darkMode') === 'enabled') {
          document.body.classList.add('dark-mode');
          document.querySelector('.dark-mode-toggle').textContent = '☀️';
        }
      </script>
    </body>
    </html>
  `);
});

// Setup proxy for each app
config.apps.forEach(appConfig => {
  app.use(appConfig.path, requireAuth, createProxyMiddleware({
    target: `http://${config.hostname || 'localhost'}:${appConfig.port}`,
    changeOrigin: true,
    pathRewrite: {
      [`^${appConfig.path}`]: '',
    },
    on: {
      error: (err, req, res) => {
        console.error(`Proxy error for ${appConfig.path}:`, err.message);
        res.status(500).send(`
          <html>
            <head>
              <title>Proxy Error</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
                .error-container { background: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; }
                h1 { color: #dc3545; }
                .details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; font-family: monospace; }
                .btn { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
              </style>
            </head>
            <body>
              <div class="error-container">
                <h1>Proxy Error</h1>
                <p>Unable to connect to the application at <strong>${config.hostname || 'localhost'}:${appConfig.port}</strong></p>
                <div class="details">
                  <strong>Error:</strong> ${err.message}<br>
                  <strong>Target:</strong> http://${config.hostname || 'localhost'}:${appConfig.port}<br>
                  <strong>Path:</strong> ${appConfig.path}
                </div>
                <p>Please ensure:</p>
                <ul>
                  <li>The application is running on port ${appConfig.port} on ${config.hostname || 'localhost'}</li>
                  <li>The port number is correct in the configuration</li>
                  <li>The application is accessible from ${config.hostname || 'localhost'}</li>
                </ul>
                <a href="/" class="btn">Back to Dashboard</a>
              </div>
            </body>
          </html>
        `);
      },
    },
  }));
});

// Terminal and VNC socket.io setup
io.on('connection', (socket) => {
  let ptyProcess = null;
  let vncSocket = null;

  // Terminal handlers
  socket.on('start-terminal', () => {
    if (ptyProcess) {
      return;
    }

    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const env = { ...process.env };
    // Disable bracketed paste mode and other interactive features
    env.TERM = 'dumb';
    
    ptyProcess = pty.spawn(shell, [], {
      name: 'dumb',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME || process.env.USERPROFILE,
      env: env
    });

    ptyProcess.on('data', (data) => {
      socket.emit('terminal-output', data);
    });

    socket.on('terminal-input', (data) => {
      if (ptyProcess) {
        ptyProcess.write(data);
      }
    });

    socket.on('terminal-resize', (size) => {
      if (ptyProcess) {
        ptyProcess.resize(size.cols, size.rows);
      }
    });
  });

  // VNC handlers
  socket.on('vnc-connect', (data) => {
    const { host, port, password } = data;
    
    // Validate host to prevent SSRF - only allow localhost, local IPs, or hostnames
    const allowedHostPattern = /^(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}|[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)*)$/;
    if (!allowedHostPattern.test(host)) {
      socket.emit('vnc-error', 'Invalid host address');
      return;
    }
    
    // Validate port range
    const vncPort = parseInt(port) || 5900;
    if (vncPort < 1 || vncPort > 65535) {
      socket.emit('vnc-error', 'Invalid port number');
      return;
    }
    
    if (vncSocket) {
      vncSocket.destroy();
      vncSocket = null;
    }
    
    try {
      vncSocket = net.createConnection({ host, port: vncPort }, () => {
        console.log('VNC connection established to ' + host + ':' + vncPort);
        socket.emit('vnc-connected');
      });
      
      // Handle VNC data
      let vncBuffer = Buffer.alloc(0);
      let vncState = 'handshake';
      let vncVersion = '';
      let securityTypes = [];
      let framebufferWidth = 0;
      let framebufferHeight = 0;
      
      vncSocket.on('data', (data) => {
        vncBuffer = Buffer.concat([vncBuffer, data]);
        processVNCData();
      });
      
      function processVNCData() {
        while (vncBuffer.length > 0) {
          if (vncState === 'handshake') {
            // Wait for server version (12 bytes)
            if (vncBuffer.length >= 12) {
              vncVersion = vncBuffer.slice(0, 12).toString();
              console.log('VNC Server version:', vncVersion.trim());
              vncBuffer = vncBuffer.slice(12);
              
              // Send client version (RFB 003.008)
              vncSocket.write('RFB 003.008\\n');
              vncState = 'security';
            } else {
              break;
            }
          } else if (vncState === 'security') {
            // Number of security types (1 byte) followed by type bytes
            if (vncBuffer.length >= 1) {
              const numTypes = vncBuffer[0];
              if (vncBuffer.length >= 1 + numTypes) {
                securityTypes = Array.from(vncBuffer.slice(1, 1 + numTypes));
                console.log('Security types:', securityTypes);
                vncBuffer = vncBuffer.slice(1 + numTypes);
                
                // Choose security type (prefer None=1, or VNC Auth=2)
                if (securityTypes.includes(1)) {
                  // No authentication
                  vncSocket.write(Buffer.from([1]));
                  vncState = 'security-result';
                } else if (securityTypes.includes(2)) {
                  // VNC authentication
                  vncSocket.write(Buffer.from([2]));
                  vncState = 'vnc-auth-challenge';
                } else {
                  socket.emit('vnc-error', 'No supported security type');
                  vncSocket.destroy();
                  return;
                }
              } else {
                break;
              }
            } else {
              break;
            }
          } else if (vncState === 'vnc-auth-challenge') {
            // 16-byte challenge
            if (vncBuffer.length >= 16) {
              const challenge = vncBuffer.slice(0, 16);
              vncBuffer = vncBuffer.slice(16);
              
              // Simple DES encryption of password with challenge
              // For now, send empty response (will fail without proper password)
              const response = encryptVNCPassword(password || '', challenge);
              vncSocket.write(response);
              vncState = 'security-result';
            } else {
              break;
            }
          } else if (vncState === 'security-result') {
            // Security result (4 bytes)
            if (vncBuffer.length >= 4) {
              const result = vncBuffer.readUInt32BE(0);
              vncBuffer = vncBuffer.slice(4);
              
              if (result === 0) {
                console.log('VNC authentication successful');
                // Send ClientInit (shared flag = 1)
                vncSocket.write(Buffer.from([1]));
                vncState = 'server-init';
              } else {
                socket.emit('vnc-error', 'Authentication failed');
                vncSocket.destroy();
                return;
              }
            } else {
              break;
            }
          } else if (vncState === 'server-init') {
            // ServerInit message (at least 24 bytes + name)
            if (vncBuffer.length >= 24) {
              framebufferWidth = vncBuffer.readUInt16BE(0);
              framebufferHeight = vncBuffer.readUInt16BE(2);
              const nameLength = vncBuffer.readUInt32BE(20);
              
              if (vncBuffer.length >= 24 + nameLength) {
                const serverName = vncBuffer.slice(24, 24 + nameLength).toString();
                console.log('VNC Server:', serverName, framebufferWidth + 'x' + framebufferHeight);
                vncBuffer = vncBuffer.slice(24 + nameLength);
                
                // Send frame info to client
                socket.emit('vnc-frame', {
                  width: framebufferWidth,
                  height: framebufferHeight,
                  serverName: serverName
                });
                
                // Set pixel format (32-bit true color)
                const setPixelFormat = Buffer.alloc(20);
                setPixelFormat[0] = 0; // SetPixelFormat
                setPixelFormat[4] = 32; // bits per pixel
                setPixelFormat[5] = 24; // depth
                setPixelFormat[6] = 0;  // big-endian
                setPixelFormat[7] = 1;  // true color
                setPixelFormat.writeUInt16BE(255, 8);  // red-max
                setPixelFormat.writeUInt16BE(255, 10); // green-max
                setPixelFormat.writeUInt16BE(255, 12); // blue-max
                setPixelFormat[14] = 16; // red-shift
                setPixelFormat[15] = 8;  // green-shift
                setPixelFormat[16] = 0;  // blue-shift
                vncSocket.write(setPixelFormat);
                
                // Set encodings
                const setEncodings = Buffer.alloc(8);
                setEncodings[0] = 2; // SetEncodings
                setEncodings.writeUInt16BE(1, 2); // number of encodings
                setEncodings.writeInt32BE(0, 4);  // Raw encoding
                vncSocket.write(setEncodings);
                
                // Request framebuffer update
                requestFramebufferUpdate(true);
                
                vncState = 'connected';
              } else {
                break;
              }
            } else {
              break;
            }
          } else if (vncState === 'connected') {
            // Process server messages
            if (vncBuffer.length >= 1) {
              const msgType = vncBuffer[0];
              
              if (msgType === 0) {
                // FramebufferUpdate
                if (vncBuffer.length >= 4) {
                  const numRects = vncBuffer.readUInt16BE(2);
                  let offset = 4;
                  let processed = 0;
                  
                  for (let i = 0; i < numRects && offset + 12 <= vncBuffer.length; i++) {
                    const x = vncBuffer.readUInt16BE(offset);
                    const y = vncBuffer.readUInt16BE(offset + 2);
                    const w = vncBuffer.readUInt16BE(offset + 4);
                    const h = vncBuffer.readUInt16BE(offset + 6);
                    const encoding = vncBuffer.readInt32BE(offset + 8);
                    offset += 12;
                    
                    if (encoding === 0) {
                      // Raw encoding
                      const dataSize = w * h * 4; // 32-bit
                      if (offset + dataSize <= vncBuffer.length) {
                        const pixelData = vncBuffer.slice(offset, offset + dataSize);
                        offset += dataSize;
                        processed++;
                        
                        // Convert to PNG and send to client
                        sendFrameToClient(x, y, w, h, pixelData);
                      } else {
                        // Not enough data yet
                        break;
                      }
                    }
                  }
                  
                  if (processed === numRects) {
                    vncBuffer = vncBuffer.slice(offset);
                    // Request next update
                    setTimeout(() => requestFramebufferUpdate(false), 33); // ~30 FPS
                  } else {
                    // Wait for more data
                    break;
                  }
                } else {
                  break;
                }
              } else if (msgType === 1) {
                // SetColourMapEntries - skip
                if (vncBuffer.length >= 6) {
                  const numColors = vncBuffer.readUInt16BE(4);
                  const totalSize = 6 + numColors * 6;
                  if (vncBuffer.length >= totalSize) {
                    vncBuffer = vncBuffer.slice(totalSize);
                  } else {
                    break;
                  }
                } else {
                  break;
                }
              } else if (msgType === 2) {
                // Bell
                vncBuffer = vncBuffer.slice(1);
                socket.emit('vnc-bell');
              } else if (msgType === 3) {
                // ServerCutText
                if (vncBuffer.length >= 8) {
                  const textLength = vncBuffer.readUInt32BE(4);
                  if (vncBuffer.length >= 8 + textLength) {
                    const text = vncBuffer.slice(8, 8 + textLength).toString();
                    vncBuffer = vncBuffer.slice(8 + textLength);
                    socket.emit('vnc-clipboard', text);
                  } else {
                    break;
                  }
                } else {
                  break;
                }
              } else {
                // Unknown message type
                console.log('Unknown VNC message type:', msgType);
                vncBuffer = vncBuffer.slice(1);
              }
            } else {
              break;
            }
          }
        }
      }
      
      function requestFramebufferUpdate(incremental) {
        if (!vncSocket || vncSocket.destroyed) return;
        const request = Buffer.alloc(10);
        request[0] = 3; // FramebufferUpdateRequest
        request[1] = incremental ? 1 : 0;
        request.writeUInt16BE(0, 2);
        request.writeUInt16BE(0, 4);
        request.writeUInt16BE(framebufferWidth, 6);
        request.writeUInt16BE(framebufferHeight, 8);
        vncSocket.write(request);
      }
      
      function sendFrameToClient(x, y, w, h, pixelData) {
        // Create a simple bitmap representation
        // For efficiency, we'll send raw pixel data as base64
        // The client can render this on a canvas
        const imageData = pixelData.toString('base64');
        socket.emit('vnc-frame', {
          x, y, w, h,
          imageData,
          format: 'raw32'
        });
      }
      
      vncSocket.on('error', (err) => {
        console.error('VNC connection error:', err.message);
        socket.emit('vnc-error', err.message);
      });
      
      vncSocket.on('close', () => {
        console.log('VNC connection closed');
        socket.emit('vnc-disconnected');
        vncSocket = null;
      });
      
    } catch (err) {
      socket.emit('vnc-error', 'Failed to connect: ' + err.message);
    }
  });
  
  // Handle mouse events from client
  socket.on('vnc-mouse', (data) => {
    if (!vncSocket || vncSocket.destroyed) return;
    
    const { type, x, y, button, deltaY } = data;
    
    // PointerEvent message
    const msg = Buffer.alloc(6);
    msg[0] = 5; // PointerEvent
    
    // Button mask
    let buttonMask = 0;
    if (type === 'down' || type === 'move') {
      if (button === 0) buttonMask |= 1; // Left
      if (button === 1) buttonMask |= 2; // Middle  
      if (button === 2) buttonMask |= 4; // Right
    }
    if (type === 'wheel') {
      // Scroll wheel
      buttonMask |= deltaY < 0 ? 8 : 16;
    }
    
    msg[1] = buttonMask;
    msg.writeUInt16BE(x, 2);
    msg.writeUInt16BE(y, 4);
    vncSocket.write(msg);
  });
  
  // Handle keyboard events from client
  socket.on('vnc-key', (data) => {
    if (!vncSocket || vncSocket.destroyed) return;
    
    const { type, key, keyCode, code } = data;
    
    // KeyEvent message
    const msg = Buffer.alloc(8);
    msg[0] = 4; // KeyEvent
    msg[1] = type === 'down' ? 1 : 0; // down-flag
    
    // Convert JS key to X11 keysym
    const keysym = jsKeyToKeysym(key, keyCode, code);
    msg.writeUInt32BE(keysym, 4);
    vncSocket.write(msg);
  });
  
  socket.on('vnc-disconnect', () => {
    if (vncSocket) {
      vncSocket.destroy();
      vncSocket = null;
    }
  });

  socket.on('disconnect', () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
    if (vncSocket) {
      vncSocket.destroy();
      vncSocket = null;
    }
  });
});

// VNC DES password encryption helper
function encryptVNCPassword(password, challenge) {
  // VNC uses a modified DES encryption
  // For simplicity, this is a placeholder - real implementation would use DES
  // Most VNC servers support "None" authentication which doesn't need this
  const crypto = require('crypto');
  
  // Pad or truncate password to 8 bytes
  let key = Buffer.alloc(8);
  const pwdBytes = Buffer.from(password, 'ascii');
  for (let i = 0; i < 8; i++) {
    key[i] = i < pwdBytes.length ? pwdBytes[i] : 0;
  }
  
  // Reverse bits in each byte (VNC quirk)
  for (let i = 0; i < 8; i++) {
    let b = key[i];
    key[i] = ((b * 0x0202020202 & 0x010884422010) % 1023);
  }
  
  try {
    const cipher = crypto.createCipheriv('des-ecb', key, null);
    cipher.setAutoPadding(false);
    const encrypted1 = cipher.update(challenge.slice(0, 8));
    const encrypted2 = cipher.update(challenge.slice(8, 16));
    return Buffer.concat([encrypted1, encrypted2]);
  } catch (e) {
    // Return challenge as-is if encryption fails
    return challenge;
  }
}

// Convert JavaScript key to X11 keysym
function jsKeyToKeysym(key, keyCode, code) {
  // Common key mappings
  const keyMap = {
    'Backspace': 0xff08,
    'Tab': 0xff09,
    'Enter': 0xff0d,
    'Escape': 0xff1b,
    'Delete': 0xffff,
    'Home': 0xff50,
    'End': 0xff57,
    'PageUp': 0xff55,
    'PageDown': 0xff56,
    'ArrowLeft': 0xff51,
    'ArrowUp': 0xff52,
    'ArrowRight': 0xff53,
    'ArrowDown': 0xff54,
    'Insert': 0xff63,
    'F1': 0xffbe,
    'F2': 0xffbf,
    'F3': 0xffc0,
    'F4': 0xffc1,
    'F5': 0xffc2,
    'F6': 0xffc3,
    'F7': 0xffc4,
    'F8': 0xffc5,
    'F9': 0xffc6,
    'F10': 0xffc7,
    'F11': 0xffc8,
    'F12': 0xffc9,
    'Shift': 0xffe1,
    'Control': 0xffe3,
    'Alt': 0xffe9,
    'Meta': 0xffeb,
    ' ': 0x0020,
  };
  
  if (keyMap[key]) {
    return keyMap[key];
  }
  
  // For printable characters, use their char code
  if (key.length === 1) {
    return key.charCodeAt(0);
  }
  
  // Default to keyCode
  return keyCode || 0;
}

// Start server
const PORT = config.port || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server running on http://0.0.0.0:${PORT}`);
  console.log(`Accessible on network via http://<hostname>:${PORT}`);
  console.log(`Default credentials: username='admin', password='admin'`);
});
