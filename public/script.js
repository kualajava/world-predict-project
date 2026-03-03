let map, geoLayer, isLocked = false, predictions = [], worldData = {}, leaderData = {};
const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

function initMap() {
    if (map) return;
    map = L.map('map', { zoomSnap: 0.1, attributionControl: false }).setView([20, 0], 2.2);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}').addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { opacity: 0.4 }).addTo(map);
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
        const lTxt = await lRes.text();
        lTxt.split('\n').slice(1).forEach(row => {
            const p = row.split(',');
            if(p[0]) leaderData[clean(p[0])] = p[1];
        });
        const gData = await gRes.json();
        geoLayer = L.geoJSON(gData, {
            style: { fillOpacity: 0, weight: 1.2, color: "rgba(255,255,255,0.2)" },
            onEachFeature: (f, layer) => {
                const iso = f.properties.iso_a3 || f.properties.ISO_A3 || f.properties.iso_a2;
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
                const f = layer.feature;
                lockUI(f.properties.name, f.properties.iso_a3 || f.properties.ISO_A3); 
            });
        }
    });
}

async function updateUI(name, iso) {
    if (!iso || iso === "-99") return;
    const d = worldData[iso];
    const countryKey = clean(name);
    const matches = predictions.filter(p => p.cleanRow.includes(countryKey));
    document.getElementById('card-name').innerText = name;
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "N/A";
    document.getElementById('card-leader').innerText = leaderData[countryKey] || "Unknown";
    document.getElementById('card-flag').src = d?.flags?.png || "";
    if (d?.currencies) {
        const code = Object.keys(d.currencies)[0];
        document.getElementById('card-cur').innerText = `${code} (${d.currencies[code].symbol || ''})`;
    }
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
                <div class="pred-footer">Validity: ${p.from} to ${p.to}</div>
            </div>
        `).join('');
    } else { panel.style.display = 'none'; }
}

async function fetchEconomicData(iso) {
    const gdpEl = document.getElementById('card-gdp');
    const infEl = document.getElementById('card-inf');
    gdpEl.innerText = "LINKING...";
    infEl.innerText = "LINKING...";
    try {
        const response = await fetch(`/api/economics/${iso}`);
        const data = await response.json();
        
        let gdp = "DATA GAP", inf = "DATA GAP";

        if (data.gdp && Array.isArray(data.gdp)) {
            const latest = data.gdp.find(i => i.value !== null);
            if (latest) gdp = "$" + (latest.value / 1e12).toFixed(2) + "T";
        }
        if (data.inflation && Array.isArray(data.inflation)) {
            const latest = data.inflation.find(i => i.value !== null);
            if (latest) inf = latest.value.toFixed(1) + "%";
        }

        gdpEl.innerText = gdp;
        infEl.innerText = inf;
    } catch (e) { gdpEl.innerText = "OFFLINE"; infEl.innerText = "OFFLINE"; }
}

function lockUI(n, i) { isLocked = true; updateUI(n, i); }
function closeUI() { isLocked = false; hideUI(); }
function hideUI() { document.getElementById('intel-panel').style.display = 'none'; document.getElementById('hover-card').style.display = 'none'; }
initMap();
