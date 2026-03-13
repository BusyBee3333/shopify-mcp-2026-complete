// Returns tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_returns, get_return, create_return, cancel_return, close_return, reverse_fulfillment_orders

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListReturnsSchema = z.object({
  orderId: z.string().describe("Order GID to list returns for"),
  first: z.number().min(1).max(100).optional().default(10).describe("Number of returns to return"),
  after: z.string().optional().describe("Pagination cursor"),
});

const GetReturnSchema = z.object({
  returnId: z.string().describe("Return GID (e.g. gid://shopify/Return/123)"),
});

const CreateReturnSchema = z.object({
  orderId: z.string().describe("GID of the order to create return for"),
  returnLineItems: z.array(z.object({
    fulfillmentLineItemId: z.string().describe("GID of the fulfillment line item to return"),
    quantity: z.number().min(1).describe("Quantity to return"),
    returnReason: z.enum([
      "WRONG_ITEM", "UNWANTED", "SIZE_TOO_SMALL", "SIZE_TOO_LARGE",
      "STYLE", "COLOR", "DEFECTIVE", "OTHER", "UNKNOWN",
    ]).describe("Reason for return"),
    returnReasonNote: z.string().optional().describe("Additional return reason note"),
  })).describe("Line items to return"),
  notifyCustomer: z.boolean().optional().default(false).describe("Send return notification to customer"),
  requestedAt: z.string().optional().describe("ISO 8601 date when return was requested"),
});

const CancelReturnSchema = z.object({
  returnId: z.string().describe("Return GID to cancel"),
  notifyCustomer: z.boolean().optional().default(false).describe("Notify customer of cancellation"),
});

const CloseReturnSchema = z.object({
  returnId: z.string().describe("Return GID to close"),
});

const ReturnRefundSchema = z.object({
  returnId: z.string().describe("Return GID to refund"),
  returnRefundLineItems: z.array(z.object({
    returnLineItemId: z.string().describe("Return line item GID"),
    quantity: z.number().min(1).describe("Quantity to refund"),
  })).describe("Return line items to refund"),
  refundShipping: z.object({
    fullRefund: z.boolean().optional().describe("Refund full shipping amount"),
    shippingRefundAmount: z.object({
      amount: z.string().describe("Amount to refund"),
      currencyCode: z.string().describe("Currency code"),
    }).optional().describe("Specific shipping refund amount"),
  }).optional().describe("Shipping refund options"),
  notifyCustomer: z.boolean().optional().default(false).describe("Notify customer of refund"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_returns",
      title: "List Order Returns",
      description: "List all returns for a specific order. Returns return GIDs, status, requested date, and return line items.",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order GID" },
          first: { type: "number", description: "Number of returns to return (default 10)" },
          after: { type: "string", description: "Pagination cursor" },
        },
        required: ["orderId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_return",
      title: "Get Return",
      description: "Get details of a specific return by GID. Returns return status, line items, quantities, reasons, and refund information.",
      inputSchema: {
        type: "object",
        properties: { returnId: { type: "string", description: "Return GID" } },
        required: ["returnId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_return",
      title: "Create Return",
      description: "Initiate a return for one or more order line items. Specify return reasons and quantities. Optionally notify the customer. Returns the new return with its GID for further processing.",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order GID" },
          returnLineItems: { type: "array", description: "Array of {fulfillmentLineItemId, quantity, returnReason} objects" },
          notifyCustomer: { type: "boolean", description: "Notify customer" },
          requestedAt: { type: "string", description: "Return requested date (ISO 8601)" },
        },
        required: ["orderId", "returnLineItems"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "cancel_return",
      title: "Cancel Return",
      description: "Cancel an open return request. The return line items will no longer be in return status.",
      inputSchema: {
        type: "object",
        properties: {
          returnId: { type: "string", description: "Return GID" },
          notifyCustomer: { type: "boolean", description: "Notify customer of cancellation" },
        },
        required: ["returnId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "close_return",
      title: "Close Return",
      description: "Close a return that has been completed (items received, refunds issued). Marks the return as CLOSED.",
      inputSchema: {
        type: "object",
        properties: { returnId: { type: "string", description: "Return GID" } },
        required: ["returnId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "return_refund",
      title: "Create Return Refund",
      description: "Issue a refund for returned items. Specify which return line items to refund and optionally refund shipping costs. Triggers actual financial refund via payment gateway.",
      inputSchema: {
        type: "object",
        properties: {
          returnId: { type: "string", description: "Return GID" },
          returnRefundLineItems: { type: "array", description: "Array of {returnLineItemId, quantity} objects" },
          refundShipping: { type: "object", description: "Optional shipping refund details" },
          notifyCustomer: { type: "boolean", description: "Notify customer of refund" },
        },
        required: ["returnId", "returnRefundLineItems"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_returns: async (args) => {
      const { orderId, first, after } = ListReturnsSchema.parse(args);
      const query = `
        query getOrderReturns($id: ID!, $first: Int!, $after: String) {
          order(id: $id) {
            returns(first: $first, after: $after) {
              edges {
                node {
                  id
                  status
                  requestedAt
                  returnLineItems(first: 10) {
                    edges { node { id quantity returnReason returnReasonNote refundableQuantity } }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `;
      const data = await logger.time("tool.list_returns", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id: orderId, first, after } })
      , { tool: "list_returns" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_return: async (args) => {
      const { returnId } = GetReturnSchema.parse(args);
      const query = `
        query getReturn($id: ID!) {
          return(id: $id) {
            id
            status
            requestedAt
            order { id name }
            returnLineItems(first: 50) {
              edges {
                node {
                  id
                  quantity
                  returnReason
                  returnReasonNote
                  refundableQuantity
                  refundedQuantity
                  fulfillmentLineItem { id lineItem { id name } }
                }
              }
            }
          }
        }
      `;
      const data = await logger.time("tool.get_return", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id: returnId } })
      , { tool: "get_return" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_return: async (args) => {
      const { orderId, returnLineItems, notifyCustomer, requestedAt } = CreateReturnSchema.parse(args);
      const query = `
        mutation returnCreate($input: ReturnInput!) {
          returnCreate(input: $input) {
            return { id status requestedAt }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.create_return", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { input: { orderId, returnLineItems, notifyCustomer, requestedAt } },
        })
      , { tool: "create_return" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    cancel_return: async (args) => {
      const { returnId, notifyCustomer } = CancelReturnSchema.parse(args);
      const query = `
        mutation returnCancel($id: ID!, $notifyCustomer: Boolean) {
          returnCancel(id: $id, notifyCustomer: $notifyCustomer) {
            return { id status }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.cancel_return", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id: returnId, notifyCustomer } })
      , { tool: "cancel_return" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    close_return: async (args) => {
      const { returnId } = CloseReturnSchema.parse(args);
      const query = `
        mutation returnClose($id: ID!) {
          returnClose(id: $id) {
            return { id status }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.close_return", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { id: returnId } })
      , { tool: "close_return" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    return_refund: async (args) => {
      const { returnId, returnRefundLineItems, refundShipping, notifyCustomer } = ReturnRefundSchema.parse(args);
      const query = `
        mutation returnRefundCreate($input: ReturnRefundInput!) {
          returnRefundCreate(input: $input) {
            refund { id }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.return_refund", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { input: { returnId, returnRefundLineItems, refundShipping, notifyCustomer } },
        })
      , { tool: "return_refund" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
