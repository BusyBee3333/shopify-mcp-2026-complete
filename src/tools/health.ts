// Health check tool — validates Shopify environment and API connectivity

import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "health_check",
      title: "Health Check",
      description:
        "Validate Shopify MCP server health: checks environment variables (SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN), API reachability, and authentication. Returns shop name and plan on success. Use when diagnosing connection issues or verifying server setup.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      outputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy", "degraded", "unhealthy"] },
          checks: {
            type: "object",
            properties: {
              envVars: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  missing: { type: "array", items: { type: "string" } },
                },
              },
              apiReachable: { type: "boolean" },
              authValid: { type: "boolean" },
              latencyMs: { type: "number" },
              shopName: { type: "string" },
              plan: { type: "string" },
            },
          },
          error: { type: "string" },
        },
        required: ["status", "checks"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    health_check: async () => {
      const checks: Record<string, unknown> = {};

      const requiredEnvVars = ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ACCESS_TOKEN"];
      const missing = requiredEnvVars.filter((v) => !process.env[v]);
      checks.envVars = { ok: missing.length === 0, missing };

      const healthResult = await client.healthCheck();
      checks.apiReachable = healthResult.reachable;
      checks.authValid = healthResult.authenticated;
      checks.latencyMs = healthResult.latencyMs;
      if (healthResult.shopName) checks.shopName = healthResult.shopName;
      if (healthResult.plan) checks.plan = healthResult.plan;

      let status: "healthy" | "degraded" | "unhealthy";
      if (missing.length > 0 || !healthResult.reachable) {
        status = "unhealthy";
      } else if (!healthResult.authenticated) {
        status = "degraded";
      } else {
        status = "healthy";
      }

      const result = {
        status,
        checks,
        ...(healthResult.error ? { error: healthResult.error } : {}),
      };

      logger.info("health_check", { status });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return {
    tools: getToolDefinitions(),
    handlers: getToolHandlers(client),
  };
}
