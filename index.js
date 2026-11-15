async function processLocation(lat, lon) {
    document.getElementById('coordinates').innerText = `Latitude: ${lat}, Longitude: ${lon}`;

    document.getElementById('coordinates').innerText = `Latitude: ${lat}, Longitude: ${lon}`;
    const date = new Date();

    const dateString = `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()-2}`;//use 2 days ago's date to because there's no more recent data
    console.log(`https://power.larc.nasa.gov/api/temporal/daily/point?start=${dateString}&end=${dateString}&latitude=${lat}&longitude=${lon}&community=ag&parameters=T2M%2CGWETPROF%2CGWETTOP%2CEVLAND%2CIMERG_PRECTOT%2CPRMC%2CTSOIL1%2CTSOIL2%2CTSOIL3%2CGDD4_4%2CGDD7_2%2CPRECTOTCORR%2CALLSKY_SFC_SW_DWN&format=json&units=imperial&header=true&time-standard=utc`)
    const apiResponce = JSON.parse(await (await fetch(`https://power.larc.nasa.gov/api/temporal/daily/point?start=${dateString}&end=${dateString}&latitude=${lat}&longitude=${lon}&community=ag&parameters=T2M%2CGWETPROF%2CGWETTOP%2CEVLAND%2CIMERG_PRECTOT%2CPRMC%2CTSOIL1%2CTSOIL2%2CTSOIL3%2CGDD4_4%2CGDD7_2%2CPRECTOTCORR%2CALLSKY_SFC_SW_DWN&format=json&units=imperial&header=true&time-standard=utc`)).text());
    const [T2M, GWETPROF, GWETTOP, EVLAND, IMERG_PRECTOT, PRMC, TSOIL1, TSOIL2, TSOIL3, GDD4_4, GDD7_2, precipitation, sunlight] =Object.values(apiResponce.properties.parameter).map((v) => v[dateString]).map(v => v == -999 ? undefined : v);
    console.log(`T2M: ${T2M}, GWETPROF: ${GWETPROF}, GWETTOP: ${GWETTOP}, EVLAND: ${EVLAND}, IMERG_PRECTOT: ${IMERG_PRECTOT}, PRMC: ${PRMC}, TSOIL1: ${TSOIL1}, TSOIL2: ${TSOIL2}, TSOIL3: ${TSOIL3}, GDD4_4: ${GDD4_4}, GDD7_2: ${GDD7_2}`);
    document.getElementById('output').innerText = `T2M: ${T2M}, GWETPROF: ${GWETPROF}, GWETTOP: ${GWETTOP}, EVLAND: ${EVLAND}, IMERG_PRECTOT: ${IMERG_PRECTOT}, PRMC: ${PRMC}, TSOIL1: ${TSOIL1}, TSOIL2: ${TSOIL2}, TSOIL3: ${TSOIL3}, GDD4_4: ${GDD4_4}, GDD7_2: ${GDD7_2}, precipitation: ${precipitation}, sunlight: ${sunlight}`;
    document.getElementById('coordinates').innerText = `Latitude: ${lat}, Longitude: ${lon}`;
    calcSoilHealth(GWETTOP, GWETPROF);
    avgSoilTemp(TSOIL1, TSOIL2, TSOIL3);
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

    function updateCoordinates(latlng) {
        
        marker.setLatLng([Math.min(Math.max(latlng.lat, -90), 90), Math.min(Math.max(latlng.lng, -180), 180)]);
    }
    map.on('click', function(e) {
        updateCoordinates(e.latlng);
    });
    marker.on('dragend', function(e) {
        var latlng = marker.getLatLng();
        updateCoordinates(latlng)
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
    document.getElementById('confirmLocationButton').addEventListener('drag', function() {
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

function calcSoilHealth(par1, par2){
    heatlth = 0;
    const w1 = 0.3;
    const w2 = 0.7;
    health = w1 * (par1) + w2 * (par2);

    if (health > 0.6) {
        health = "Optimal condition";
    } else if ((health <= 0.6) && (health > 0.3)) {
        health = "Moderate stress, monitor irrigation";
    } else if ((health <= 0.3) && (health > 0)) {
        health = "Critical stress, risk of soil compactions and crop wilting";
    }
    document.getElementById('soilHealth').innerText = `Soil Health: ${health}`;
}

function avgSoilTemp(par1, par2, par3){
    avgTemp = (((par1 + par2 + par3) / 3)).toFixed(2);
    document.getElementById('avgSoilTemp').innerText = `Average Soil Temperature(0.018-0.6799m deep): ${avgTemp} °F`;
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