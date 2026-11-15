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
    let forecast = null;
    try {
        const forecastResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,shortwave_radiation_sum,rain_sum&forecast_days=16`);
        if (!forecastResponse.ok) throw new Error(`Open-Meteo request failed (${forecastResponse.status})`);
        const forecastResponseData = await forecastResponse.json();
        forecast = forecastResponseData.daily;
    } catch (error) {
        console.error(error);
    }
    const { T2M, GWETPROF, GWETTOP, PRMC, TSOIL1, TSOIL2, TSOIL3, IMERG_PRECTOT, PRECTOTCORR, ALLSKY_SFC_SW_DWN } = data;
    const format = (value, unit = '') => value === null ? 'unavailable' : `${Number(value).toFixed(2)}${unit}`;
    const forecastSummary = forecast && Array.isArray(forecast.rain_sum)
        ? ` | Forecast 7-day rain ${forecast.rain_sum.slice(0, 7).reduce((sum, value) => sum + value, 0).toFixed(1)} mm`
        : '';
    document.getElementById('output').innerText = `Air ${format(T2M, ' °F')} | Surface wetness ${format(GWETTOP)} | Root-zone wetness ${format(GWETPROF)} | Soil moisture ${format(PRMC)} | Rain ${format(PRECTOTCORR ?? IMERG_PRECTOT, ' mm')} | Sunlight ${format(ALLSKY_SFC_SW_DWN, ' kWh/m²')}${forecastSummary}`;
    const soilHealth = calcSoilHealth(GWETTOP, GWETPROF);
    const averageTemperature = avgSoilTemp(TSOIL1, TSOIL2, TSOIL3);
    renderRecommendations(data, soilHealth, averageTemperature, forecast);
    document.getElementById('dashboard').style.display = 'block';
    const forecastDate = forecast && forecast.time && forecast.time[0];
    document.getElementById('recommendationIntro').innerText = forecast
        ? `Based on NASA's ${dateString} record and the Open-Meteo forecast from ${forecastDate}. Confirm conditions in the field before acting.`
        : `Based on NASA's ${dateString} record. The weather forecast is unavailable; confirm conditions before acting.`;
}

function updateConfirmButtonLayout() {
    const button = document.getElementById('confirmLocationButton');
    if (button) {
        button.classList.toggle('full-width', window.innerHeight > window.innerWidth);
    }
}

window.addEventListener('resize', updateConfirmButtonLayout);
updateConfirmButtonLayout();

function renderRecommendations(data, soilHealth, averageTemperature, forecast) {
    const recommendations = [];
    const add = (level, title, text) => recommendations.push(`<li class="${level}"><strong>${title}:</strong> ${text}</li>`);
    const forecastValues = (name, days) => {
        const values = forecast && forecast[name];
        return Array.isArray(values) ? values.slice(0, days).filter((value) => Number.isFinite(value)) : [];
    };
    const nextThreeDaysRain = forecastValues('rain_sum', 3).reduce((sum, value) => sum + value, 0);
    const nextSevenDaysRain = forecastValues('rain_sum', 7).reduce((sum, value) => sum + value, 0);
    const nextSevenDaysMin = forecastValues('temperature_2m_min', 7);
    const nextSevenDaysMax = forecastValues('temperature_2m_max', 7);
    const forecastHasFrost = nextSevenDaysMin.some((value) => value <= 0);
    const forecastHasHeat = nextSevenDaysMax.some((value) => value >= 35);
    if (soilHealth === null) {
        add('watch', 'Irrigation', 'Soil wetness data is unavailable; inspect moisture at root depth before irrigating.');
    } else if (soilHealth < 0.3) {
        add('urgent', 'Irrigation', 'Root-zone conditions are critically dry. Prioritize irrigation or drought protection, then recheck moisture before planting.');
    } else if (soilHealth <= 0.6) {
        add('watch', 'Irrigation', 'Moisture is moderate. Inspect the root zone and use a measured irrigation cycle rather than irrigating on a fixed schedule.');
    } else if (forecast && nextSevenDaysRain >= 15) {
        add('good', 'Irrigation', `Moisture is favorable and ${nextSevenDaysRain.toFixed(1)} mm of rain is forecast in the next 7 days. Delay routine irrigation and reassess after the rain.`);
    } else if (forecast && nextSevenDaysRain < 5) {
        add('watch', 'Irrigation', `Only ${nextSevenDaysRain.toFixed(1)} mm of rain is forecast in the next 7 days. Monitor root-zone moisture closely and prepare a measured irrigation cycle.`);
    } else {
        add('good', 'Irrigation', 'Moisture is favorable. Delay routine irrigation unless field observations or the forecast indicate demand.');
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
    if (!forecast) {
        add('watch', 'Forecast confidence', 'The weather forecast could not be loaded, so future rain and temperature risks are not included.');
    } else {
        if (nextThreeDaysRain >= 10) {
            add('watch', 'Field access', `${nextThreeDaysRain.toFixed(1)} mm of rain is forecast in the next 3 days. Delay heavy equipment and check soil workability before entering the field.`);
        }
        if (forecastHasFrost) {
            add('urgent', 'Frost protection', 'Freezing temperatures are forecast within 7 days. Protect sensitive crops and avoid planting frost-sensitive crops without a protection plan.');
        }
        if (forecastHasHeat) {
            add('watch', 'Heat preparation', 'Temperatures of at least 35 °C (95 °F) are forecast within 7 days. Check irrigation capacity, mulch exposed soil, and plan work for cooler hours.');
        }
        if (nextSevenDaysRain < 5 && nextSevenDaysMax.length > 0) {
            add('watch', 'Planting window', 'The next 7 days are forecast to be relatively dry. This may improve field access, but confirm irrigation capacity before planting.');
        }
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