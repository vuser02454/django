// Initialize Map
let map = L.map('map').setView([51.505, -0.09], 13);
let userMarker = null;
let searchMarkers = [];
let popularPlacesMarkers = [];
let currentAccuracy = 0;
let crowdIntensityAreas = [];
let heatmapLayers = []; // Store heatmap overlay layers
let radiusCircle = null; // Store the 5km radius circle
// Popular places panel DOM references
let popularPlacesPanel = document.getElementById('popular-places-panel');
let popularPlacesList = document.getElementById('popular-places-list');
let popularPlacesCloseBtn = document.getElementById('popular-places-close');

// Base tile layer (switched by theme)
let baseTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Wire up close button for popular places panel
if (popularPlacesCloseBtn && popularPlacesPanel) {
    popularPlacesCloseBtn.addEventListener('click', () => {
        popularPlacesPanel.style.display = 'none';
    });
}

// Update accuracy meter (safe if elements missing)
function updateAccuracyMeter(accuracy) {
    const num = Math.max(0, Math.min(100, Number(accuracy)));
    currentAccuracy = num;
    const meterFill = document.getElementById('accuracy-meter');
    const accuracyValue = document.getElementById('accuracy-value');
    if (meterFill) {
        meterFill.style.width = num + '%';
        meterFill.textContent = num + '%';
    }
    if (accuracyValue) {
        accuracyValue.textContent = num + '%';
    }
}

// Calculate accuracy based on location precision (always returns 5–100)
function calculateAccuracy(position) {
    const accuracyMeters = position.coords.accuracy;
    if (!accuracyMeters || accuracyMeters <= 0) return 95;
    // Better precision (smaller radius) => higher %. Cap so we never show 0 when we have a fix.
    const rawPercent = Math.max(0, 100 - (accuracyMeters / 2));
    return Math.round(Math.max(5, Math.min(100, rawPercent)));
}

// --- Utility: debounce ---
function debounce(fn, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Search Location (button)
document.getElementById('search-btn').addEventListener('click', async function() {
    const query = document.getElementById('location-search').value.trim();
    if (!query) {
        alert('Please enter a location to search');
        return;
    }
    
    try {
        const response = await fetch('/search-location/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({ query: query })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Clear previous search markers
            searchMarkers.forEach(marker => map.removeLayer(marker));
            searchMarkers = [];
            
            // Add markers for search results
            data.results.forEach((result, index) => {
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                
                const marker = L.marker([lat, lon], {
                    icon: L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    })
                }).addTo(map)
                    .bindPopup(`<b>${result.display_name}</b><br><button onclick="selectSearchResult(${lat}, ${lon})" style="margin-top: 5px; padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;">Select This Location</button>`);
                
                searchMarkers.push(marker);
            });
            
            // Center map on first result
            if (data.results.length > 0) {
                const firstResult = data.results[0];
                const lat = parseFloat(firstResult.lat);
                const lon = parseFloat(firstResult.lon);
                map.setView([lat, lon], 15);
                updateAccuracyMeter(85); // Mock accuracy for search results
                
                // Update form coordinates
                document.getElementById('id_latitude').value = lat;
                document.getElementById('id_longitude').value = lon;
                
                // Automatically find popular places around the searched location
                await findPopularPlaces(lat, lon, false);
                await updateCrowdIntensityDropdown(lat, lon);
            }
        } else {
            alert('Error searching location: ' + (data.error || data.message));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error searching location');
    }
});

// Enter key for search
document.getElementById('location-search').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('search-btn').click();
    }
});

// --- Autocomplete for top search field ---
const locationSearchInput = document.getElementById('location-search');
const locationSuggestions = document.getElementById('location-suggestions');

