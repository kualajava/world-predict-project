const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000; // Updated to use Render's dynamic port

app.use(cors());

// Hard-wired path resolution for the 'public' folder
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Route to fetch World Bank Economic Data without CORS blocks
app.get('/api/economics/:iso', async (req, res) => {
    try {
        const { iso } = req.params;
        const url = `https://api.worldbank.org/v2/country/${iso}/indicator/NY.GDP.MKTP.CD;FP.CPI.TOTL.ZG?format=json&date=2021:2025`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error("World Bank Error:", error.message);
        res.status(500).json({ error: "Failed to fetch from World Bank" });
    }
});

// Hard-wired Route to serve CSVs from the /data folder
app.get('/api/data/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'data', req.params.filename);
    
    // Debugging log: This will show up in your Render Logs to tell us exactly where it's looking
    console.log(`Searching for file: ${filePath}`);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        console.error(`File NOT found at: ${filePath}`);
        res.status(404).send("File not found");
    }
});

// Fallback to serve index.html for any unknown routes (helps with refreshes)
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Global Atlas Server running at http://localhost:${PORT}`);
    console.log(`Static files served from: ${publicPath}`);
});
