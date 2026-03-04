let map, geoLayer, isLocked = false, predictions = [], worldData = {}, leaderData = {};

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

function initMap() {
    if (map !== undefined && map !== null) return;

    const bounds = L.latLngBounds(L.latLng(-85, -200), L.latLng(85, 200));

    map = L.map('map', { 
        zoomSnap: 0.1, 
        attributionControl: false,
        zoomControl: false, 
        maxBounds: bounds,         
        maxBoundsViscosity: 0.5    
    }).setView([20, 0], 3.0);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
        noWrap: true, bounds: bounds             
    }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { 
        opacity: 0.4, noWrap: true, bounds: bounds
    }).addTo(map);

    loadGlobalData();
}

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
        addSearchBar(); 
    } catch (e) { console.error("Load Error", e); }
}

// ... existing variables ...

function addSearchBar() {
    if (!window.GeoSearch) {
        setTimeout(addSearchBar, 200);
        return;
    }

    const provider = new window.GeoSearch.OpenStreetMapProvider();
    const searchControl = new window.GeoSearch.GeoSearchControl({
        provider: provider,
        style: 'bar',
        position: 'topright',
        showMarker: false, // We'll handle highlighting ourselves
        autoClose: true,
        searchLabel: 'Search Location or Intel Keywords...'
    });

    map.addControl(searchControl);

    // DUAL-LOGIC LISTENERS
    const searchInput = document.querySelector('.leaflet-geosearch-bar form input');
    
    // Listener for when a user presses "Enter"
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value;
            searchLocalIntel(query);
        }
    });

    // Listener for selecting a specific map location from the dropdown
    map.on('geosearch/showlocation', (result) => {
        // If they chose a location, also search intel for that location name
        searchLocalIntel(result.location.label);
    });
}

function searchLocalIntel(query) {
    const q = clean(query);
    if (!q) return;

    let matchFound = false;
    const matchedCountries = new Set();

    // 1. Scan predictions for the keyword
    predictions.forEach(p => {
        if (p.cleanRow.includes(q)) {
            matchedCountries.add(clean(p.country));
            matchFound = true;
        }
    });

    // 2. Highlight matching countries on the map
    geoLayer.eachLayer(layer => {
        const countryName = clean(layer.feature.properties.name);
        const iso = layer.feature.properties.iso_a3 || layer.feature.properties.ISO_A3;
        
        // If the country matches the keyword or the specific location searched
        if (matchedCountries.has(countryName) || q.includes(countryName)) {
            layer.setStyle({
                weight: 4,
                color: 'var(--accent)',
                fillOpacity: 0.3,
                fillColor: 'var(--accent)'
            });
            
            // Auto-open UI for the first match found
            if (!matchFound) {
                lockUI(layer.feature.properties.name, iso);
                matchFound = true;
            }
        } else {
            // Reset others
            geoLayer.resetStyle(layer);
        }
    });

    if (!matchFound) {
        console.log("No intel matches for: " + query);
    }
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
    
    // DEBUG: Log this to your console so we can see what the map is sending
    console.log("Hovering over:", name, "Key used:", lookupKey);

    // FIX: Check aliases, then raw name, then a partial match
    const leaderName = leaderData[lookupKey] || 
                       leaderData[rawCleanName] || 
                       Object.keys(leaderData).find(k => rawCleanName.includes(k) || k.includes(rawCleanName)) || 
                       "Intel Update Pending";

    document.getElementById('card-leader').innerText = leaderName;
    // ... rest of function
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

initMap();
