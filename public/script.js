let map, geoLayer, isLocked = false, predictions = [], leaderData = {};

const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

function initMap() {
    map = L.map('map', { zoomSnap: 0.1, attributionControl: false, zoomControl: false }).setView([20, 0], 3);
    
    // HYBRID LAYER: Provides imagery AND Country/City/River names
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}').addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { opacity: 0.7 }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    loadData();
}

async function loadData() {
    try {
        const [pRes, lRes, gRes, cRes] = await Promise.all([
            fetch('/api/data/predictions.csv'),
            fetch('/api/data/leaders.csv'),
            fetch('https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson'),
            fetch('https://restcountries.com/v3.1/all?fields=name,cca3,flags,population,currencies')
        ]);

        // Process Leaders
        const lTxt = await lRes.text();
        lTxt.split('\n').forEach(line => {
            const [country, leader] = line.split(',');
            if(country) leaderData[clean(country)] = leader;
        });

        // Process Predictions
        const pTxt = await pRes.text();
        predictions = pTxt.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const v = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            return { title: (v[2]||'').replace(/"/g,''), country: v[5], desc: (v[9]||'').replace(/"/g,''), raw: clean(line) };
        });

        const geoData = await gRes.json();
        const restData = await cRes.json();

        geoLayer = L.geoJson(geoData, {
            style: (f) => ({
                color: "rgba(250, 204, 21, 0.3)", weight: 1, 
                fillOpacity: predictions.some(p => clean(p.country) === clean(f.properties.name)) ? 0.4 : 0.05,
                fillColor: '#facc15'
            }),
            onEachFeature: (f, l) => {
                const name = f.properties.name;
                const d = restData.find(c => clean(c.name.common) === clean(name) || c.cca3 === f.id);
                l.on({
                    mouseover: () => { if(!isLocked) updateUI(name, d, f.id); },
                    click: (e) => { isLocked = true; updateUI(name, d, f.id); L.DomEvent.stopPropagation(e); }
                });
            }
        }).addTo(map);

        setupSearch();
    } catch (e) { console.error("System Error:", e); }
}

async function updateUI(name, d, iso) {
    const cKey = clean(name);
    document.getElementById('card-name').innerText = name;
    document.getElementById('card-leader').innerText = leaderData[cKey] || "Intel Pending";
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "--";
    document.getElementById('card-flag').src = d?.flags?.png || "";

    // Economic Fetch
    try {
        const econ = await fetch(`/api/economics/${iso}`).then(r => r.json());
        document.getElementById('card-gdp').innerText = econ.gdp ? `$${(econ.gdp/1e12).toFixed(2)}T` : "GAP";
        document.getElementById('card-inf').innerText = econ.inflation ? `${econ.inflation.toFixed(1)}%` : "GAP";
    } catch {
        document.getElementById('card-gdp').innerText = "GAP";
        document.getElementById('card-inf').innerText = "GAP";
    }
    
    const matches = predictions.filter(p => clean(p.country) === cKey);
    const panel = document.getElementById('intel-panel');
    if (matches.length > 0) {
        panel.style.display = 'flex';
        document.getElementById('intel-body').innerHTML = matches.map(p => `
            <div style="padding:15px; border-bottom:1px solid #334155;">
                <b style="color:var(--accent);">${p.title}</b><br>
                <small>${p.desc}</small>
            </div>`).join('');
    } else { panel.style.display = 'none'; }
    document.getElementById('hover-card').style.display = 'block';
}

function setupSearch() {
    const search = new window.GeoSearch.GeoSearchControl({
        provider: new window.GeoSearch.OpenStreetMapProvider(),
        style: 'bar',
        container: document.getElementById('search-anchor'),
        showMarker: false
    });
    map.addControl(search);
}

function closeUI() {
    isLocked = false;
    document.getElementById('intel-panel').style.display = 'none';
    document.getElementById('hover-card').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', initMap);
