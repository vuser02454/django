# Crowd Heatmap for Business Startups

A Django-based web application that helps business startups find optimal locations based on crowd intensity analysis using OpenStreetMap data.

## Features

### Frontend Components

1. **Black Horizontal Control Panel**
   - Search field for real-time location search
   - Find My Location button (uses browser geolocation)
   - Find Popular Places button (searches within 5km radius)
   - Accuracy meter showing accuracy compared to OpenStreetMap
   - Map minimize/maximize toggle button

2. **Interactive Map**
   - Uses OpenStreetMap via Leaflet.js
   - Click on map to set location
   - Minimize/maximize functionality
   - Markers for search results, user location, and popular places

3. **Chatbot Assistant**
   - WebSocket-based chatbot using Django Channels
   - Guides users through the website
   - Answers questions about features and functionality
   - Minimizable chat interface

4. **Business Information Form**
   - Collects personal details (name, email, phone)
   - Business type input
   - Crowd intensity dropdown with three options:
     - **High**: High intensity crowded area
     - **Medium**: Moderate crowd intensity (between high and low thresholds)
     - **Low**: Low crowd intensity (least threshold value)

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run migrations:
```bash
python manage.py makemigrations
python manage.py migrate
```

3. Create a superuser (optional, for admin access):
```bash
python manage.py createsuperuser
```

4. Run the development server:
```bash
python manage.py runserver
```

5. Open your browser and navigate to:
```
http://127.0.0.1:8000/
```

## Project Structure

```
crowd_heatmap/
├── crowd_heatmap_project/    # Main project settings
│   ├── settings.py           # Django settings
│   ├── urls.py               # Main URL configuration
│   └── asgi.py               # ASGI configuration for Channels
├── heatmap_app/              # Main application
│   ├── models.py             # Database models
│   ├── views.py              # View functions
│   ├── forms.py              # Form definitions
│   ├── urls.py               # App URL patterns
│   ├── consumers.py          # WebSocket consumers for chatbot
│   └── routing.py            # WebSocket routing
├── templates/                # HTML templates
│   └── heatmap_app/
│       └── home.html         # Main page template
├── static/                   # Static files
│   ├── css/
│   │   └── style.css         # Custom styles
│   └── js/
│       └── main.js           # Frontend JavaScript
└── requirements.txt          # Python dependencies
```

## Usage

1. **Search Locations**: Type a location in the search field and click "Search" or press Enter
2. **Find Your Location**: Click "Find My Location" to get your current position
3. **Find Popular Places**: After finding your location, click "Find Popular Places (5km)" to see nearby amenities
4. **Set Location on Map**: Click anywhere on the map to set a location
5. **Submit Business Info**: Click "Submit Business Info" button, fill the form with your details and preferred crowd intensity
6. **Chat with Assistant**: Use the chatbot in the bottom-right corner for guidance

## API Endpoints

- `/` - Main page
- `/submit-form/` - Submit business information form (POST)
- `/search-location/` - Search for locations (POST)
- `/find-popular-places/` - Find popular places within 5km (POST)
- `/ws/chat/` - WebSocket endpoint for chatbot

## Technologies Used

- **Backend**: Django 6.0.1
- **WebSockets**: Django Channels 4.1.0
- **Frontend**: HTML5, CSS3, JavaScript
- **Maps**: Leaflet.js with OpenStreetMap
- **APIs**: Nominatim API (OpenStreetMap), Overpass API

## Notes

- The application uses OpenStreetMap's Nominatim API for location search
- Popular places are found using Overpass API
- Accuracy meter shows location precision based on geolocation accuracy
- All form submissions are stored in the database
- The chatbot uses a simple rule-based system for responses

## Development

To modify the chatbot responses, edit `heatmap_app/consumers.py` and update the `get_bot_response` method.

To customize the map behavior, edit `static/js/main.js`.

To modify the form fields, edit `heatmap_app/models.py` and `heatmap_app/forms.py`.