async function fetchAutocompleteSuggestions(query, targetListElement) {
    if (!query || query.length < 3) {
        targetListElement.innerHTML = '';
        targetListElement.style.display = 'none';
        return;
    }

    try {
        const response = await fetch('/autocomplete-location/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({ query })
        });

        const data = await response.json();
        if (!data.success) {
            targetListElement.innerHTML = '';
            targetListElement.style.display = 'none';
            return;
        }

        const results = data.results || [];
        if (!results.length) {
            targetListElement.innerHTML = '';
            targetListElement.style.display = 'none';
            return;
        }

        targetListElement.innerHTML = '';
        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = result.display_name;
            item.addEventListener('click', async () => {
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);

                locationSearchInput.value = result.display_name;
                targetListElement.innerHTML = '';
                targetListElement.style.display = 'none';

                // Center map and drop marker
                map.setView([lat, lon], 15);
                if (userMarker) {
                    map.removeLayer(userMarker);
                }
                userMarker = L.marker([lat, lon]).addTo(map)
                    .bindPopup('Selected Location').openPopup();

                // Update hidden coords, accuracy meter, and crowd intensity
                document.getElementById('id_latitude').value = lat;
                document.getElementById('id_longitude').value = lon;
                updateAccuracyMeter(85);
                // Automatically find popular places around the searched location
                await findPopularPlaces(lat, lon, false);
                await updateCrowdIntensityDropdown(lat, lon);
            });
            targetListElement.appendChild(item);
        });
        targetListElement.style.display = 'block';
    } catch (err) {
        console.error('Autocomplete error:', err);
        targetListElement.innerHTML = '';
        targetListElement.style.display = 'none';
    }
}

locationSearchInput.addEventListener('input', debounce(function () {
    fetchAutocompleteSuggestions(this.value.trim(), locationSuggestions);
}, 300));

// Hide suggestions when clicking outside
document.addEventListener('click', function (e) {
    if (!locationSuggestions.contains(e.target) && e.target !== locationSearchInput) {
        locationSuggestions.innerHTML = '';
        locationSuggestions.style.display = 'none';
    }
});

// Find My Location
document.getElementById('find-location-btn').addEventListener('click', function() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        async function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            // Remove previous user marker
            if (userMarker) {
                map.removeLayer(userMarker);
            }
            
            // Add user marker
            userMarker = L.marker([lat, lon]).addTo(map)
                .bindPopup('Your Location').openPopup();
            
            // Center map on user location
            map.setView([lat, lon], 15);
            
            // Update accuracy meter
            const accuracy = calculateAccuracy(position);
            updateAccuracyMeter(accuracy);
            
            // Update form coordinates
            document.getElementById('id_latitude').value = lat;
            document.getElementById('id_longitude').value = lon;
            
            // Automatically find popular places around the user's location
            await findPopularPlaces(lat, lon, false);
            await updateCrowdIntensityDropdown(lat, lon);
        },
        function(error) {
            alert('Error getting location: ' + error.message);
            updateAccuracyMeter(0);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
});

// Function to find popular places (reusable)
async function findPopularPlaces(lat, lon, showAlert = true) {
    try {
        const response = await fetch('/find-popular-places/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({ latitude: lat, longitude: lon })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Clear previous popular places markers
            popularPlacesMarkers.forEach(marker => map.removeLayer(marker));
            popularPlacesMarkers = [];
            
            // Clear previous radius circle if exists
            if (radiusCircle) {
                map.removeLayer(radiusCircle);
                radiusCircle = null;
            }
            
            // Add markers for popular places
            data.results.forEach(place => {
                let placeLat, placeLon;
                
                if (place.lat && place.lon) {
                    placeLat = place.lat;
                    placeLon = place.lon;
                } else if (place.center) {
                    placeLat = place.center.lat;
                    placeLon = place.center.lon;
                } else {
                    return;
                }
                
                const name = place.tags?.name || place.tags?.amenity || 'Popular Place';
                const amenity = place.tags?.amenity || place.tags?.shop || place.tags?.tourism || 'Unknown';
                const marker = L.marker([placeLat, placeLon], {
                    icon: L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    })
                }).addTo(map)
                    .bindPopup(`<b>${name}</b><br>Type: ${amenity}`);
                
                popularPlacesMarkers.push(marker);
            });

            // Render autocomplete-style popular places table
            renderPopularPlacesTable(data.results || [], lat, lon);
            
            // Draw circle for 5km radius (remove previous if exists)
            if (radiusCircle) {
                map.removeLayer(radiusCircle);
            }
            radiusCircle = L.circle([lat, lon], {
                radius: 5000,
                color: '#4CAF50',
                fillColor: '#4CAF50',
                fillOpacity: 0.1,
                weight: 2
            }).addTo(map);
            
            // Analyze and show crowd intensity (this will also show the heatmap)
            await updateCrowdIntensityDropdown(lat, lon);
            
            if (showAlert) {
                alert(`Found ${data.results.length} popular places within 5km`);
            }
            return { success: true, count: data.results.length };
        } else {
            if (showAlert) {
                alert('Error finding popular places: ' + (data.error || data.message));
            }
            return { success: false, error: data.error || data.message };
        }
    } catch (error) {
        console.error('Error:', error);
        if (showAlert) {
            alert('Error finding popular places');
        }
        return { success: false, error: error.message };
    }
}

