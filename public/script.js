let map, geoLayer, isLocked = false, predictions = [], worldData = {}, leaderData = {};

/**
 * Normalizes strings for consistent data matching across different sources.
 */
const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

/**
 * Maps varying country name formats to a standard key for reliable data joins.
 */
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

/**
 * Initializes the Leaflet map with specific tactical constraints and layers.
 */
function initMap() {
    if (map) return;

    const bounds = L.latLngBounds(L.latLng(-85, -200), L.latLng(85, 200));

    map = L.map('map', { 
        zoomSnap: 0.1, 
        attributionControl: false,
        zoomControl: false, 
        maxBounds: bounds,         
        maxBoundsViscosity: 0.5    
    }).setView([20, 0], 3.0);

    // Zoom positioned bottom-right to clear room for panels
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
        noWrap: true, bounds: bounds             
    }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { 
        opacity: 0.4, noWrap: true, bounds: bounds
    }).addTo(map);

    loadGlobalData();
}

/**
 * Fetches and processes predictions, leader data, geospatial boundaries, and country stats.
 */
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
            return { 
                title: (v[2] || '').replace(/"/g, ''), 
                country: v[5], 
                desc: (v[9] || '').replace(/"/g, ''), 
                cleanRow: clean(line) 
            };
        });

        const tickerText = predictions.slice(-10).map(p => `${p.country.toUpperCase()}: ${p.title}`).join('  |  ');
        document.getElementById('ticker-content').innerText = `LIVE INTEL: ${tickerText} --- BRIDGE ONLINE --- `;

        const lTxt = await lRes.text();
        lTxt.split('\n').slice(1).forEach(row => {
            const p = row.split(',');
            // Mapping column 0 (Country Key) to column 1 (Leader Name)
            if (p[0] && p[1]) leaderData[clean(p[0])] = p[1].trim();
        });

        const gData = await gRes.json();
        geoLayer = L.geoJson(gData, {
            style: { fillOpacity: 0, weight: 1.2, color: "rgba(255,255,255,0.2)" },
            onEachFeature: (f, layer) => {
                const iso = f.properties.iso_a3 || f.properties.ISO_A3;
                layer.on({
                    mouseover: (e) => { 
                        if (!isLocked) { 
                            e.target.setStyle({ weight: 3, color: '#facc15' }); 
                            updateUI(f.properties.name, iso); 
                        } 
                    },
                    mouseout: (e) => { 
                        if (!isLocked) { 
                            geoLayer.resetStyle(e.target); 
                            hideUI(); 
                        } 
                    },
                    click: (e) => { 
                        L.DomEvent.stopPropagation(e); 
                        lockUI(f.properties.name, iso); 
                    }
                });
            }
        }).addTo(map);

        const cData = await cRes.json();
        cData.forEach(c => worldData[c.cca3] = c);
        
        drawHeatIcons();
        setupSearch(); 
    } catch (e) { 
        console.error("Global Load Failure", e); 
    }
}

/**
 * Places markers on the map indicating the volume of predictions per country.
 */
function drawHeatIcons() {
    geoLayer.eachLayer(layer => {
        const countryKey = clean(layer.feature.properties.name);
        const count = predictions.filter(p => p.cleanRow.includes(countryKey)).length;
        if (count > 0) {
            L.marker(layer.getBounds().getCenter(), { 
                icon: L.divIcon({ className: 'heat-badge', html: count, iconSize: [24, 24] }) 
            }).addTo(map).on('click', (e) => { 
                L.DomEvent.stopPropagation(e); 
                lockUI(layer.feature.properties.name, layer.feature.properties.iso_a3 || layer.feature.properties.ISO_A3); 
            });
        }
    });
}

/**
 * Sets up the centered search bar to scan both regional names and prediction intel.
 */
