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
app.use('/novnc-core', express.static(path.join(__dirname, 'novnc-core')));
app.use('/vendor', express.static(path.join(__dirname, 'novnc-vendor')));
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
          cursor: pointer;
          font-size: 14px;
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
        .vnc-container {
          flex: 1;
          display: flex;
          overflow: hidden;
          position: relative;
          background: #000;
        }
        #vnc-screen {
          flex: 1;
        }
        .status-bar {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.7);
          color: white;
          padding: 8px 16px;
          border-radius: 5px;
          font-size: 14px;
          z-index: 1000;
          display: none;
        }
        .status-bar.show {
          display: block;
        }
        .status-bar.error {
          background: rgba(220, 53, 69, 0.9);
        }
        .status-bar.success {
          background: rgba(40, 167, 69, 0.9);
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${app.name}</h1>
        <div class="header-buttons">
          <button class="btn" onclick="connectVNC()" id="connectBtn">Connect</button>
          <button class="btn" onclick="disconnectVNC()" id="disconnectBtn" style="display:none;">Disconnect</button>
          <button class="dark-mode-toggle" onclick="toggleDarkMode()" aria-label="Toggle dark mode">🌙</button>
          <a href="/" class="btn">Back to Dashboard</a>
        </div>
      </div>
      <div class="vnc-container">
        <div id="status-bar" class="status-bar"></div>
        <div id="vnc-screen"></div>
      </div>
      <script type="module">
        // Import noVNC RFB class from local core files
        import RFB from '/novnc-core/rfb.js';

        let rfb = null;
        
        window.connectVNC = function() {
          const host = '${config.hostname || 'localhost'}';
          const port = ${app.port};
          const url = \`ws://\${host}:\${port}\`;
          
          showStatus('Connecting to VNC server...', 'info');
          
          try {
            rfb = new RFB(document.getElementById('vnc-screen'), url);
            
            rfb.addEventListener('connect', () => {
              showStatus('Connected successfully', 'success');
              setTimeout(hideStatus, 2000);
              document.getElementById('connectBtn').style.display = 'none';
              document.getElementById('disconnectBtn').style.display = 'inline-block';
            });
            
            rfb.addEventListener('disconnect', () => {
              showStatus('Disconnected from VNC server', 'info');
              rfb = null;
              document.getElementById('connectBtn').style.display = 'inline-block';
              document.getElementById('disconnectBtn').style.display = 'none';
            });
            
            rfb.addEventListener('credentialsrequired', () => {
              const password = prompt('VNC Password:');
              if (password) {
                rfb.sendCredentials({ password: password });
              }
            });
            
            rfb.scaleViewport = true;
            rfb.resizeSession = true;
          } catch (err) {
            showStatus('Error: ' + err.message, 'error');
            console.error('VNC connection error:', err);
          }
        };
        
        window.disconnectVNC = function() {
          if (rfb) {
            rfb.disconnect();
          }
        };
        
        function showStatus(message, type) {
          const statusBar = document.getElementById('status-bar');
          statusBar.textContent = message;
          statusBar.className = 'status-bar show ' + type;
        }
        
        function hideStatus() {
          const statusBar = document.getElementById('status-bar');
          statusBar.className = 'status-bar';
        }
        
        // Dark mode functionality
        window.toggleDarkMode = function() {
          document.body.classList.toggle('dark-mode');
          const isDark = document.body.classList.contains('dark-mode');
          localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
          document.querySelector('.dark-mode-toggle').textContent = isDark ? '☀️' : '🌙';
        };
        
        // Load dark mode preference
        if (localStorage.getItem('darkMode') === 'enabled') {
          document.body.classList.add('dark-mode');
          document.querySelector('.dark-mode-toggle').textContent = '☀️';
        }
        
        // Auto-connect on page load
        window.addEventListener('load', () => {
          connectVNC();
        });
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

// Terminal socket.io setup
io.on('connection', (socket) => {
  let ptyProcess = null;

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

  socket.on('disconnect', () => {
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
  });
});

// VNC WebSocket proxy setup
const net = require('net');

io.of('/vnc').on('connection', (socket) => {
  let vncSocket = null;

  socket.on('vnc-connect', (data) => {
    const { host, port } = data;
    
    // Validate host and port
    if (!host || !port) {
      socket.emit('vnc-error', { message: 'Invalid host or port' });
      return;
    }

    // Connect to VNC server
    vncSocket = net.createConnection(port, host);

    vncSocket.on('connect', () => {
      socket.emit('vnc-connected');
    });

    vncSocket.on('data', (data) => {
      // Send VNC data to browser via WebSocket
      socket.emit('vnc-data', Array.from(data));
    });

    vncSocket.on('error', (err) => {
      socket.emit('vnc-error', { message: err.message });
    });

    vncSocket.on('close', () => {
      socket.emit('vnc-disconnected');
      if (vncSocket) {
        vncSocket.destroy();
        vncSocket = null;
      }
    });
  });

  socket.on('vnc-data', (data) => {
    if (vncSocket && vncSocket.writable) {
      vncSocket.write(Buffer.from(data));
    }
  });

  socket.on('disconnect', () => {
    if (vncSocket) {
      vncSocket.destroy();
      vncSocket = null;
    }
  });
});

// Start server
const PORT = config.port || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server running on http://0.0.0.0:${PORT}`);
  console.log(`Accessible on network via http://<hostname>:${PORT}`);
  console.log(`Default credentials: username='admin', password='admin'`);
});