// --- Popular places table rendering & synthetic crowd profiles ---

// Thresholds for people count
const CROWD_THRESHOLDS = {
    lowMax: 80,     // below medium threshold
    mediumMax: 160  // between lowMax and mediumMax = medium, above = high
};

function estimateBaseFootfall(place) {
    const tags = place.tags || {};
    const amenity = tags.amenity || '';
    const shop = tags.shop || '';
    const tourism = tags.tourism || '';
    const leisure = tags.leisure || '';

    if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'fast_food') return 110;
    if (shop === 'mall' || tourism === 'attraction') return 140;
    if (amenity === 'school' || amenity === 'college' || amenity === 'university') return 120;
    if (amenity === 'park' || leisure === 'park') return 70;

    // Default baseline
    return 90;
}

function classifyCrowd(peopleCount) {
    if (peopleCount < CROWD_THRESHOLDS.lowMax) return 'low';
    if (peopleCount < CROWD_THRESHOLDS.mediumMax) return 'medium';
    return 'high';
}

function buildCrowdProfileForPlace(place) {
    const base = estimateBaseFootfall(place);

    // Simple time-of-day multipliers (morning/afternoon/evening/night)
    const slots = [
        { id: 'morning', label: 'Morning', timeRange: '6am - 10am', multiplier: 0.55 },
        { id: 'midday', label: 'Mid‑day', timeRange: '10am - 4pm', multiplier: 0.85 },
        { id: 'evening', label: 'Evening', timeRange: '4pm - 8pm', multiplier: 1.1 },
        { id: 'night', label: 'Night', timeRange: '8pm - 11pm', multiplier: 0.65 }
    ];

    const enrichedSlots = slots.map(slot => {
        const people = Math.round(base * slot.multiplier);
        const crowd = classifyCrowd(people);
        return {
            id: slot.id,
            label: slot.label,
            timeRange: slot.timeRange,
            people,
            crowd
        };
    });

    // Best time: first slot where crowd is below medium threshold (i.e. "low")
    let best = enrichedSlots.find(s => s.crowd === 'low') || enrichedSlots[0];
    const bestTimeLabel = `${best.label} (${best.timeRange}) – best time (crowd below medium)`;

    return {
        bestTimeLabel,
        slots: enrichedSlots
    };
}

function formatAddressFromTags(tags = {}) {
    const parts = [];
    if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
    if (tags['addr:street']) parts.push(tags['addr:street']);
    if (tags['addr:neighbourhood']) parts.push(tags['addr:neighbourhood']);
    if (tags['addr:suburb']) parts.push(tags['addr:suburb']);
    if (tags['addr:city']) parts.push(tags['addr:city']);
    if (!parts.length && tags['addr:full']) parts.push(tags['addr:full']);
    return parts.join(', ');
}

