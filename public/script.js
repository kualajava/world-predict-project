// ... [Keep existing variables and clean() function] ...

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
            // cleanRow stores the FULL CSV LINE for deep searching
            return { title: (v[2]||'').replace(/"/g,''), country: v[5], desc: (v[9]||'').replace(/"/g,''), cleanRow: clean(line) };
        });

        // SET UP SEAMLESS TICKER
        const tickerString = predictions.slice(-15).map(p => `${p.country.toUpperCase()}: ${p.title}`).join('  •  ') + "  •  ";
        document.getElementById('ticker-content').innerText = tickerString;
        document.getElementById('ticker-content-2').innerText = tickerString;

        // ... [Rest of data processing] ...
        
        setupSearch(); 
    } catch (e) { console.error("System Malfunction:", e); }
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
            // DEEP SEARCH: Checks name OR any field in the prediction row
            const deepMatch = predictions.some(p => p.cleanRow.includes(q) && (p.cleanRow.includes(name) || name.includes(clean(p.country))));
            
            if (name.includes(q) || deepMatch) {
                l.setStyle({fillOpacity: 0.4, fillColor: '#facc15', color: '#facc15', weight: 2});
            } else {
                l.setStyle({fillOpacity: 0, color: "rgba(255,255,255,0.1)", weight: 1});
            }
        });
    });
}
