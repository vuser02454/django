from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
import math
import requests
from .forms import BusinessUserForm
from .models import BusinessUser

def home(request):
    """Main page with map and controls"""
    return render(request, 'heatmap_app/home.html')

def submit_form(request):
    """Handle form submission"""
    if request.method == 'POST':
        form = BusinessUserForm(request.POST)
        if form.is_valid():
            form.save()
            return JsonResponse({'success': True, 'message': 'Form submitted successfully!'})
        else:
            return JsonResponse({'success': False, 'errors': form.errors})
    return JsonResponse({'success': False, 'message': 'Invalid request method'})

@csrf_exempt
def search_location(request):
    """Search for locations using Nominatim API (OpenStreetMap)"""
    if request.method == 'POST':
        data = json.loads(request.body)
        query = data.get('query', '')
        
        # Call Nominatim API for location search
        try:
            url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=5"
            headers = {'User-Agent': 'CrowdHeatmapApp/1.0'}
            response = requests.get(url, headers=headers)
            results = response.json()
            return JsonResponse({'success': True, 'results': results})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})

@csrf_exempt
def find_popular_places(request):
    """Find popular places within 5km radius"""
    if request.method == 'POST':
        data = json.loads(request.body)
        lat = data.get('latitude')
        lon = data.get('longitude')
        
        # Use Overpass API to find POIs within 5km radius
        try:
            # Using Overpass API to find amenities within 5km
            overpass_url = "http://overpass-api.de/api/interpreter"
            query = f"""
            [out:json];
            (
              node["amenity"](around:5000,{lat},{lon});
              way["amenity"](around:5000,{lat},{lon});
              relation["amenity"](around:5000,{lat},{lon});
            );
            out center;
            """
            response = requests.post(overpass_url, data={'data': query})
            results = response.json()
            return JsonResponse({'success': True, 'results': results.get('elements', [])})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)})
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})

@csrf_exempt
def analyze_crowd_intensity(request):
    """Analyze crowd intensity in 5km radius and return high/medium/low areas"""
    if request.method == 'POST':
        data = json.loads(request.body)
        lat = data.get('latitude')
        lon = data.get('longitude')
        
        if not lat or not lon:
            return JsonResponse({'success': False, 'message': 'Latitude and longitude are required'})
        
        try:
            # Use Overpass API to find amenities and POIs within 5km radius
            overpass_url = "http://overpass-api.de/api/interpreter"
            query = f"""
            [out:json];
            (
              node["amenity"](around:5000,{lat},{lon});
              way["amenity"](around:5000,{lat},{lon});
              relation["amenity"](around:5000,{lat},{lon});
              node["shop"](around:5000,{lat},{lon});
              way["shop"](around:5000,{lat},{lon});
              node["tourism"](around:5000,{lat},{lon});
              way["tourism"](around:5000,{lat},{lon});
            );
            out center;
            """
            response = requests.post(overpass_url, data={'data': query}, timeout=30)
            results = response.json()
            elements = results.get('elements', [])
            
            # Calculate density by dividing area into sectors
            # High intensity: > 15 POIs per sector
            # Medium intensity: 5-15 POIs per sector
            # Low intensity: < 5 POIs per sector
            
            # Divide 5km radius into 9 sectors (3x3 grid)
            sector_size = 5000 / 3  # ~1.67km per sector
            sectors = {}
            
            for element in elements:
                elem_lat = element.get('lat') or (element.get('center', {}).get('lat'))
                elem_lon = element.get('lon') or (element.get('center', {}).get('lon'))
                
                if not elem_lat or not elem_lon:
                    continue
                
                # Calculate distance from center
                R = 6371000  # Earth radius in meters
                lat1_rad = math.radians(lat)
                lat2_rad = math.radians(elem_lat)
                delta_lat = math.radians(elem_lat - lat)
                delta_lon = math.radians(elem_lon - lon)
                
                a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                distance = R * c
                
                if distance > 5000:
                    continue
                
                # Determine sector (0-8)
                angle = math.atan2(elem_lat - lat, elem_lon - lon)
                angle_deg = math.degrees(angle) + 180  # 0-360
                
                # Sector based on angle and distance
                angle_sector = int(angle_deg / 120)  # 0-2
                dist_sector = int(distance / sector_size)  # 0-2
                sector_key = f"{dist_sector}_{angle_sector}"
                
                if sector_key not in sectors:
                    sectors[sector_key] = []
                sectors[sector_key].append({
                    'lat': elem_lat,
                    'lon': elem_lon,
                    'name': element.get('tags', {}).get('name', 'Unknown'),
                    'type': element.get('tags', {}).get('amenity') or element.get('tags', {}).get('shop') or element.get('tags', {}).get('tourism', 'Unknown')
                })
            
            # Classify sectors by intensity
            high_intensity_areas = []
            medium_intensity_areas = []
            low_intensity_areas = []
            
            for sector_key, pois in sectors.items():
                count = len(pois)
                # Calculate center of sector
                avg_lat = sum(p['lat'] for p in pois) / count
                avg_lon = sum(p['lon'] for p in pois) / count
                
                if count >= 15:
                    high_intensity_areas.append({
                        'latitude': avg_lat,
                        'longitude': avg_lon,
                        'count': count,
                        'sector': sector_key
                    })
                elif count >= 5:
                    medium_intensity_areas.append({
                        'latitude': avg_lat,
                        'longitude': avg_lon,
                        'count': count,
                        'sector': sector_key
                    })
                else:
                    low_intensity_areas.append({
                        'latitude': avg_lat,
                        'longitude': avg_lon,
                        'count': count,
                        'sector': sector_key
                    })
            
            # If no sectors found, create default areas based on distance
            if not high_intensity_areas and not medium_intensity_areas and not low_intensity_areas:
                # Create default areas at different distances
                high_intensity_areas = [{'latitude': lat, 'longitude': lon, 'count': len(elements), 'sector': 'center'}]
                medium_intensity_areas = []
                low_intensity_areas = []
            
            return JsonResponse({
                'success': True,
                'high_intensity': high_intensity_areas,
                'medium_intensity': medium_intensity_areas,
                'low_intensity': low_intensity_areas,
                'total_pois': len(elements)
            })
            
        except Exception as e:
            import traceback
            return JsonResponse({'success': False, 'error': str(e), 'traceback': traceback.format_exc()})
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})