function renderPopularPlacesTable(places, lat, lon) {
    if (!popularPlacesPanel || !popularPlacesList) return;

    popularPlacesList.innerHTML = '';

    if (!places.length) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'popular-place-item';
        emptyDiv.textContent = 'No popular places found within 5km.';
        popularPlacesList.appendChild(emptyDiv);
        popularPlacesPanel.style.display = 'block';
        return;
    }

    // Limit to top 8-10 items to keep UI compact
    const topPlaces = places.slice(0, 10);

    topPlaces.forEach(place => {
        const tags = place.tags || {};
        const name = tags.name || tags.amenity || tags.shop || tags.tourism || 'Popular place';
        const address = formatAddressFromTags(tags);

        const profile = buildCrowdProfileForPlace(place);

        const item = document.createElement('div');
        item.className = 'popular-place-item';

        const mainRow = document.createElement('div');
        mainRow.className = 'popular-place-main-row';

        const left = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'popular-place-name';
        nameEl.textContent = name;

        const addrEl = document.createElement('div');
        addrEl.className = 'popular-place-address';
        addrEl.textContent = address || (place.display_name || '').split(',').slice(0, 3).join(', ');

        left.appendChild(nameEl);
        left.appendChild(addrEl);

        const bestTimeEl = document.createElement('div');
        bestTimeEl.className = 'popular-place-best-time';
        bestTimeEl.textContent = profile.bestTimeLabel;

        mainRow.appendChild(left);
        mainRow.appendChild(bestTimeEl);

        const table = document.createElement('table');
        table.className = 'popular-place-timing-table';

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Time</th>
                <th>Crowd</th>
                <th>People</th>
            </tr>
        `;

        const tbody = document.createElement('tbody');
        profile.slots.forEach(slot => {
            const tr = document.createElement('tr');
            const crowdClass = slot.crowd === 'low'
                ? 'crowd-tag-low'
                : slot.crowd === 'medium'
                    ? 'crowd-tag-medium'
                    : 'crowd-tag-high';

            tr.innerHTML = `
                <td>${slot.label} (${slot.timeRange})</td>
                <td><span class="${crowdClass}">${slot.crowd}</span></td>
                <td>${slot.people}</td>
            `;
            tbody.appendChild(tr);
        });

        table.appendChild(thead);
        table.appendChild(tbody);

        item.appendChild(mainRow);
        item.appendChild(table);

        popularPlacesList.appendChild(item);
    });

    popularPlacesPanel.style.display = 'block';
}

// Find Popular Places Button
document.getElementById('popular-places-btn').addEventListener('click', async function() {
    // Check if coordinates are available from form fields or userMarker
    let lat, lon;
    
    const latInput = document.getElementById('id_latitude').value;
    const lonInput = document.getElementById('id_longitude').value;
    
    if (latInput && lonInput) {
        lat = parseFloat(latInput);
        lon = parseFloat(lonInput);
    } else if (userMarker) {
        lat = userMarker.getLatLng().lat;
        lon = userMarker.getLatLng().lng;
    } else {
        alert('Please find your location first. You can:\n1. Click on the map\n2. Use "Find My Location"\n3. Search for a location');
        return;
    }
    
    await findPopularPlaces(lat, lon, true);
});

// Map Toggle (Minimize/Maximize)
let mapMinimized = false;
document.getElementById('map-toggle-btn').addEventListener('click', function() {
    const mapContainer = document.getElementById('map-container');
    const toggleBtn = document.getElementById('map-toggle-btn');
    
    if (mapMinimized) {
        mapContainer.classList.remove('minimized');
        toggleBtn.textContent = 'Minimize Map';
        mapMinimized = false;
    } else {
        mapContainer.classList.add('minimized');
        toggleBtn.textContent = 'Maximize Map';
        mapMinimized = true;
    }
    
    // Trigger map resize
    setTimeout(() => {
        map.invalidateSize();
    }, 300);
});

// Click on map to set location
map.on('click', async function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    // Update form coordinates
    document.getElementById('id_latitude').value = lat;
    document.getElementById('id_longitude').value = lon;
    
    // Add temporary marker
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    userMarker = L.marker([lat, lon]).addTo(map)
        .bindPopup('Selected Location').openPopup();
    
    // Update accuracy (clicking on map has high accuracy)
    updateAccuracyMeter(95);
    
    // Automatically find popular places around the clicked location
    await findPopularPlaces(lat, lon, false);
    await updateCrowdIntensityDropdown(lat, lon);
});

// Chatbot WebSocket Connection
let chatSocket = null;
let chatbotMinimized = false;

function connectChatbot() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/chat/`;
    
    chatSocket = new WebSocket(wsUrl);
    
    chatSocket.onmessage = function(e) {
        const data = JSON.parse(e.data);
        addChatMessage(data.message, 'bot');
    };
    
    chatSocket.onclose = function(e) {
        console.error('Chat socket closed unexpectedly');
        setTimeout(connectChatbot, 1000);
    };
    
    chatSocket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// Add message to chatbot
function addChatMessage(message, sender) {
    const messagesContainer = document.getElementById('chatbot-messages');
    if (!messagesContainer) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chatbot-message ' + sender;
    messageDiv.textContent = message;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Chatbot send message
document.getElementById('chatbot-send').addEventListener('click', function() {
    sendChatMessage();
});

document.getElementById('chatbot-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

function sendChatMessage() {
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();
    if (!message) return;

    addChatMessage(message, 'user');
    input.value = '';

    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({ message: message }));
        return;
    }

    // HTTP fallback when WebSocket is not available
    fetch('/chat/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ message: message })
    })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            if (data.success && data.message) {
                addChatMessage(data.message, 'bot');
            } else {
                addChatMessage('Sorry, I could not respond right now. Please try again.', 'bot');
            }
        })
        .catch(function () {
            addChatMessage('Connection error. Please check the server and try again.', 'bot');
        });
}

