async function processLocation(lat, lon) {
    document.getElementById('coordinates').innerText = `Latitude: ${lat}, Longitude: ${lon}`;

    document.getElementById('coordinates').innerText = `Latitude: ${lat}, Longitude: ${lon}`;
    const date = new Date();

    const dateString = `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()-2}`;//use 2 days ago's date to because there's no more recent data
    const apiResponce = JSON.parse(await (await fetch(`https://power.larc.nasa.gov/api/temporal/daily/point?start=${dateString}&end=${dateString}&latitude=${lat}&longitude=${lon}&community=ag&parameters=T2M%2CGWETPROF%2CGWETTOP%2CEVLAND%2CIMERG_PRECTOT%2CPRMC%2CTSOIL1%2CTSOIL2%2CTSOIL3%2CGDD4_4%2CGDD7_2&format=json&units=imperial&header=true&time-standard=utc`)).text());
    const [T2M, GWETPROF, GWETTOP, EVLAND, IMERG_PRECTOT, PRMC, TSOIL1, TSOIL2, TSOIL3, GDD4_4, GDD7_2] =Object.values(apiResponce.properties.parameter).map((v) => v[dateString]).map(v => v == -999 ? undefined : v);
    console.log(`T2M: ${T2M}, GWETPROF: ${GWETPROF}, GWETTOP: ${GWETTOP}, EVLAND: ${EVLAND}, IMERG_PRECTOT: ${IMERG_PRECTOT}, PRMC: ${PRMC}, TSOIL1: ${TSOIL1}, TSOIL2: ${TSOIL2}, TSOIL3: ${TSOIL3}, GDD4_4: ${GDD4_4}, GDD7_2: ${GDD7_2}`);
    document.getElementById('output').innerText = `T2M: ${T2M}, GWETPROF: ${GWETPROF}, GWETTOP: ${GWETTOP}, EVLAND: ${EVLAND}, IMERG_PRECTOT: ${IMERG_PRECTOT}, PRMC: ${PRMC}, TSOIL1: ${TSOIL1}, TSOIL2: ${TSOIL2}, TSOIL3: ${TSOIL3}, GDD4_4: ${GDD4_4}, GDD7_2: ${GDD7_2}`;
    document.getElementById('coordinates').innerText = `Latitude: ${lat}, Longitude: ${lon}`;
    calcSoilHealth();
}

function initMap(lat, lon, zoom) {
    var map = L.map('map').setView({lon, lat}, zoom);
    document.getElementById('map').children[0].remove();
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        noWrap: true,
        maxZoom: 19,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map);

    L.control.scale({imperial: true, metric: true}).addTo(map)

      
    marker = new L.Marker([lat, lon], {draggable: true, autoPan: true}).addTo(map);

    map.on('click', function(e) {
        marker.setLatLng(e.latlng);
    });
    document.getElementById('confirmLocationButton').addEventListener('click', function() {
        var latlng = marker.getLatLng();
        map.remove();
        document.getElementById('map').remove();
        document.getElementById('locationHeading').remove();
        document.getElementById('confirmLocationButton').remove();
        window.location.search = `?lat=${latlng.lat}&lon=${latlng.lng}`;
        processLocation(latlng.lat, latlng.lng);


    });
}
function initDefaultMap() {
    initMap(38.75, -76.29, 2);
}

function calcSoilHealth(){
    heatlth = 0;
    const w1 = 0.3;
    const w2 = 0.7;
    health = w1 * (GWETTOP) + w2 * (GWETPROF);


    document.getElementById('soilHealth').innerText = `Soil Health: ${health}`;
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('lat') && urlParams.has('lon')) {
    const lat = parseFloat(urlParams.get('lat'));
    const lon = parseFloat(urlParams.get('lon'));
    document.getElementById('map').remove();
    document.getElementById('locationHeading').remove();
    document.getElementById('confirmLocationButton').remove();
    processLocation(lat, lon);
} else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
        initMap(position.coords.latitude, position.coords.longitude, 18);
    }, function(error) {
        initDefaultMap();
    });
} else {
    initDefaultMap();
}