let map, geoLayer, isLocked = false, predictions = [], leaderData = {};

const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

async function initMap() {
    map = L.map('map', { zoomSnap: 0.1, attributionControl: false, zoomControl: false }).setView([20, 0], 3);
    
    // Tactical Theme: Dark Map with Labels on top
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{y}/{x}{r}.png').addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{y}/{x}{r}.png', { opacity: 0.6 }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    await loadData();
    setupSearch();
}

async function loadData() {
    try {
        const [pRes, lRes, gRes, cRes] = await Promise.all([
            fetch('/api/data/predictions.csv'),
            fetch('/api/data/leaders.csv'),
            fetch('https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson'),
            fetch('https://restcountries.com/v3.1/all?fields=name,cca3,flags,population')
        ]);

        // Process Leaders
        const lTxt = await lRes.text();
        lTxt.split('\n').forEach(line => {
            const parts = line.split(',');
            if(parts.length >= 2) leaderData[clean(parts[0])] = parts[1].trim();
        });

        // Process Predictions
        const pTxt = await pRes.text();
        predictions = pTxt.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const v = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            return { title: (v[2]||'').replace(/"/g,''), country: v[5], desc: (v[9]||'').replace(/"/g,''), raw: clean(line) };
        });

        // Set Ticker Content
        const tickerContent = predictions.map(p => `[${p.country.toUpperCase()}: ${p.title}]`).join(' --- ');
        document.getElementById('ticker-content').innerText = tickerContent + " --- ";
        document.getElementById('ticker-content-2').innerText = tickerContent + " --- ";

        const geoData = await gRes.json();
        const restData = await cRes.json();

        geoLayer = L.geoJson(geoData, {
            style: (f) => ({
                color: "#facc15", weight: 1, fillOpacity: 0.1, fillColor: '#facc15'
            }),
            onEachFeature: (f, l) => {
                const name = f.properties.name;
                const d = restData.find(c => clean(c.name.common) === clean(name) || c.cca3 === f.id);
                
                // Add Prediction Count Icons
                const count = predictions.filter(p => clean(p.country) === clean(name)).length;
                if (count > 0) {
                    const center = l.getBounds().getCenter();
                    L.marker(center, {
                        icon: L.divIcon({
                            className: 'prediction-icon',
                            html: count,
                            iconSize: [24, 24]
                        })
                    }).addTo(map).on('click', () => updateUI(name, d, f.id));
                }

                l.on({
                    mouseover: () => { if(!isLocked) updateUI(name, d, f.id); },
                    click: (e) => { isLocked = true; updateUI(name, d, f.id); L.DomEvent.stopPropagation(e); }
                });
            }
        }).addTo(map);

    } catch (e) { console.error("Data Load Failed:", e); }
}

async function updateUI(name, d, iso) {
    const cKey = clean(name);
    document.getElementById('card-name').innerText = name;
    document.getElementById('card-leader').innerText = leaderData[cKey] || "Intel Pending";
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "--";
    document.getElementById('card-flag').src = d?.flags?.png || "";

    // Economic Fetch - Using ISO code for precision
    try {
        const econ = await fetch(`/api/economics/${iso}`).then(r => r.json());
        document.getElementById('card-gdp').innerText = econ.gdp && econ.gdp.length ? `$${(econ.gdp.find(v=>v.value).value/1e12).toFixed(2)}T` : "GAP";
        document.getElementById('card-inf').innerText = econ.inflation && econ.inflation.length ? `${econ.inflation.find(v=>v.value).value.toFixed(1)}%` : "GAP";
    } catch {
        document.getElementById('card-gdp').innerText = "GAP";
        document.getElementById('card-inf').innerText = "GAP";
    }
    
    const matches = predictions.filter(p => clean(p.country) === cKey);
    const panel = document.getElementById('intel-panel');
    if (matches.length > 0) {
        panel.style.display = 'flex';
        document.getElementById('intel-title').innerText = name.toUpperCase() + " INTEL";
        document.getElementById('intel-body').innerHTML = matches.map(p => `
            <div style="padding:15px; border-bottom:1px solid #1e293b;">
                <b style="color:var(--accent);">${p.title}</b><br>
                <small style="color:#94a3b8;">${p.desc}</small>
            </div>`).join('');
    } else { panel.style.display = 'none'; }
    document.getElementById('hover-card').style.display = 'block';
}

function setupSearch() {
    const provider = new window.GeoSearch.OpenStreetMapProvider();
    const searchControl = new window.GeoSearch.GeoSearchControl({
        provider: provider,
        style: 'bar',
        container: document.getElementById('search-anchor'),
        showMarker: false,
        autoClose: true
    });
    map.addControl(searchControl);
}

function closeUI() {
    isLocked = false;
    document.getElementById('intel-panel').style.display = 'none';
    document.getElementById('hover-card').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', initMap);
