async function processLocation(lat, lon) {
    const date = new Date();
    date.setDate(date.getDate() - 2);
    const dateString = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const parameters = 'T2M,GWETPROF,GWETTOP,EVLAND,IMERG_PRECTOT,PRMC,TSOIL1,TSOIL2,TSOIL3,GDD4_4,GDD7_2,PRECTOTCORR,ALLSKY_SFC_SW_DWN';
    const response = await fetch(`https://power.larc.nasa.gov/api/temporal/daily/point?start=${dateString}&end=${dateString}&latitude=${lat}&longitude=${lon}&community=ag&parameters=${parameters}&format=json&units=imperial&header=true&time-standard=utc`);
    if (!response.ok) throw new Error(`NASA POWER request failed (${response.status})`);
    const apiResponse = await response.json();
    const values = apiResponse.properties.parameter;
    const valueFor = (name) => {
        const value = values[name] && values[name][dateString];
        return value === -999 || value === undefined ? null : value;
    };
    const data = Object.fromEntries(parameters.split(',').map((name) => [name, valueFor(name)]));
    const { T2M, GWETPROF, GWETTOP, PRMC, TSOIL1, TSOIL2, TSOIL3, IMERG_PRECTOT, PRECTOTCORR, ALLSKY_SFC_SW_DWN } = data;
    const format = (value, unit = '') => value === null ? 'unavailable' : `${Number(value).toFixed(2)}${unit}`;
    document.getElementById('output').innerText = `Air ${format(T2M, ' °F')} | Surface wetness ${format(GWETTOP)} | Root-zone wetness ${format(GWETPROF)} | Soil moisture ${format(PRMC)} | Rain ${format(PRECTOTCORR ?? IMERG_PRECTOT, ' mm')} | Sunlight ${format(ALLSKY_SFC_SW_DWN, ' kWh/m²')}`;
    const soilHealth = calcSoilHealth(GWETTOP, GWETPROF);
    const averageTemperature = avgSoilTemp(TSOIL1, TSOIL2, TSOIL3);
    renderRecommendations(data, soilHealth, averageTemperature);
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('recommendationIntro').innerText = `Based on recent NASA records. Confirm conditions in the field before acting.`;
}

function renderRecommendations(data, soilHealth, averageTemperature) {
    const recommendations = [];
    const add = (level, title, text) => recommendations.push(`<li class="${level}"><strong>${title}:</strong> ${text}</li>`);
    if (soilHealth === null) {
        add('watch', 'Irrigation', 'Soil wetness data is unavailable; inspect moisture at root depth before irrigating.');
    } else if (soilHealth < 0.3) {
        add('urgent', 'Irrigation', 'Root-zone conditions are critically dry. Prioritize irrigation or drought protection, then recheck moisture before planting.');
    } else if (soilHealth <= 0.6) {
        add('watch', 'Irrigation', 'Moisture is moderate. Inspect the root zone and use a measured irrigation cycle rather than irrigating on a fixed schedule.');
    } else {
        add('good', 'Irrigation', 'Moisture is favorable. Delay routine irrigation unless a crop-specific sensor or forecast indicates demand.');
    }
    if (soilHealth !== null && soilHealth > 0.6) {
        add('watch', 'Field access', 'Wet soil is more prone to compaction. Keep heavy equipment off the field until the surface firms.');
    } else {
        add('good', 'Field access', 'Current wetness does not indicate a high compaction risk, but avoid traffic immediately after irrigation.');
    }
    if (averageTemperature !== null && averageTemperature < 50) {
        add('watch', 'Planting', 'Average soil temperature is cool. Delay warm-season planting or use row covers until the crop-specific minimum is reached.');
    } else if (averageTemperature !== null && averageTemperature > 86) {
        add('urgent', 'Heat stress', 'Soil is very warm. Favor heat-tolerant varieties, mulch, and early/late irrigation to limit evaporation.');
    } else {
        add('good', 'Planting', 'Average soil temperature is within a broadly workable range; verify the target crop threshold before planting.');
    }
    if (data.PRECTOTCORR !== null && data.PRECTOTCORR > 25) {
        add('watch', 'Field operations', 'Recent rainfall is substantial. Check drainage and wait for workable soil before tillage or machinery use.');
    }
    document.getElementById('recommendationList').innerHTML = recommendations.join('');
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
        processLocation(latlng.lat, latlng.lng).catch(showDataError);


    });
    document.getElementById('confirmLocationButton').addEventListener('drag', function() {
        var latlng = marker.getLatLng();
        map.remove();
        document.getElementById('map').remove();
        document.getElementById('locationHeading').remove();
        document.getElementById('confirmLocationButton').remove();
        window.location.search = `?lat=${latlng.lat}&lon=${latlng.lng}`;
        processLocation(latlng.lat, latlng.lng).catch(showDataError);


    });
}
function initDefaultMap() {
    initMap(38.75, -76.29, 2);
}

function calcSoilHealth(par1, par2){
    if (par1 === null || par2 === null) {
        document.getElementById('soilHealth').innerText = 'Soil Health: unavailable';
        return null;
    }
    const w1 = 0.3;
    const w2 = 0.7;
    const health = w1 * par1 + w2 * par2;
    const status = health > 0.6 ? 'Optimal condition' : health > 0.3 ? 'Moderate stress' : 'Critical stress';
    document.getElementById('soilHealth').innerText = `Soil Health: ${status} (index ${health.toFixed(2)})`;
    return health;
}

function avgSoilTemp(par1, par2, par3){
    const temperatures = [par1, par2, par3].filter((value) => value !== null);
    if (!temperatures.length) {
        document.getElementById('avgSoilTemp').innerText = 'Average soil temperature: unavailable';
        return null;
    }
    const average = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length;
    document.getElementById('avgSoilTemp').innerText = `Average soil temperature (0.018-0.6799m): ${average.toFixed(2)} °F`;
    return average;
}

function showDataError(error) {
    console.error(error);
    document.getElementById('output').innerText = 'Unable to load field data. Check your connection and try again.';
    document.getElementById('recommendationIntro').innerText = 'No recommendation can be made until field data is available.';
    document.getElementById('recommendationList').innerHTML = '';
}




const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('lat') && urlParams.has('lon')) {
    const lat = parseFloat(urlParams.get('lat'));
    const lon = parseFloat(urlParams.get('lon'));
    document.getElementById('map').remove();
    document.getElementById('locationHeading').remove();
    document.getElementById('confirmLocationButton').remove();
    processLocation(lat, lon).catch(showDataError);
} else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
        initMap(position.coords.latitude, position.coords.longitude, 18);
    }, function(error) {
        initDefaultMap();
    });
} else {
    initDefaultMap();
}