// Chatbot toggle
document.getElementById('chatbot-toggle').addEventListener('click', function() {
    const chatbotContainer = document.getElementById('chatbot-container');
    const toggleBtn = document.getElementById('chatbot-toggle');
    
    if (chatbotMinimized) {
        chatbotContainer.classList.remove('minimized');
        toggleBtn.textContent = '−';
        chatbotMinimized = false;
    } else {
        chatbotContainer.classList.add('minimized');
        toggleBtn.textContent = '+';
        chatbotMinimized = true;
    }
});

// Form Modal
const formModal = document.getElementById('form-modal');
const formTriggerBtn = document.getElementById('form-trigger-btn');
const closeBtn = document.querySelector('.close');

formTriggerBtn.addEventListener('click', function() {
    const lat = document.getElementById('id_latitude').value;
    const lon = document.getElementById('id_longitude').value;
    
    if (!lat || !lon) {
        alert('Please select a location on the map first. You can:\n1. Click on the map\n2. Use "Find My Location"\n3. Search for a location');
        return;
    }
    
    formModal.style.display = 'block';
});

closeBtn.addEventListener('click', function() {
    formModal.style.display = 'none';
});

window.addEventListener('click', function(event) {
    if (event.target === formModal) {
        formModal.style.display = 'none';
    }
});

// --- Autocomplete for form location field ---
const formLocationInput = document.getElementById('form-location-search');
const formLocationSuggestions = document.getElementById('form-location-suggestions');

if (formLocationInput && formLocationSuggestions) {
    formLocationInput.addEventListener('input', debounce(function () {
        fetchAutocompleteSuggestions(this.value.trim(), formLocationSuggestions);
    }, 300));

    formLocationSuggestions.addEventListener('click', function (e) {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
    });

    // Reuse fetchAutocompleteSuggestions but customize click handling
    async function updateFormSuggestions(query) {
        if (!query || query.length < 3) {
            formLocationSuggestions.innerHTML = '';
            formLocationSuggestions.style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/autocomplete-location/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({ query })
            });

            const data = await response.json();
            if (!data.success) {
                formLocationSuggestions.innerHTML = '';
                formLocationSuggestions.style.display = 'none';
                return;
            }

            const results = data.results || [];
            if (!results.length) {
                formLocationSuggestions.innerHTML = '';
                formLocationSuggestions.style.display = 'none';
                return;
            }

            formLocationSuggestions.innerHTML = '';
            results.forEach(result => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.textContent = result.display_name;
                item.addEventListener('click', async () => {
                    const lat = parseFloat(result.lat);
                    const lon = parseFloat(result.lon);

                    formLocationInput.value = result.display_name;
                    formLocationSuggestions.innerHTML = '';
                    formLocationSuggestions.style.display = 'none';

                    // Center map and update marker/coords
                    map.setView([lat, lon], 15);
                    if (userMarker) {
                        map.removeLayer(userMarker);
                    }
                    userMarker = L.marker([lat, lon]).addTo(map)
                        .bindPopup('Business Location').openPopup();

                    document.getElementById('id_latitude').value = lat;
                    document.getElementById('id_longitude').value = lon;
                    updateAccuracyMeter(85);
                    await findPopularPlaces(lat, lon, false);
                    await updateCrowdIntensityDropdown(lat, lon);
                });
                formLocationSuggestions.appendChild(item);
            });
            formLocationSuggestions.style.display = 'block';
        } catch (err) {
            console.error('Form autocomplete error:', err);
            formLocationSuggestions.innerHTML = '';
            formLocationSuggestions.style.display = 'none';
        }
    }

    formLocationInput.addEventListener('input', debounce(function () {
        updateFormSuggestions(this.value.trim());
    }, 300));

    document.addEventListener('click', function (e) {
        if (!formLocationSuggestions.contains(e.target) && e.target !== formLocationInput) {
            formLocationSuggestions.innerHTML = '';
            formLocationSuggestions.style.display = 'none';
        }
    });
}

