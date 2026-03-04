let map, geoLayer, isLocked = false, predictions = [], leaderData = {};

const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

function initMap() {
    map = L.map('map', { zoomSnap: 0.1, attributionControl: false, zoomControl: true }).setView([20, 0], 3);
    
    // Physical Tile Layer
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}').addTo(map);

    // MOVE ZOOM TO BOTTOM RIGHT
    map.zoomControl.setPosition('bottomright');

    loadGlobalData();
}

async function loadGlobalData() {
    try {
        const [pRes, gRes, cRes] = await Promise.all([
            fetch('/api/data/predictions.csv'),
            fetch('https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson'),
            fetch('https://restcountries.com/v3.1/all?fields=name,cca3,flags,population,currencies')
        ]);
        
        const pTxt = await pRes.text();
        predictions = pTxt.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const v = line.split(/,(?=(?:(?:[^multiline]*"){2})*[^multiline]*$)/);
            return { title: (v[2]||'').replace(/"/g,''), country: v[5], desc: (v[9]||'').replace(/"/g,''), cleanRow: clean(line) };
        });

        // Ticker content
        const tStr = predictions.slice(-15).map(p => `${p.country.toUpperCase()}: ${p.title}`).join('  •  ') + "  •  ";
        document.getElementById('ticker-content').innerText = tStr;
        document.getElementById('ticker-content-2').innerText = tStr;

        const countries = await gRes.json();
        const restData = await cRes.json();
        
        // Heatmap Layer
        geoLayer = L.geoJson(countries, {
            style: { color: "rgba(255,255,255,0.1)", weight: 1, fillOpacity: 0 },
            onEachFeature: (f, l) => {
                const name = f.properties.name;
                const d = restData.find(c => c.name.common === name || c.cca3 === f.id);
                
                // Colorize Heatmap if predictions exist
                if (predictions.some(p => clean(p.country) === clean(name))) {
                    l.setStyle({ fillOpacity: 0.2, fillColor: '#facc15' });
                }

                l.on({
                    mouseover: () => { if(!isLocked) updateUI(name, d, f.id); },
                    click: () => { isLocked = true; updateUI(name, d, f.id); }
                });
            }
        }).addTo(map);

        setupSearch();
    } catch (e) { console.error(e); }
}

function updateUI(name, d, iso) {
    document.getElementById('card-name').innerText = name;
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "--";
    document.getElementById('card-flag').src = d?.flags?.png || "";
    
    const matches = predictions.filter(p => clean(p.country) === clean(name));
    const panel = document.getElementById('intel-panel');
    
    if (matches.length > 0) {
        panel.style.display = 'flex';
        document.getElementById('intel-title').innerText = name.toUpperCase() + " INTEL";
        document.getElementById('intel-body').innerHTML = matches.map(p => `
            <div class="prediction-card">
                <span class="pred-title">${p.title}</span>
                <div class="pred-desc">${p.desc}</div>
            </div>`).join('');
    } else { panel.style.display = 'none'; }
    
    document.getElementById('hover-card').style.display = 'block';
}

function setupSearch() {
    const provider = new window.GeoSearch.OpenStreetMapProvider();
    const searchControl = new window.GeoSearch.GeoSearchControl({
        provider: provider,
        style: 'bar',
        container: document.getElementById('search-container'), // ATTACH TO OUR DIV
        showMarker: false
    });
    map.addControl(searchControl);
}

function closeUI() {
    isLocked = false;
    document.getElementById('intel-panel').style.display = 'none';
    document.getElementById('hover-card').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', initMap);
