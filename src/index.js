const http = require('http');
const fs = require('fs');
const path = require('path');
const apiHandler = require('./routes/api');

// Simple dotenv polyfill
try {
    const envData = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
    envData.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            process.env[match[1]] = match[2];
        }
    });
} catch (e) {
    // Ignore if not present
}

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    if (req.url.startsWith('/api')) {
        return apiHandler(req, res);
    }

    // Serve static files
    let reqUrl = req.url.split('?')[0]; // Remove query params
    let filePath = path.join(__dirname, '../public', reqUrl === '/' ? 'index.html' : reqUrl);
    
    // Simplistic SPA catch-all (if not found in public, try index.html)
    if (!fs.existsSync(filePath)) {
         filePath = path.join(__dirname, '../public/index.html');
    }

    try {
        const extname = path.extname(filePath);
        let contentType = MIME_TYPES[extname] || 'application/octet-stream';
        
        // Just verify if it's a file
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
            contentType = 'text/html';
        }
        
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
    } catch (err) {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`-----------------------------------------------------`);
    console.log(`SUCCESS! Vanilla Node Server running on http://localhost:${PORT}`);
    console.log(`NO NPM PACKAGES RQUIRED!`);
    console.log(`-----------------------------------------------------`);
});
