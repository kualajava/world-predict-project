let map, geoLayer, isLocked = false, predictions = [], worldData = {}, leaderData = {};

const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

const countryAliases = {
    "unitedstates": "usa", "unitedstatesofamerica": "usa", "russianfederation": "russia",
    "peoplesrepublicofchina": "china", "republicofindia": "india", "unitedkingdom": "uk"
};

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
            return { title: (v[2]||'').replace(/"/g,''), country: v[5], desc: (v[9]||'').replace(/"/g,''), cleanRow: clean(line) };
        });

        // Loopable Ticker Content
        const tickerString = predictions.slice(-15).map(p => `${p.country.toUpperCase()}: ${p.title}`).join('  •  ');
        document.getElementById('ticker-content').innerText = tickerString + "  •  ";
        document.getElementById('ticker-content-2').innerText = tickerString + "  •  ";

        const lTxt = await lRes.text();
        lTxt.split('\n').slice(1).forEach(row => {
            const p = row.split(',');
            if(p[0] && p[1]) leaderData[clean(p[0])] = p[1].trim();
        });

        const gData = await gRes.json();
        geoLayer = L.geoJson(gData, {
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
        
        setupSearch(); 
    } catch (e) { console.error("Data Load Error", e); }
}

function setupSearch() {
    const searchControl = new window.GeoSearch.GeoSearchControl({
        provider: new window.GeoSearch.OpenStreetMapProvider(),
        style: 'bar', showMarker: false, autoClose: true
    });
    map.addControl(searchControl);
    
    const input = document.querySelector('.leaflet-geosearch-bar form input');
    input.addEventListener('input', (e) => {
        const q = clean(e.target.value);
        if (q.length < 2) { geoLayer.eachLayer(l => geoLayer.resetStyle(l)); return; }
        
        geoLayer.eachLayer(l => {
            const name = clean(l.feature.properties.name);
            // Search all fields in the CSV row for this country
            const deepMatch = predictions.some(p => p.cleanRow.includes(q) && (p.cleanRow.includes(name) || name.includes(clean(p.country))));
            
            if (name.includes(q) || deepMatch) {
                l.setStyle({fillOpacity: 0.4, fillColor: '#facc15', color: '#facc15'});
            } else {
                l.setStyle({fillOpacity: 0, color: "rgba(255,255,255,0.1)"});
            }
        });
    });
}

async function updateUI(name, iso) {
    if (!iso || iso === "-99") return;
    const d = worldData[iso], rawClean = clean(name);
    const lookupKey = countryAliases[rawClean] || rawClean;
    const leader = leaderData[lookupKey] || leaderData[rawClean] || "Pending...";

    document.getElementById('card-name').innerText = name;
    document.getElementById('card-leader').innerText = leader;
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "N/A";
    document.getElementById('card-flag').src = d?.flags?.png || "";
    if (d?.currencies) document.getElementById('card-cur').innerText = Object.keys(d.currencies)[0];

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
    } else panel.style.display = 'none';

    document.getElementById('hover-card').style.display = 'block';
}

function lockUI(n, i) { isLocked = true; updateUI(n, i); }
function closeUI() { isLocked = false; hideUI(); geoLayer.eachLayer(l => geoLayer.resetStyle(l)); }
function hideUI() { document.getElementById('intel-panel').style.display = 'none'; document.getElementById('hover-card').style.display = 'none'; }

document.addEventListener('DOMContentLoaded', () => {
    map = L.map('map', { zoomSnap: 0.1, attributionControl: false, zoomControl: false }).setView([20, 0], 3);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', { noWrap: true }).addTo(map);
    loadGlobalData();
});
