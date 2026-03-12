# Shopify MCP Server 2026

Production-quality [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the **Shopify Admin REST API 2024-01**. Enables AI agents to manage your Shopify store — products, orders, customers, inventory, and collections — through a fully typed, resilient interface.

## Features

- **17 tools** covering Products, Orders, Customers, Inventory, and Collections
- **Shopify Admin REST API 2024-01** with cursor-based pagination (Link header `page_info`)
- **Circuit breaker** with configurable failure threshold and reset timeout
- **Automatic retry** with exponential backoff + jitter for 5xx and rate-limit responses
- **30-second request timeout** with AbortController
- **Rate limit awareness** — reads `X-Shopify-Shop-Api-Call-Limit` header, throttles when bucket is low
- **Structured JSON logging** on stderr (stdout reserved for MCP protocol)
- **Both `content` (text) and `structuredContent` (JSON)** in every tool response
- **stdio + Streamable HTTP** transport support
- **MCP SDK v1.26.0** — patched for cross-client data leak (GHSA-345p-7cg4-v4c7)
- **Zod v3** — compatible with MCP SDK v1.x (v4 is incompatible)

## Tools

### Health
| Tool | Description |
|------|-------------|
| `health_check` | Validate credentials, API reachability, and shop info |

### Products
| Tool | Description |
|------|-------------|
| `list_products` | List products with filters (status, vendor, type, collection) + pagination |
| `get_product` | Get product with all variants and images |
| `create_product` | Create product with variants and images |
| `update_product` | Update fields, publish (`status=active`) or unpublish (`status=draft`) |

### Orders
| Tool | Description |
|------|-------------|
| `list_orders` | List orders with filters (status, financial, fulfillment, date range) |
| `get_order` | Get order with line items, customer, and fulfillments |
| `create_order` | Create draft order with line items and customer info |
| `update_order` | Update order note, tags, email, or shipping address |

### Customers
| Tool | Description |
|------|-------------|
| `list_customers` | List customers with search (name/email/phone/address) |
| `get_customer` | Get customer with optional order history |
| `create_customer` | Create customer record with addresses |
| `update_customer` | Update customer fields |

### Inventory
| Tool | Description |
|------|-------------|
| `get_inventory` | Get inventory levels by item IDs and/or location IDs |
| `update_inventory` | Set absolute inventory quantity at a specific location |

### Collections
| Tool | Description |
|------|-------------|
| `list_collections` | List custom and/or smart collections |
| `add_product_to_collection` | Add product to a custom (manual) collection |

## Setup

### 1. Get Shopify Admin API credentials

1. In your Shopify admin, go to **Settings → Apps → Develop apps**
2. Click **Create an app**, give it a name
3. Click **Configure Admin API scopes** and enable:
   - `read_products`, `write_products`
   - `read_orders`, `write_orders`
   - `read_customers`, `write_customers`
   - `read_inventory`, `write_inventory`
   - `read_fulfillments`
4. Click **Install app** → copy the **Admin API access token** (starts with `shpat_`)

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
SHOPIFY_STORE_DOMAIN=mystore.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Build and run

```bash
npm install
npm run build
npm start
```

### 4. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["/path/to/shopify-mcp-2026-complete/dist/index.js"],
      "env": {
        "SHOPIFY_STORE_DOMAIN": "mystore.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

## HTTP Transport

For remote/network deployment:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 npm start
```

Endpoints:
- `POST /mcp` — MCP protocol (creates or resumes session)
- `GET /mcp` — SSE stream for server-initiated messages (requires `mcp-session-id` header)
- `DELETE /mcp` — Close session
- `GET /health` — Health check (non-MCP)

## Pagination

Shopify uses cursor-based pagination via Link headers. When `meta.hasMore` is `true`, pass `meta.nextPageInfo` as `page_info` in the next call:

```json
// First call
{ "limit": 50 }

// Response
{ "data": [...], "meta": { "count": 50, "hasMore": true, "nextPageInfo": "eyJsYXN0X2lkIjo..." } }

// Next call
{ "limit": 50, "page_info": "eyJsYXN0X2lkIjo..." }
```

**Note:** When using `page_info`, you cannot combine it with other filters — Shopify's cursor pagination encodes the filter state in the cursor itself.

## Auth

- Header: `X-Shopify-Access-Token: shpat_...`
- Base URL: `https://{SHOPIFY_STORE_DOMAIN}/admin/api/2024-01`
- Rate limit: 40 requests/second (leaky bucket model)

## Development

```bash
npm run dev     # Run with tsx (no build required)
npm run build   # Compile TypeScript
npm start       # Run compiled server
```

## Architecture

```
src/
├── index.ts          # Server entry, transport selection, tool registration
├── client.ts         # ShopifyClient with circuit breaker, retry, pagination
├── logger.ts         # Structured JSON logger (stderr)
├── types.ts          # Shared TypeScript interfaces
└── tools/
    ├── health.ts     # health_check
    ├── products.ts   # list_products, get_product, create_product, update_product
    ├── orders.ts     # list_orders, get_order, create_order, update_order
    ├── customers.ts  # list_customers, get_customer, create_customer, update_customer
    ├── inventory.ts  # get_inventory, update_inventory
    └── collections.ts # list_collections, add_product_to_collection
```

## MCP Spec Compliance

- **SDK:** `@modelcontextprotocol/sdk ^1.26.0` (2025-11-25 spec)
- **Tools:** All include `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations`
- **Annotations:** `readOnlyHint: true` for all list/get tools
- **Responses:** Both `content` (text fallback) and `structuredContent` (typed JSON) in every response
- **Transport:** stdio (default) + Streamable HTTP (set `MCP_TRANSPORT=http`)

## License

MIT
