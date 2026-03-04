let map, geoLayer, isLocked = false, predictions = [], leaders = {};

const clean = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

function initMap() {
    map = L.map('map', { zoomSnap: 0.1, attributionControl: false, zoomControl: false }).setView([20, 0], 3);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}').addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    loadData();
}

async function loadData() {
    try {
        const [pRes, gRes, cRes, lRes] = await Promise.all([
            fetch('/api/data/predictions.csv'),
            fetch('https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson'),
            fetch('https://restcountries.com/v3.1/all?fields=name,cca3,flags,population,currencies'),
            fetch('/api/data/leaders.csv').then(r => r.text()).catch(() => "")
        ]);

        const pTxt = await pRes.text();
        predictions = pTxt.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const v = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            return { title: (v[2]||'').replace(/"/g,''), country: v[5], desc: (v[9]||'').replace(/"/g,''), raw: clean(line) };
        });

        const tickerStr = predictions.slice(-10).map(p => `${p.country.toUpperCase()}: ${p.title}`).join('  •  ') + "  •  ";
        document.getElementById('ticker-content').innerText = tickerStr;
        document.getElementById('ticker-content-2').innerText = tickerStr;

        const geoData = await gRes.json();
        const restData = await cRes.json();

        geoLayer = L.geoJson(geoData, {
            style: (f) => ({
                color: "rgba(255,255,255,0.1)", weight: 1, 
                fillOpacity: predictions.some(p => clean(p.country) === clean(f.properties.name)) ? 0.3 : 0,
                fillColor: '#facc15'
            }),
            onEachFeature: (f, l) => {
                const name = f.properties.name;
                const d = restData.find(c => c.name.common === name || c.cca3 === f.id);
                l.on({
                    mouseover: () => { if(!isLocked) updateUI(name, d); },
                    click: (e) => { isLocked = true; updateUI(name, d); L.DomEvent.stopPropagation(e); }
                });
            }
        }).addTo(map);

        setupSearch();
    } catch (e) { console.error("Critical System Failure", e); }
}

function updateUI(name, d) {
    document.getElementById('card-name').innerText = name;
    document.getElementById('card-pop').innerText = d ? d.population.toLocaleString() : "--";
    document.getElementById('card-flag').src = d?.flags?.png || "";
    
    const matches = predictions.filter(p => clean(p.country) === clean(name));
    const panel = document.getElementById('intel-panel');
    
    if (matches.length > 0) {
        panel.style.display = 'flex';
        document.getElementById('intel-title').innerText = name.toUpperCase() + " INTEL";
        document.getElementById('intel-body').innerHTML = matches.map(p => `
            <div style="padding:10px; border-bottom:1px solid #334155;">
                <b style="color:var(--accent); display:block;">${p.title}</b>
                <small style="color:#94a3b8;">${p.desc}</small>
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
