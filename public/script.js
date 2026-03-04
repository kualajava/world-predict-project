let map, geoLayer, isLocked = false, predictions = [], leaderData = {};

const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

// Helper to match difficult country names
const aliases = { "unitedstates": "usa", "unitedkingdom": "uk", "russianfederation": "russia" };

async function initMap() {
    // Back to stable physical map to fix label displacement
    map = L.map('map', { zoomSnap: 0.1, attributionControl: false, zoomControl: false }).setView([20, 0], 3);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}').addTo(map);
    
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

        const pTxt = await pRes.text();
        predictions = pTxt.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const v = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            return { title: (v[2]||'').replace(/"/g,''), country: v[5], desc: (v[9]||'').replace(/"/g,''), raw: clean(line) };
        });

        // Set Ticker
        const tickerStr = predictions.map(p => `[${p.country.toUpperCase()}: ${p.title}]`).join(' +++ ');
        document.getElementById('ticker-content').innerText = tickerStr + " +++ ";
        document.getElementById('ticker-content-2').innerText = tickerStr + " +++ ";

        const geoData = await gRes.json();
        const restData = await cRes.json();

        geoLayer = L.geoJson(geoData, {
            style: { color: "#facc15", weight: 1, fillOpacity: 0.1 },
            onEachFeature: (f, l) => {
                const name = f.properties.name;
                const iso = f.id;
                const countryRef = restData.find(c => c.cca3 === iso || clean(c.name.common) === clean(name));
                
                // Centered Icons
                const count = predictions.filter(p => p.raw.includes(clean(name))).length;
                if (count > 0) {
                    L.marker(l.getBounds().getCenter(), {
                        icon: L.divIcon({ className: 'prediction-icon', html: count, iconSize: [24, 24] })
                    }).addTo(map).on('click', () => updateUI(name, countryRef, iso));
                }

                l.on({
                    mouseover: () => { if(!isLocked) updateUI(name, countryRef, iso); },
                    click: (e) => { isLocked = true; updateUI(name, countryRef, iso); L.DomEvent.stopPropagation(e); }
                });
            }
        }).addTo(map);
    } catch (e) { console.error(e); }
}

async function updateUI(name, d, iso) {
    const cKey = clean(name);
    document.getElementById('card-name').innerText = name;
    document.getElementById('card-flag').src = d?.flags?.png || "";
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "--";
    
    // Leader matching
    document.getElementById('card-leader').innerText = leaderData[cKey] || leaderData[aliases[cKey]] || "Intel Pending";

    // Economic Data
    try {
        const econ = await fetch(`/api/economics/${iso}`).then(r => r.json());
        document.getElementById('card-gdp').innerText = econ.gdp?.length ? `$${(econ.gdp.find(v=>v.value).value/1e12).toFixed(2)}T` : "GAP";
        document.getElementById('card-inf').innerText = econ.inflation?.length ? `${econ.inflation.find(v=>v.value).value.toFixed(1)}%` : "GAP";
    } catch {
        document.getElementById('card-gdp').innerText = "GAP";
        document.getElementById('card-inf').innerText = "GAP";
    }

    const matches = predictions.filter(p => p.raw.includes(cKey));
    const panel = document.getElementById('intel-panel');
    if (matches.length > 0) {
        panel.style.display = 'flex';
        document.getElementById('intel-title').innerText = name.toUpperCase();
        document.getElementById('intel-body').innerHTML = matches.map(p => `
            <div style="padding:12px; border-bottom:1px solid #334155;">
                <b style="color:var(--accent);">${p.title}</b><br><small>${p.desc}</small>
            </div>`).join('');
    } else { panel.style.display = 'none'; }
    document.getElementById('hover-card').style.display = 'flex';
}

function setupSearch() {
    const searchControl = new window.GeoSearch.GeoSearchControl({
        provider: new window.GeoSearch.OpenStreetMapProvider(),
        style: 'bar',
        container: document.getElementById('search-anchor'),
        showMarker: false,
        autoClose: true,
        keepResult: true
    });
    map.addControl(searchControl);
}

function closeUI() {
    isLocked = false;
    document.getElementById('intel-panel').style.display = 'none';
    document.getElementById('hover-card').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', initMap);
