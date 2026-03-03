const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static('public'));

// Route to fetch World Bank Economic Data without CORS blocks
app.get('/api/economics/:iso', async (req, res) => {
    try {
        const { iso } = req.params;
        // Queries 2021-2025 to ensure we get the latest reported numbers
        const url = `https://api.worldbank.org/v2/country/${iso}/indicator/NY.GDP.MKTP.CD;FP.CPI.TOTL.ZG?format=json&date=2021:2025`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch from World Bank" });
    }
});

// Route to serve CSVs from the /data folder
app.get('/api/data/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'data', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send("File not found");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Global Atlas Server running at http://localhost:${PORT}`);
});
