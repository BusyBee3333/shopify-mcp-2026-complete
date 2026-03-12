// Shared TypeScript interfaces for Shopify MCP Server

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  outputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structuredContent?: any;
  isError?: boolean;
}>;

// Shopify-specific types
export interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  status?: string;
  variants?: ShopifyVariant[];
  images?: ShopifyImage[];
  tags?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku?: string;
  price: string;
  compare_at_price?: string | null;
  inventory_quantity?: number;
  inventory_management?: string | null;
  inventory_item_id?: number;
  position?: number;
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt?: string | null;
  position?: number;
}

export interface ShopifyOrder {
  id: number;
  order_number?: number;
  name?: string;
  email?: string;
  phone?: string | null;
  financial_status?: string;
  fulfillment_status?: string | null;
  total_price?: string;
  subtotal_price?: string;
  total_tax?: string;
  line_items?: ShopifyLineItem[];
  customer?: ShopifyCustomer;
  fulfillments?: unknown[];
  note?: string | null;
  tags?: string;
  created_at?: string;
  updated_at?: string;
  processed_at?: string;
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
  variant_id?: number | null;
  product_id?: number | null;
}

export interface ShopifyCustomer {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  orders_count?: number;
  total_spent?: string;
  tags?: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
  default_address?: Record<string, unknown>;
}

export interface ShopifyCollection {
  id: number;
  title: string;
  handle?: string;
  body_html?: string | null;
  published_at?: string | null;
  sort_order?: string;
  products_count?: number;
}

export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
  updated_at?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    count: number;
    hasMore: boolean;
    nextPageInfo?: string;
  };
}
