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
    res.json({ status: "GREEN", version: "2.6.1" });
});

app.get('/api/economics/:iso', async (req, res) => {
    try {
        const { iso } = req.params;
        // Expanded date range to 2018-2025 to catch older data for "Gap" countries
        const url = `https://api.worldbank.org/v2/country/${iso}/indicator/NY.GDP.MKTP.CD;FP.CPI.TOTL.ZG?format=json&date=2018:2025`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Bridge Error" });
    }
});

app.get('/api/data/:filename', (req, res) => {
    const filePath = path.join(dataPath, req.params.filename);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send("File not found");
});

app.get('*', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));

app.listen(PORT, () => console.log(`Atlas v2.6.1 Online`));