function setupSearch() {
    if (!window.GeoSearch) return setTimeout(setupSearch, 200);

    const searchControl = new window.GeoSearch.GeoSearchControl({
        provider: new window.GeoSearch.OpenStreetMapProvider(),
        style: 'bar', 
        position: 'topright', // Position overridden to bottom-center in style.css
        showMarker: false, 
        autoClose: true
    });
    map.addControl(searchControl);
    
    const input = document.querySelector('.leaflet-geosearch-bar form input');
    input.placeholder = "SEARCH INTEL OR REGION...";

    input.addEventListener('input', (e) => {
        const q = clean(e.target.value);
        if (q.length < 2) { 
            resetHighlights(); 
            return; 
        }
        
        geoLayer.eachLayer(l => {
            const countryName = clean(l.feature.properties.name);
            const hasIntelMatch = predictions.some(p => p.cleanRow.includes(q) && p.cleanRow.includes(countryName));
            const isCountryMatch = countryName.includes(q);

            if (hasIntelMatch || isCountryMatch) {
                l.setStyle({ fillOpacity: 0.5, fillColor: '#facc15', color: '#facc15', weight: 2 });
            } else {
                l.setStyle({ fillOpacity: 0, color: "rgba(255,255,255,0.1)", weight: 1 });
            }
        });
    });
}

function resetHighlights() {
    geoLayer.eachLayer(l => geoLayer.resetStyle(l));
}

/**
 * Updates the tactical interface with country data and prediction feeds.
 */
async function updateUI(name, iso) {
    if (!iso || iso === "-99") return;
    
    const d = worldData[iso];
    const rawClean = clean(name);
    const lookupKey = countryAliases[rawClean] || rawClean;
    
    // Robust leader lookup with alias and fuzzy fallback
    const leader = leaderData[lookupKey] || 
                   leaderData[rawClean] || 
                   Object.keys(leaderData).find(k => rawClean.includes(k) || k.includes(rawClean)) || 
                   "Establishing Connection...";

    document.getElementById('card-name').innerText = name;
    document.getElementById('card-leader').innerText = leader;
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "N/A";
    document.getElementById('card-flag').src = d?.flags?.png || "";
    
    if (d?.currencies) {
        document.getElementById('card-cur').innerText = Object.keys(d.currencies)[0];
    }

    fetchEconomicData(iso);
    document.getElementById('hover-card').style.display = 'block';

    const matches = predictions.filter(p => p.cleanRow.includes(lookupKey) || p.cleanRow.includes(rawClean));
    const panel = document.getElementById('intel-panel');
    
    if (matches.length > 0) {
        panel.style.display = 'flex';
        document.getElementById('intel-title').innerText = name.toUpperCase() + " INTEL";
        document.getElementById('intel-body').innerHTML = matches.map(p => `
            <div class="prediction-card">
                <span class="pred-title">${p.title}</span>
                <div class="pred-desc">${p.desc}</div>
            </div>`).join('');
    } else { 
        panel.style.display = 'none'; 
    }
}

/**
 * Retrieves GDP and Inflation data from the internal economics API.
 */
async function fetchEconomicData(iso) {
    try {
        const res = await fetch(`/api/economics/${iso}`);
        const data = await res.json();
        document.getElementById('card-gdp').innerText = data.gdp?.length ? 
            "$" + (data.gdp.find(v => v.value)?.value / 1e12).toFixed(2) + "T" : "GAP";
        document.getElementById('card-inf').innerText = data.inflation?.length ? 
            data.inflation.find(v => v.value)?.value.toFixed(1) + "%" : "GAP";
    } catch (e) { 
        document.getElementById('card-gdp').innerText = "ERR"; 
    }
}

function lockUI(n, i) { isLocked = true; updateUI(n, i); }
function closeUI() { isLocked = false; hideUI(); }
function hideUI() { 
    document.getElementById('intel-panel').style.display = 'none'; 
    document.getElementById('hover-card').style.display = 'none'; 
}

// Map Launch
initMap();
