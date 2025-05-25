import asyncio
import json
import math
import os
import sqlite3
from pathlib import Path
from typing import List, Optional, Dict, Any
import requests

from mcp import Server, types
from mcp.server.models import InitializationOptions
import mcp.server.stdio

class MCPDemoServer:
    def __init__(self):
        self.app = Server("mcp-demo-server")
        self.db = None
        self.setup_database()
        self.setup_handlers()

    def setup_database(self):
        self.db = sqlite3.connect(":memory:", check_same_thread=False)
        self.db.execute('''
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        sample_users = [
            ('John Doe', 'john@example.com'),
            ('Jane Smith', 'jane@example.com'),
            ('Bob Johnson', 'bob@example.com')
        ]
        
        self.db.executemany(
            'INSERT INTO users (name, email) VALUES (?, ?)',
            sample_users
        )
        self.db.commit()

    def setup_handlers(self):
        @self.app.list_tools()
        async def handle_list_tools() -> List[types.Tool]:
            return [
                types.Tool(
                    name="get_weather",
                    description="Get current weather for a location",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "location": {"type": "string", "description": "City name"}
                        },
                        "required": ["location"]
                    }
                ),
                types.Tool(
                    name="calculate",
                    description="Perform mathematical calculations",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "expression": {"type": "string", "description": "Math expression"}
                        },
                        "required": ["expression"]
                    }
                ),
                types.Tool(
                    name="query_users",
                    description="Query users from database",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "name_filter": {"type": "string", "description": "Filter by name"},
                            "limit": {"type": "integer", "description": "Max results (default: 10)"}
                        }
                    }
                ),
                types.Tool(
                    name="add_user",
                    description="Add new user to database",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "User name"},
                            "email": {"type": "string", "description": "User email"}
                        },
                        "required": ["name", "email"]
                    }
                )
            ]

        @self.app.call_tool()
        async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[types.TextContent]:
            try:
                if name == "get_weather":
                    return await self.get_weather(arguments["location"])
                elif name == "calculate":
                    return await self.calculate(arguments["expression"])
                elif name == "query_users":
                    return await self.query_users(
                        arguments.get("name_filter"),
                        arguments.get("limit", 10)
                    )
                elif name == "add_user":
                    return await self.add_user(arguments["name"], arguments["email"])
                else:
                    raise ValueError(f"Unknown tool: {name}")
            except Exception as e:
                return [types.TextContent(type="text", text=f"Error: {str(e)}")]

    async def get_weather(self, location: str) -> List[types.TextContent]:
        api_key = os.environ.get('OPENWEATHER_API_KEY')
        
        if not api_key:
            return [types.TextContent(
                type="text",
                text="Weather API key not configured. Set OPENWEATHER_API_KEY environment variable."
            )]

        try:
            url = f"https://api.openweathermap.org/data/2.5/weather"
            params = {'q': location, 'appid': api_key, 'units': 'metric'}
            
            response = requests.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            temp_f = data['main']['temp'] * 9/5 + 32
            
            weather_info = f"""Weather in {data['name']}, {data['sys']['country']}:
Temperature: {data['main']['temp']}°C ({temp_f:.1f}°F)
Condition: {data['weather'][0]['description']}
Humidity: {data['main']['humidity']}%
Wind Speed: {data['wind']['speed']} m/s"""

            return [types.TextContent(type="text", text=weather_info)]
            
        except Exception as e:
            return [types.TextContent(type="text", text=f"Weather error: {str(e)}")]

    async def calculate(self, expression: str) -> List[types.TextContent]:
        try:
            safe_dict = {
                "__builtins__": {},
                "abs": abs, "round": round, "pow": pow,
                "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos,
                "tan": math.tan, "log": math.log, "exp": math.exp,
                "pi": math.pi, "e": math.e
            }
            
            result = eval(expression, safe_dict)
            
            if not isinstance(result, (int, float)) or not math.isfinite(result):
                raise ValueError("Invalid result")
            
            return [types.TextContent(type="text", text=f"{expression} = {result}")]
            
        except Exception as e:
            return [types.TextContent(type="text", text=f"Calculation error: {str(e)}")]

    async def query_users(self, name_filter: Optional[str] = None, limit: int = 10) -> List[types.TextContent]:
        try:
            cursor = self.db.cursor()
            
            if name_filter:
                cursor.execute("SELECT * FROM users WHERE name LIKE ? LIMIT ?", (f"%{name_filter}%", limit))
            else:
                cursor.execute("SELECT * FROM users LIMIT ?", (limit,))
            
            users = cursor.fetchall()
            
            if not users:
                return [types.TextContent(type="text", text="No users found.")]
            
            user_list = []
            for user in users:
                user_info = f"ID: {user[0]}\nName: {user[1]}\nEmail: {user[2]}\nCreated: {user[3]}"
                user_list.append(user_info)
            
            result_text = f"Found {len(users)} users:\n\n" + "\n\n".join(user_list)
            return [types.TextContent(type="text", text=result_text)]
            
        except Exception as e:
            return [types.TextContent(type="text", text=f"Query error: {str(e)}")]

    async def add_user(self, name: str, email: str) -> List[types.TextContent]:
        try:
            cursor = self.db.cursor()
            cursor.execute("INSERT INTO users (name, email) VALUES (?, ?)", (name, email))
            self.db.commit()
            
            return [types.TextContent(
                type="text",
                text=f"Successfully added user: {name} ({email}) with ID: {cursor.lastrowid}"
            )]
            
        except sqlite3.IntegrityError:
            return [types.TextContent(type="text", text=f"Error: Email {email} already exists")]
        except Exception as e:
            return [types.TextContent(type="text", text=f"Add user error: {str(e)}")]

async def main():
    server = MCPDemoServer()
    
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="mcp-demo-server",
                server_version="1.0.0",
                capabilities=server.app.get_capabilities(
                    notification_options=None,
                    experimental_capabilities=None,
                )
            )
        )

if __name__ == "__main__":
    asyncio.run(main())