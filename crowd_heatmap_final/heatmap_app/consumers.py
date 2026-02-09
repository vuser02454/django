import json
from channels.generic.websocket import AsyncWebsocketConsumer


def get_bot_response(message):
    """Shared rule-based chatbot logic (used by WebSocket consumer and HTTP fallback)."""
    message = (message or '').lower().strip()
    greetings = ['hi', 'hello', 'hey', 'greetings']
    help_commands = ['help', 'what can you do', 'how does this work']
    search_help = ['search', 'how to search', 'find location']
    form_help = ['form', 'submit', 'business', 'crowd intensity']

    if any(greeting in message for greeting in greetings):
        return "Hello! I'm here to help you navigate the Crowd Heatmap application. How can I assist you today?"

    elif any(cmd in message for cmd in help_commands):
        return """I can help you with:
1. Searching for locations - Use the search field in the top panel
2. Finding your location - Click the 'Find My Location' button
3. Finding popular places - Click 'Find Popular Places' to see places within 5km
4. Submitting your business information - Fill out the form with your details and preferred crowd intensity
5. Understanding crowd intensity levels - High, Medium, or Low based on your business needs"""

    elif any(cmd in message for cmd in search_help):
        return "To search for a location, type in the search field at the top. The map will show results from OpenStreetMap. You can click on any result to see it on the map."

    elif any(cmd in message for cmd in form_help):
        return """The form collects your business information:
- Personal details: Name, Email, Phone
- Business Type: What kind of business you're starting
- Crowd Intensity: 
  * High: For businesses that need high foot traffic
  * Medium: For businesses that prefer moderate crowd levels
  * Low: For businesses that work better in quieter areas"""

    elif 'accuracy' in message or 'meter' in message:
        return "The accuracy meter shows how accurate the location data is compared to OpenStreetMap. Higher accuracy means more reliable location information."

    elif 'map' in message:
        return "The map uses OpenStreetMap. You can click and drag to move around, use the +/- buttons to zoom, and click the minimize/maximize button to toggle the map size."

    else:
        return "I'm here to help! Try asking about: searching locations, finding your location, popular places, submitting forms, or understanding crowd intensity. Or type 'help' for more information."


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message = text_data_json.get('message', '')
        response = get_bot_response(message)
        await self.send(text_data=json.dumps({
            'message': response
        }))
