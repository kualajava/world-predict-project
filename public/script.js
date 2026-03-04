let map, geoLayer, isLocked = false, predictions = [], worldData = {}, leaderData = {};

// 1. HELPER: Advanced Clean & Translation Ledger
const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

const countryAliases = {
    "unitedstates": "usa",
    "unitedstatesofamerica": "usa",
    "russianfederation": "russia",
    "peoplesrepublicofchina": "china",
    "republicofindia": "india",
    "federativerepublicofbrazil": "brazil",
    "unitedkingdomofgreatbritainandnorthernireland": "uk",
    "unitedkingdom": "uk",
    "republicoffrance": "france"
};

// ... existing clean function and aliases ...

function initMap() {
    // PREVENT "Already Initialized" Error
    if (map !== undefined && map !== null) { 
        console.log("Map already initialized. Skipping...");
        return; 
    }

    // 1. Define bounds to roughly clip the world, but not too tightly
    const southWest = L.latLng(-85, -200); // Expanded slightly west
    const northEast = L.latLng(85, 200);  // Expanded slightly east
    const bounds = L.latLngBounds(southWest, northEast);

    map = L.map('map', { 
        zoomSnap: 0.1, 
        attributionControl: false,
        maxBounds: bounds,         
        maxBoundsViscosity: 0.5    // THE FIX: Soften the hard stop
    }).setView([20, 0], 3.0); // THE FIX: Default zoom is now 3.0 (Tighter in)

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
        noWrap: true,              
        bounds: bounds             
    }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { 
        opacity: 0.4,
        noWrap: true,
        bounds: bounds
    }).addTo(map);

    loadGlobalData();
}

// ... rest of the file ...

async function loadGlobalData() {
    try {
        const [pRes, lRes, gRes, cRes] = await Promise.all([
            fetch('/api/data/predictions.csv'),
            fetch('/api/data/leaders.csv'),
            fetch('https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson'),
            fetch('https://restcountries.com/v3.1/all?fields=name,cca3,flags,population,currencies')
        ]);
        
        const pTxt = await pRes.text();
        predictions = pTxt.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const v = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            return { author: v[1], title: v[2], date: v[3], country: v[5], meta: v[6], from: v[7], to: v[8], desc: v[9], cleanRow: clean(line) };
        });

        const tickerContent = predictions.slice(-5).map(p => `${p.country.toUpperCase()}: ${p.title.replace(/"/g,'')}`).join('  |  ');
        document.getElementById('ticker-scroll').innerText = `LIVE INTEL: ${tickerContent} ... WORLD BANK BRIDGE ONLINE ...`;

        const lTxt = await lRes.text();
        lTxt.split('\n').slice(1).forEach(row => {
            const p = row.split(',');
            if(p[0]) leaderData[clean(p[0])] = p[1];
        });

        const gData = await gRes.json();
        geoLayer = L.geoJSON(gData, {
            style: { fillOpacity: 0, weight: 1.2, color: "rgba(255,255,255,0.2)" },
            onEachFeature: (f, layer) => {
                const iso = f.properties.iso_a3 || f.properties.ISO_A3;
                layer.on({
                    mouseover: (e) => { if(!isLocked) { e.target.setStyle({weight:3, color: '#facc15'}); updateUI(f.properties.name, iso); }},
                    mouseout: (e) => { if(!isLocked) { geoLayer.resetStyle(e.target); hideUI(); }},
                    click: (e) => { L.DomEvent.stopPropagation(e); lockUI(f.properties.name, iso); }
                });
            }
        }).addTo(map);

        const cData = await cRes.json();
        cData.forEach(c => worldData[c.cca3] = c);
        drawHeatIcons();
    } catch (e) { console.error("Load Error", e); }
}

function drawHeatIcons() {
    geoLayer.eachLayer(layer => {
        const countryKey = clean(layer.feature.properties.name);
        const matches = predictions.filter(p => p.cleanRow.includes(countryKey));
        if (matches.length > 0) {
            L.marker(layer.getBounds().getCenter(), { 
                icon: L.divIcon({ className: 'heat-badge', html: matches.length, iconSize: [26, 26] }) 
            }).addTo(map).on('click', (e) => { 
                L.DomEvent.stopPropagation(e); 
                lockUI(layer.feature.properties.name, layer.feature.properties.iso_a3 || layer.feature.properties.ISO_A3); 
            });
        }
    });
}

async function updateUI(name, iso) {
    if (!iso || iso === "-99") return;
    
    const d = worldData[iso];
    const rawCleanName = clean(name);
    const lookupKey = countryAliases[rawCleanName] || rawCleanName;
    const matches = predictions.filter(p => p.cleanRow.includes(lookupKey) || p.cleanRow.includes(rawCleanName));
    
    document.getElementById('card-name').innerText = name;
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "N/A";
    
    // SMART LEADER LOOKUP
    const leaderName = leaderData[lookupKey] || leaderData[rawCleanName] || "Intel Update Pending";
    document.getElementById('card-leader').innerText = leaderName;
    
    document.getElementById('card-flag').src = d?.flags?.png || "";
    
    fetchEconomicData(iso);
    document.getElementById('hover-card').style.display = 'block';

    const panel = document.getElementById('intel-panel');
    if (matches.length > 0) {
        panel.style.display = 'flex';
        document.getElementById('intel-title').innerText = name.toUpperCase() + " INTEL";
        document.getElementById('intel-body').innerHTML = matches.map(p => `
            <div class="prediction-card">
                <div class="pred-meta">${p.author} • ${p.date}</div>
                <div class="pred-title">${p.title.replace(/"/g,'')}</div>
                <div class="pred-desc">${p.desc.replace(/"/g,'')}</div>
            </div>
        `).join('');
    } else { panel.style.display = 'none'; }
}

async function fetchEconomicData(iso) {
    const gdpEl = document.getElementById('card-gdp');
    const infEl = document.getElementById('card-inf');
    gdpEl.innerText = "..."; infEl.innerText = "...";
    try {
        const response = await fetch(`/api/economics/${iso}`);
        const data = await response.json();
        let gdp = "GAP", inf = "GAP";
        if (data.gdp?.length) {
            const latest = data.gdp.find(i => i.value !== null);
            if (latest) gdp = "$" + (latest.value / 1e12).toFixed(2) + "T";
        }
        if (data.inflation?.length) {
            const latest = data.inflation.find(i => i.value !== null);
            if (latest) inf = latest.value.toFixed(1) + "%";
        }
        gdpEl.innerText = gdp; infEl.innerText = inf;
    } catch (e) { gdpEl.innerText = "ERR"; }
}

function lockUI(n, i) { isLocked = true; updateUI(n, i); }
function closeUI() { isLocked = false; hideUI(); }
function hideUI() { document.getElementById('intel-panel').style.display = 'none'; document.getElementById('hover-card').style.display = 'none'; }

// START
initMap();
