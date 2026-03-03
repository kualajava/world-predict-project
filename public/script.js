let map, geoLayer, isLocked = false, predictions = [], worldData = {}, leaderData = {};

// 1. HELPER: Clean strings for matching
const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

// 2. INITIALIZE MAP
function initMap() {
    map = L.map('map', { zoomSnap: 0.1, attributionControl: false }).setView([20, 0], 2.2);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}').addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { opacity: 0.4 }).addTo(map);
    loadGlobalData();
}

// 3. LOAD DATA FROM SERVER
async function loadGlobalData() {
    try {
        // Load Predictions from local API
        const pRes = await fetch('/api/data/predictions.csv');
        const pTxt = await pRes.text();
        predictions = pTxt.split('\n').slice(1).filter(l => l.trim() !== "").map(line => {
            const v = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            return {
                author: v[1], title: v[2], date: v[3], country: v[5], 
                meta: v[6], from: v[7], to: v[8], desc: v[9],
                cleanRow: clean(line)
            };
        });

        // Load Leaders from local API
        const lRes = await fetch('/api/data/leaders.csv');
        const lTxt = await lRes.text();
        lTxt.split('\n').slice(1).forEach(row => {
            const p = row.split(',');
            if(p[0]) leaderData[clean(p[0])] = p[1];
        });

        // Load Map Boundaries
        const gRes = await fetch('https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson');
        const gData = await gRes.json();
        
        geoLayer = L.geoJSON(gData, {
            style: { fillOpacity: 0, weight: 1.2, color: "rgba(255,255,255,0.2)" },
            onEachFeature: (f, layer) => {
                layer.on({
                    mouseover: (e) => { if(!isLocked) { e.target.setStyle({weight:3, color: '#facc15'}); updateUI(f.properties.name, f.properties.iso_a3); }},
                    mouseout: (e) => { if(!isLocked) { geoLayer.resetStyle(e.target); hideUI(); }},
                    click: (e) => { L.DomEvent.stopPropagation(e); lockUI(f.properties.name, f.properties.iso_a3); }
                });
            }
        }).addTo(map);

        // Load RestCountries Meta (Flags, Population, Currency)
        const cRes = await fetch(`https://restcountries.com/v3.1/all?fields=name,cca3,flags,population,currencies`);
        const cData = await cRes.json();
        cData.forEach(c => worldData[c.cca3] = c);
        
        drawHeatIcons();
        console.log("System Ready: Build v2.5.0");
    } catch (e) { console.error("Initialization failed", e); }
}

// 4. DRAW PREDICTION BADGES
function drawHeatIcons() {
    geoLayer.eachLayer(layer => {
        const countryKey = clean(layer.feature.properties.name);
        const matches = predictions.filter(p => p.cleanRow.includes(countryKey));
        if (matches.length > 0) {
            L.marker(layer.getBounds().getCenter(), { 
                icon: L.divIcon({ className: 'heat-badge', html: matches.length, iconSize: [26, 26] }) 
            }).addTo(map).on('click', (e) => { 
                L.DomEvent.stopPropagation(e); 
                lockUI(layer.feature.properties.name, layer.feature.properties.iso_a3); 
            });
        }
    });
}

// 5. UPDATE UI (SIDE PANEL & DATA CARD)
async function updateUI(name, iso) {
    const d = worldData[iso];
    const countryKey = clean(name);
    const matches = predictions.filter(p => p.cleanRow.includes(countryKey));
    
    // Fill Data Card
    document.getElementById('card-name').innerText = name;
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "--";
    document.getElementById('card-leader').innerText = leaderData[countryKey] || "Pending Match...";
    document.getElementById('card-flag').src = d?.flags?.png || "";
    
    if (d?.currencies) {
        const code = Object.keys(d.currencies)[0];
        document.getElementById('card-cur').innerText = `${code} (${d.currencies[code].symbol || ''})`;
    }

    // Fetch Economic Data via our Server Proxy
    fetchEconomicData(iso);

    document.getElementById('hover-card').style.display = 'block';

    // Fill Intel Panel
    const panel = document.getElementById('intel-panel');
    if (matches.length > 0) {
        panel.style.display = 'flex';
        document.getElementById('intel-title').innerText = name.toUpperCase() + " INTEL";
        document.getElementById('intel-body').innerHTML = matches.map(p => `
            <div class="prediction-card">
                <div class="pred-meta">${p.author} • ${p.date}</div>
                <div class="pred-title">${p.title.replace(/"/g,'')}</div>
                <div class="pred-desc">${p.desc.replace(/"/g,'')}</div>
                <div class="pred-footer">Range: ${p.from} to ${p.to} • Tag: ${p.meta}</div>
            </div>
        `).join('');
    } else { panel.style.display = 'none'; }
}

// 6. FETCH ECONOMIC DATA (Via Node Server)
async function fetchEconomicData(iso) {
    if (!iso || iso === "-99") return;
    document.getElementById('card-gdp').innerText = "FETCHING...";
    document.getElementById('card-inf').innerText = "FETCHING...";

    try {
        const response = await fetch(`/api/economics/${iso}`);
        const data = await response.json();
        
        if (data && data[1]) {
            let gdp = "N/A", inf = "N/A";
            data[1].forEach(item => {
                if (item.value) {
                    if (item.indicator.id === "NY.GDP.MKTP.CD" && gdp === "N/A") gdp = "$" + (item.value / 1e12).toFixed(2) + "T";
                    if (item.indicator.id === "FP.CPI.TOTL.ZG" && inf === "N/A") inf = item.value.toFixed(1) + "%";
                }
            });
            document.getElementById('card-gdp').innerText = gdp;
            document.getElementById('card-inf').innerText = inf;
        }
    } catch (e) { 
        document.getElementById('card-gdp').innerText = "SERVER ERROR"; 
    }
}

function lockUI(n, i) { isLocked = true; document.getElementById('map').classList.add('map-dimmed'); updateUI(n, i); }
function closeUI() { isLocked = false; document.getElementById('map').classList.remove('map-dimmed'); hideUI(); }
function hideUI() { 
    document.getElementById('intel-panel').style.display = 'none'; 
    document.getElementById('hover-card').style.display = 'none'; 
}

initMap();
console.log("Global Atlas v2.5.1 UI Loaded"); initMap();