// Form Submission
document.getElementById('business-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const formMessage = document.getElementById('form-message');
    
    try {
        const response = await fetch('/submit-form/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            formMessage.textContent = data.message || 'Form submitted successfully!';
            formMessage.className = 'form-message success';
            this.reset();
            setTimeout(() => {
                formModal.style.display = 'none';
                formMessage.className = 'form-message';
            }, 2000);
        } else {
            formMessage.textContent = data.message || 'Error submitting form';
            formMessage.className = 'form-message error';
        }
    } catch (error) {
        console.error('Error:', error);
        formMessage.textContent = 'Error submitting form';
        formMessage.className = 'form-message error';
    }
});

// Select search result location
async function selectSearchResult(lat, lon) {
    // Update form coordinates
    document.getElementById('id_latitude').value = lat;
    document.getElementById('id_longitude').value = lon;
    
    // Remove previous user marker
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    
    // Add user marker at selected location
    userMarker = L.marker([lat, lon]).addTo(map)
        .bindPopup('Selected Location').openPopup();
    
    // Center map on selected location
    map.setView([lat, lon], 15);
    
    // Update accuracy
    updateAccuracyMeter(90);
    
    // Automatically find popular places around the selected location
    await findPopularPlaces(lat, lon, false);
    await updateCrowdIntensityDropdown(lat, lon);
}

// Get CSRF Token
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Initialize chatbot connection
connectChatbot();

