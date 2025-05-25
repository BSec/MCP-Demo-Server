# Node.js MCP Demo Server

## Setup

1. Install Node.js 18 or later
2. Run: `npm install`
3. Get OpenWeatherMap API key from https://openweathermap.org/api
4. Update the Claude Desktop config file with your paths and API key
5. Restart Claude Desktop

## Configuration File Locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%/Claude/claude_desktop_config.json` 
- **Linux**: `~/.config/claude/claude_desktop_config.json`

## Testing

Test standalone: `npm test`

## Available Tools

- `get_weather`: Get weather for any city
- `calculate`: Perform math calculations
- `query_users`: Search database users  
- `add_user`: Add new users to database