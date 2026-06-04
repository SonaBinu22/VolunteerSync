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

// Client connections for real-time SSE broadcasts
const sseClients = new Set();

function broadcastEvent(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(message);
        } catch (e) {
            sseClients.delete(client);
        }
    }
}

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-auth-token, x-auth-role');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // SSE Event Stream Endpoint
    if (req.url === '/api/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write('retry: 5000\n\n');
        sseClients.add(res);

        req.on('close', () => {
            sseClients.delete(res);
        });
        return;
    }

    if (req.url.startsWith('/api')) {
        await apiHandler(req, res);
        
        // Auto-save database changes on completion
        const { saveData } = require('./services/dataStore');
        saveData();

        // Broadcast a real-time update event to all active client tabs if database is mutated
        if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
            broadcastEvent({ type: 'update', method: req.method, url: req.url });
        }
        return;
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
