const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000; 

// Versioning for debugging
const BUILD_VERSION = "2.5.1-HARDWIRED";

app.use(cors());

// Ensure we find the public folder regardless of where Render starts the process
const publicPath = path.resolve(__dirname, 'public');
app.use(express.static(publicPath));

// Middleware to inject Version into every request for tracking
app.use((req, res, next) => {
    res.setHeader('X-Build-Version', BUILD_VERSION);
    next();
});

app.get('/api/version', (req, res) => res.json({ version: BUILD_VERSION }));

app.get('/api/economics/:iso', async (req, res) => {
    try {
        const { iso } = req.params;
        const url = `https://api.worldbank.org/v2/country/${iso}/indicator/NY.GDP.MKTP.CD;FP.CPI.TOTL.ZG?format=json&date=2021:2025`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "World Bank Bridge Offline" });
    }
});

app.get('/api/data/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'data', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: `File ${req.params.filename} not found at ${filePath}` });
    }
});

// Fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`--- GLOBAL ATLAS ${BUILD_VERSION} ---`);
    console.log(`Serving from: ${publicPath}`);
});
