// Initialize Map
let map = L.map('map').setView([51.505, -0.09], 13);
let userMarker = null;
let searchMarkers = [];
let popularPlacesMarkers = [];
let currentAccuracy = 0;
let crowdIntensityAreas = [];

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Update accuracy meter
function updateAccuracyMeter(accuracy) {
    currentAccuracy = accuracy;
    const meterFill = document.getElementById('accuracy-meter');
    const accuracyValue = document.getElementById('accuracy-value');
    
    meterFill.style.width = accuracy + '%';
    meterFill.textContent = accuracy + '%';
    accuracyValue.textContent = accuracy + '%';
}

// Calculate accuracy based on location precision
function calculateAccuracy(position) {
    // Accuracy is inversely related to position accuracy
    // Higher accuracy value = better precision
    const accuracy = position.coords.accuracy;
    let accuracyPercent = 100;
    
    if (accuracy > 0) {
        // Convert accuracy (in meters) to percentage
        // Lower accuracy value = higher percentage
        accuracyPercent = Math.max(0, Math.min(100, 100 - (accuracy / 100)));
    }
    
    return Math.round(accuracyPercent);
}

// Search Location
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
                
                // Analyze crowd intensity and update dropdown
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
        document.getElementById('search-btn').click();
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
            
            // Analyze crowd intensity and update dropdown
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

// Find Popular Places
document.getElementById('popular-places-btn').addEventListener('click', async function() {
    if (!userMarker) {
        alert('Please find your location first');
        return;
    }
    
    const lat = userMarker.getLatLng().lat;
    const lon = userMarker.getLatLng().lng;
    
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
            
            // Draw circle for 5km radius
            L.circle([lat, lon], {
                radius: 5000,
                color: '#4CAF50',
                fillColor: '#4CAF50',
                fillOpacity: 0.1,
                weight: 2
            }).addTo(map);
            
            // Analyze and show crowd intensity
            await updateCrowdIntensityDropdown(lat, lon);
            
            alert(`Found ${data.results.length} popular places within 5km`);
        } else {
            alert('Error finding popular places: ' + (data.error || data.message));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error finding popular places');
    }
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
    
    // Analyze crowd intensity and update dropdown
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
    const messageDiv = document.createElement('div');
    messageDiv.className = `chatbot-message ${sender}`;
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
    
    if (message && chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        addChatMessage(message, 'user');
        chatSocket.send(JSON.stringify({
            'message': message
        }));
        input.value = '';
    }
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
    
    // Analyze crowd intensity and update dropdown
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
            // Clear previous crowd intensity markers
            crowdIntensityAreas.forEach(marker => map.removeLayer(marker));
            crowdIntensityAreas = [];
            
            // Update dropdown with available options
            dropdown.innerHTML = '<option value="">Select crowd intensity</option>';
            
            if (data.high_intensity && data.high_intensity.length > 0) {
                const option = document.createElement('option');
                option.value = 'high';
                option.textContent = `High - High intensity crowded area (${data.high_intensity.length} areas found)`;
                dropdown.appendChild(option);
                
                // Add markers for high intensity areas
                data.high_intensity.forEach(area => {
                    const marker = L.circleMarker([area.latitude, area.longitude], {
                        radius: 10,
                        color: '#ff0000',
                        fillColor: '#ff0000',
                        fillOpacity: 0.8,
                        weight: 2
                    }).addTo(map).bindPopup(`<b>High Intensity Area</b><br>${area.count} Points of Interest`);
                    crowdIntensityAreas.push(marker);
                });
            }
            
            if (data.medium_intensity && data.medium_intensity.length > 0) {
                const option = document.createElement('option');
                option.value = 'medium';
                option.textContent = `Medium - Moderate crowd intensity (${data.medium_intensity.length} areas found)`;
                dropdown.appendChild(option);
                
                // Add markers for medium intensity areas
                data.medium_intensity.forEach(area => {
                    const marker = L.circleMarker([area.latitude, area.longitude], {
                        radius: 8,
                        color: '#ffaa00',
                        fillColor: '#ffaa00',
                        fillOpacity: 0.8,
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
                
                // Add markers for low intensity areas
                data.low_intensity.forEach(area => {
                    const marker = L.circleMarker([area.latitude, area.longitude], {
                        radius: 6,
                        color: '#00ff00',
                        fillColor: '#00ff00',
                        fillOpacity: 0.8,
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