// Update crowd intensity dropdown based on location
async function updateCrowdIntensityDropdown(lat, lon) {
    const dropdown = document.getElementById('id_crowd_intensity');
    
    // Show loading state
    dropdown.innerHTML = '<option value="">Analyzing crowd intensity...</option>';
    dropdown.disabled = true;
    
    try {
        const response = await fetch('/analyze-crowd-intensity/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({ latitude: lat, longitude: lon })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Clear previous crowd intensity markers and heatmap layers
            crowdIntensityAreas.forEach(marker => map.removeLayer(marker));
            crowdIntensityAreas = [];
            heatmapLayers.forEach(layer => map.removeLayer(layer));
            heatmapLayers = [];
            
            // Update dropdown with available options
            dropdown.innerHTML = '<option value="">Select crowd intensity</option>';
            
            if (data.high_intensity && data.high_intensity.length > 0) {
                const option = document.createElement('option');
                option.value = 'high';
                option.textContent = `High - High intensity crowded area (${data.high_intensity.length} areas found)`;
                dropdown.appendChild(option);
                
                // Add heatmap overlays for high intensity areas (larger circles with gradient)
                data.high_intensity.forEach(area => {
                    // Create a larger heatmap circle for high intensity
                    const heatmapCircle = L.circle([area.latitude, area.longitude], {
                        radius: 800, // ~800m radius for high intensity zones
                        color: '#ff0000',
                        fillColor: '#ff0000',
                        fillOpacity: 0.4,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>High Intensity Area</b><br>${area.count} Points of Interest`);
                    heatmapLayers.push(heatmapCircle);
                    
                    // Also add a center marker
                    const marker = L.circleMarker([area.latitude, area.longitude], {
                        radius: 12,
                        color: '#ff0000',
                        fillColor: '#ff0000',
                        fillOpacity: 0.9,
                        weight: 3
                    }).addTo(map).bindPopup(`<b>High Intensity Area</b><br>${area.count} Points of Interest`);
                    crowdIntensityAreas.push(marker);
                });
            }
            
            if (data.medium_intensity && data.medium_intensity.length > 0) {
                const option = document.createElement('option');
                option.value = 'medium';
                option.textContent = `Medium - Moderate crowd intensity (${data.medium_intensity.length} areas found)`;
                dropdown.appendChild(option);
                
                // Add heatmap overlays for medium intensity areas
                data.medium_intensity.forEach(area => {
                    // Create a medium-sized heatmap circle
                    const heatmapCircle = L.circle([area.latitude, area.longitude], {
                        radius: 600, // ~600m radius for medium intensity zones
                        color: '#ffaa00',
                        fillColor: '#ffaa00',
                        fillOpacity: 0.3,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>Medium Intensity Area</b><br>${area.count} Points of Interest`);
                    heatmapLayers.push(heatmapCircle);
                    
                    // Also add a center marker
                    const marker = L.circleMarker([area.latitude, area.longitude], {
                        radius: 10,
                        color: '#ffaa00',
                        fillColor: '#ffaa00',
                        fillOpacity: 0.9,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>Medium Intensity Area</b><br>${area.count} Points of Interest`);
                    crowdIntensityAreas.push(marker);
                });
            }
            
            if (data.low_intensity && data.low_intensity.length > 0) {
                const option = document.createElement('option');
                option.value = 'low';
                option.textContent = `Low - Low crowd intensity (${data.low_intensity.length} areas found)`;
                dropdown.appendChild(option);
                
                // Add heatmap overlays for low intensity areas
                data.low_intensity.forEach(area => {
                    // Create a smaller heatmap circle
                    const heatmapCircle = L.circle([area.latitude, area.longitude], {
                        radius: 400, // ~400m radius for low intensity zones
                        color: '#00ff00',
                        fillColor: '#00ff00',
                        fillOpacity: 0.25,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>Low Intensity Area</b><br>${area.count} Points of Interest`);
                    heatmapLayers.push(heatmapCircle);
                    
                    // Also add a center marker
                    const marker = L.circleMarker([area.latitude, area.longitude], {
                        radius: 8,
                        color: '#00ff00',
                        fillColor: '#00ff00',
                        fillOpacity: 0.9,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>Low Intensity Area</b><br>${area.count} Points of Interest`);
                    crowdIntensityAreas.push(marker);
                });
            }
            
            // If no areas found, add default options
            if (data.high_intensity.length === 0 && data.medium_intensity.length === 0 && data.low_intensity.length === 0) {
                dropdown.innerHTML = `
                    <option value="">Select crowd intensity</option>
                    <option value="high">High - High intensity crowded area</option>
                    <option value="medium">Medium - Moderate crowd intensity</option>
                    <option value="low">Low - Low crowd intensity</option>
                `;
            }
            
            dropdown.disabled = false;
        } else {
            // Fallback to default options on error
            dropdown.innerHTML = `
                <option value="">Select crowd intensity</option>
                <option value="high">High - High intensity crowded area</option>
                <option value="medium">Medium - Moderate crowd intensity</option>
                <option value="low">Low - Low crowd intensity</option>
            `;
            dropdown.disabled = false;
            console.error('Error analyzing crowd intensity:', data.error);
        }
    } catch (error) {
        console.error('Error:', error);
        // Fallback to default options
        dropdown.innerHTML = `
            <option value="">Select crowd intensity</option>
            <option value="high">High - High intensity crowded area</option>
            <option value="medium">Medium - Moderate crowd intensity</option>
            <option value="low">Low - Low crowd intensity</option>
        `;
        dropdown.disabled = false;
    }
}

// Welcome message
setTimeout(() => {
    addChatMessage("Hello! I'm here to help you navigate the Crowd Heatmap application. How can I assist you today?", 'bot');
}, 1000);

// Dark/Light Mode Toggle
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const body = document.body;
    const themeIcon = document.getElementById('theme-icon');
    
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
        themeIcon.textContent = '☀️';
    } else {
        body.classList.remove('light-mode');
        themeIcon.textContent = '🌙';
    }
    
    // Update map tiles based on theme
    updateMapTiles(savedTheme);
}

function toggleTheme() {
    const body = document.body;
    const themeIcon = document.getElementById('theme-icon');
    const isLightMode = body.classList.contains('light-mode');
    
    if (isLightMode) {
        body.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
        themeIcon.textContent = '🌙';
        updateMapTiles('dark');
    } else {
        body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
        themeIcon.textContent = '☀️';
        updateMapTiles('light');
    }
}

function updateMapTiles(theme) {
    const lightUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    const nextUrl = theme === 'light' ? lightUrl : darkUrl;
    const nextAttribution = theme === 'light'
        ? '© OpenStreetMap contributors'
        : '© OpenStreetMap contributors © CARTO';

    if (baseTileLayer) {
        map.removeLayer(baseTileLayer);
    }

    baseTileLayer = L.tileLayer(nextUrl, {
        attribution: nextAttribution,
        maxZoom: 19
    }).addTo(map);
}

// Initialize theme on page load
initTheme();

// Theme toggle button event listener
document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
