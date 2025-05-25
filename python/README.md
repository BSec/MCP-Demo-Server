# Python MCP Demo Server

## Setup

1. Install Python 3.8 or later
2. Run: `pip install -r requirements.txt`
3. Get OpenWeatherMap API key from https://openweathermap.org/api
4. Update the Claude Desktop config file with your paths and API key
5. Restart Claude Desktop

## Testing

Test standalone: `python server.py`

## Available Tools

- `get_weather`: Get weather for any city
- `calculate`: Perform math calculations
- `query_users`: Search database users
- `add_user`: Add new users to database