import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';
import fs from 'fs/promises';
import path from 'path';

class MCPDemoServer {
  constructor() {
    this.server = new Server({
      name: 'mcp-demo-server',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
        resources: {},
      },
    });

    this.db = new sqlite3.Database(':memory:');
    this.setupDatabase();
    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  async setupDatabase() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        this.db.run(`
          INSERT INTO users (name, email) VALUES 
          ('John Doe', 'john@example.com'),
          ('Jane Smith', 'jane@example.com'),
          ('Bob Johnson', 'bob@example.com')
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_weather',
            description: 'Get current weather for a location using OpenWeatherMap API',
            inputSchema: {
              type: 'object',
              properties: {
                location: { 
                  type: 'string', 
                  description: 'City name (e.g., "New York" or "London,UK")' 
                }
              },
              required: ['location']
            }
          },
          {
            name: 'calculate',
            description: 'Perform mathematical calculations safely',
            inputSchema: {
              type: 'object',
              properties: {
                expression: { 
                  type: 'string', 
                  description: 'Mathematical expression (e.g., "2 + 2", "sqrt(16)")' 
                }
              },
              required: ['expression']
            }
          },
          {
            name: 'query_users',
            description: 'Query users from the database',
            inputSchema: {
              type: 'object',
              properties: {
                name_filter: { type: 'string', description: 'Filter users by name (optional)' },
                limit: { type: 'number', description: 'Maximum results (default: 10)' }
              }
            }
          },
          {
            name: 'add_user',
            description: 'Add a new user to the database',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'User full name' },
                email: { type: 'string', description: 'User email address' }
              },
              required: ['name', 'email']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_weather':
            return await this.getWeather(args.location);
          case 'calculate':
            return await this.calculate(args.expression);
          case 'query_users':
            return await this.queryUsers(args.name_filter, args.limit);
          case 'add_user':
            return await this.addUser(args.name, args.email);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'db://users',
            name: 'Users Database',
            description: 'SQLite database containing user information',
            mimeType: 'application/json'
          }
        ]
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      if (uri === 'db://users') {
        const users = await this.getAllUsers();
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(users, null, 2)
          }]
        };
      }
      throw new Error(`Resource not found: ${uri}`);
    });
  }

  async getWeather(location) {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    
    if (!apiKey) {
      return {
        content: [{ type: 'text', text: 'Weather API key not configured. Set OPENWEATHER_API_KEY environment variable.' }]
      };
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }
      
      const data = await response.json();
      const tempF = (data.main.temp * 9/5 + 32).toFixed(1);

      return {
        content: [{
          type: 'text',
          text: `Weather in ${data.name}, ${data.sys.country}:
Temperature: ${data.main.temp}°C (${tempF}°F)
Condition: ${data.weather[0].description}
Humidity: ${data.main.humidity}%
Wind Speed: ${data.wind.speed} m/s`
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to get weather: ${error.message}` }],
        isError: true
      };
    }
  }

  async calculate(expression) {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/.() sqrt sin cos tan pi e]/g, '');
      let evalExpression = sanitized
        .replace(/\bsqrt\(/g, 'Math.sqrt(')
        .replace(/\bsin\(/g, 'Math.sin(')
        .replace(/\bcos\(/g, 'Math.cos(')
        .replace(/\btan\(/g, 'Math.tan(')
        .replace(/\bpi\b/g, 'Math.PI')
        .replace(/\be\b/g, 'Math.E');

      const result = eval(evalExpression);
      
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Invalid result');
      }

      return {
        content: [{ type: 'text', text: `${expression} = ${result}` }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error calculating "${expression}": ${error.message}` }],
        isError: true
      };
    }
  }

  async queryUsers(nameFilter, limit = 10) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM users';
      const params = [];

      if (nameFilter) {
        query += ' WHERE name LIKE ?';
        params.push(`%${nameFilter}%`);
      }

      query += ' LIMIT ?';
      params.push(limit);

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const userList = rows.map(user => 
            `ID: ${user.id}\nName: ${user.name}\nEmail: ${user.email}\nCreated: ${user.created_at}`
          ).join('\n\n');

          resolve({
            content: [{ type: 'text', text: `Found ${rows.length} users:\n\n${userList}` }]
          });
        }
      });
    });
  }

  async addUser(name, email) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name, email],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              content: [{ type: 'text', text: `Successfully added user: ${name} (${email}) with ID: ${this.lastID}` }]
            });
          }
        }
      );
    });
  }

  async getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM users', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Demo Server running on stdio');
  }
}

const server = new MCPDemoServer();
server.run().catch(console.error);