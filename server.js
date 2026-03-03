const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BUILD_VERSION = "2.6.0-PRODUCTION";

app.use(cors());

// Paths
const publicPath = path.resolve(__dirname, 'public');
const dataPath = path.resolve(__dirname, 'data');

app.use(express.static(publicPath));

// --- v2.6.0 PRO DIAGNOSTICS ---
app.get('/api/health', async (req, res) => {
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

    // Test World Bank Bridge Connectivity
    let bridgeTest = "PENDING";
    try {
        const testRes = await axios.get('https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?format=json&date=2022', { timeout: 3000 });
        bridgeTest = (testRes.status === 200) ? "CONNECTED ✅" : "NO DATA ⚠️";
    } catch (e) { bridgeTest = "OFFLINE ❌"; }

    res.json({
        version: BUILD_VERSION,
        timestamp: new Date().toISOString(),
        systems: {
            server: "RUNNING ✅",
            world_bank_bridge: bridgeTest,
            ticker_engine: "ACTIVE ✅"
        },
        path_verification: {
            root: __dirname,
            public_dir: fs.existsSync(publicPath) ? "FOUND ✅" : "MISSING ❌",
            data_dir: fs.existsSync(dataPath) ? "FOUND ✅" : "MISSING ❌"
        },
        file_system: [
            checkFile(publicPath, 'index.html'),
            checkFile(publicPath, 'script.js'),
            checkFile(publicPath, 'style.css'),
            checkFile(dataPath, 'predictions.csv'),
            checkFile(dataPath, 'leaders.csv')
        ]
    });
});

app.get('/api/version', (req, res) => res.json({ version: BUILD_VERSION }));

// Route to fetch World Bank Economic Data without CORS blocks
app.get('/api/economics/:iso', async (req, res) => {
    try {
        const { iso } = req.params;
        const url = `https://api.worldbank.org/v2/country/${iso}/indicator/NY.GDP.MKTP.CD;FP.CPI.TOTL.ZG?format=json&date=2021:2025`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Bridge Error" });
    }
});

// Route to serve CSVs from the /data folder
app.get('/api/data/:filename', (req, res) => {
    const filePath = path.join(dataPath, req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: "File not found" });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`--- GLOBAL ATLAS ${BUILD_VERSION} ---`);
});
