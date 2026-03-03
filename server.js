const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BUILD_VERSION = "2.5.2-DIAGNOSTIC";

app.use(cors());

// Paths
const publicPath = path.resolve(__dirname, 'public');
const dataPath = path.resolve(__dirname, 'data');

app.use(express.static(publicPath));

// --- DIAGNOSTIC HEALTH CHECK ---
app.get('/api/health', (req, res) => {
    const checkFile = (dir, name) => {
        const fullPath = path.join(dir, name);
        const exists = fs.existsSync(fullPath);
        let details = "Missing";
        if (exists) {
            const stats = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n').filter(l => l.trim()).length;
            details = `Exists (${stats.size} bytes, ~${lines} records)`;
        }
        return { file: name, status: exists ? "✅" : "❌", details };
    };

    const healthReport = {
        version: BUILD_VERSION,
        timestamp: new Date().toISOString(),
        directories: {
            root: __dirname,
            public: { path: publicPath, exists: fs.existsSync(publicPath) },
            data: { path: dataPath, exists: fs.existsSync(dataPath) }
        },
        file_checks: [
            checkFile(publicPath, 'index.html'),
            checkFile(publicPath, 'script.js'),
            checkFile(publicPath, 'style.css'),
            checkFile(dataPath, 'predictions.csv'),
            checkFile(dataPath, 'leaders.csv')
        ]
    };
    res.json(healthReport);
});

app.get('/api/version', (req, res) => res.json({ version: BUILD_VERSION }));

// Existing API routes
app.get('/api/economics/:iso', async (req, res) => {
    try {
        const url = `https://api.worldbank.org/v2/country/${req.params.iso}/indicator/NY.GDP.MKTP.CD;FP.CPI.TOTL.ZG?format=json&date=2021:2025`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (e) { res.status(500).json({ error: "Bridge Error" }); }
});

app.get('/api/data/:filename', (req, res) => {
    const filePath = path.join(dataPath, req.params.filename);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).json({ error: "Not Found" });
});

app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(PORT, () => console.log(`System Live: ${BUILD_VERSION}`));
