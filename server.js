const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
const publicPath = path.resolve(__dirname, 'public');
const dataPath = path.resolve(__dirname, 'data');
app.use(express.static(publicPath));

app.get('/api/health', (req, res) => {
    res.json({ status: "GREEN", version: "2.6.2", bridge: "MULTICHANNEL" });
});

app.get('/api/economics/:iso', async (req, res) => {
    try {
        const { iso } = req.params;
        // Parallel requests for maximum reliability
        const gdpUrl = `https://api.worldbank.org/v2/country/${iso}/indicator/NY.GDP.MKTP.CD?format=json&date=2015:2025`;
        const infUrl = `https://api.worldbank.org/v2/country/${iso}/indicator/FP.CPI.TOTL.ZG?format=json&date=2015:2025`;
        
        const [gdpRes, infRes] = await Promise.all([
            axios.get(gdpUrl).catch(() => ({ data: [null, []] })),
            axios.get(infUrl).catch(() => ({ data: [null, []] }))
        ]);

        res.json({
            gdp: gdpRes.data[1] || [],
            inflation: infRes.data[1] || []
        });
    } catch (error) {
        res.status(500).json({ error: "Bridge Connection Failed" });
    }
});

app.get('/api/data/:filename', (req, res) => {
    const filePath = path.join(dataPath, req.params.filename);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send("File not found");
});

app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(PORT, () => console.log(`Atlas v2.6.2 - Multichannel Bridge Active`));
