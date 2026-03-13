// Companies tools — Shopify Admin API 2024-01 (GraphQL) — B2B
// Covers: list_companies, get_company, create_company, update_company, delete_company, list_company_contacts, create_company_contact, list_company_locations, create_company_location

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListCompaniesSchema = z.object({
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
  query: z.string().optional().describe("Filter (e.g. name:Acme)"),
});

const GetCompanySchema = z.object({
  id: z.string().describe("Company GID"),
});

const CreateCompanySchema = z.object({
  name: z.string().describe("Company name"),
  externalId: z.string().optional().describe("External ID for mapping to external system"),
  note: z.string().optional().describe("Internal note about the company"),
  companyLocation: z.object({
    name: z.string().optional().describe("Location name (defaults to company name)"),
    phone: z.string().optional(),
    billingAddress: z.object({
      address1: z.string().optional(),
      city: z.string().optional(),
      countryCode: z.string().optional().describe("ISO 2-letter country code"),
      provinceCode: z.string().optional(),
      zip: z.string().optional(),
    }).optional(),
    shippingAddress: z.object({
      address1: z.string().optional(),
      city: z.string().optional(),
      countryCode: z.string().optional(),
      provinceCode: z.string().optional(),
      zip: z.string().optional(),
    }).optional(),
    taxExemptions: z.array(z.string()).optional().describe("Tax exemption codes"),
  }).optional().describe("Primary company location"),
  companyContact: z.object({
    customerId: z.string().optional().describe("Existing customer GID to make a contact"),
    title: z.string().optional().describe("Contact job title"),
    locale: z.string().optional(),
  }).optional().describe("Primary company contact"),
});

const UpdateCompanySchema = z.object({
  companyId: z.string().describe("Company GID"),
  name: z.string().optional(),
  externalId: z.string().optional(),
  note: z.string().optional(),
});

const DeleteCompanySchema = z.object({
  id: z.string().describe("Company GID to delete"),
});

const ListContactsSchema = z.object({
  companyId: z.string().describe("Company GID"),
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
});

const CreateContactSchema = z.object({
  companyId: z.string().describe("Company GID"),
  customerId: z.string().describe("Customer GID to create as contact"),
  title: z.string().optional().describe("Contact job title"),
  locale: z.string().optional(),
  roleAssignments: z.array(z.object({
    companyContactRoleId: z.string().describe("Role GID to assign"),
    companyLocationId: z.string().describe("Location GID for the role"),
  })).optional().describe("Role assignments for the contact"),
});

const ListLocationsSchema = z.object({
  companyId: z.string().describe("Company GID"),
  first: z.number().min(1).max(250).optional().default(50),
  after: z.string().optional(),
});

const CreateLocationSchema = z.object({
  companyId: z.string().describe("Company GID"),
  name: z.string().describe("Location name"),
  phone: z.string().optional(),
  billingAddress: z.object({
    address1: z.string().optional(),
    city: z.string().optional(),
    countryCode: z.string().optional(),
    provinceCode: z.string().optional(),
    zip: z.string().optional(),
  }).optional(),
  shippingAddress: z.object({
    address1: z.string().optional(),
    city: z.string().optional(),
    countryCode: z.string().optional(),
    provinceCode: z.string().optional(),
    zip: z.string().optional(),
  }).optional(),
  taxExemptions: z.array(z.string()).optional(),
  paymentTermsTemplateId: z.string().optional().describe("Default payment terms template GID"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_companies",
      title: "List Companies (B2B)",
      description: "List B2B companies on the store. Returns company GIDs, names, external IDs, location count, and contact count. Use for B2B wholesale operations.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
          query: { type: "string", description: "Filter query" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_company",
      title: "Get Company (B2B)",
      description: "Get a B2B company by GID. Returns full details including contacts, locations, payment terms, and catalogs.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Company GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_company",
      title: "Create Company (B2B)",
      description: "Create a new B2B company with optional initial location and contact. Companies represent wholesale/B2B buyers and enable custom pricing, payment terms, and catalog access.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Company name" },
          externalId: { type: "string", description: "External system ID" },
          note: { type: "string", description: "Internal note" },
          companyLocation: { type: "object", description: "Initial location details" },
          companyContact: { type: "object", description: "Initial contact (existing customer GID)" },
        },
        required: ["name"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_company",
      title: "Update Company (B2B)",
      description: "Update a B2B company name, external ID, or note.",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string", description: "Company GID" },
          name: { type: "string", description: "New name" },
          externalId: { type: "string", description: "External ID" },
          note: { type: "string", description: "Internal note" },
        },
        required: ["companyId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_company",
      title: "Delete Company (B2B)",
      description: "Delete a B2B company and all associated locations and contacts.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Company GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "list_company_contacts",
      title: "List Company Contacts",
      description: "List all contacts for a B2B company. Returns contact GIDs, customer details, and assigned roles.",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string", description: "Company GID" },
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
        },
        required: ["companyId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_company_contact",
      title: "Create Company Contact",
      description: "Add an existing Shopify customer as a contact for a B2B company. Optionally assign roles at specific company locations.",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string", description: "Company GID" },
          customerId: { type: "string", description: "Customer GID" },
          title: { type: "string", description: "Job title" },
          locale: { type: "string", description: "Locale" },
          roleAssignments: { type: "array", description: "Role assignments" },
        },
        required: ["companyId", "customerId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "list_company_locations",
      title: "List Company Locations",
      description: "List all locations for a B2B company. Returns location GIDs, names, addresses, and assigned payment terms.",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string", description: "Company GID" },
          first: { type: "number", description: "Number of results" },
          after: { type: "string", description: "Pagination cursor" },
        },
        required: ["companyId"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_company_location",
      title: "Create Company Location",
      description: "Add a new location to a B2B company. Locations can have different shipping/billing addresses, tax exemptions, and payment terms.",
      inputSchema: {
        type: "object",
        properties: {
          companyId: { type: "string", description: "Company GID" },
          name: { type: "string", description: "Location name" },
          phone: { type: "string", description: "Phone number" },
          billingAddress: { type: "object", description: "Billing address" },
          shippingAddress: { type: "object", description: "Shipping address" },
          taxExemptions: { type: "array", description: "Tax exemption codes" },
          paymentTermsTemplateId: { type: "string", description: "Payment terms template GID" },
        },
        required: ["companyId", "name"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown>) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    list_companies: async (args) => {
      const { first, after, query } = ListCompaniesSchema.parse(args);
      const q = `query($first:Int!,$after:String,$query:String){companies(first:$first,after:$after,query:$query){edges{node{id name externalId locationsCount{count} contactsCount{count}}}pageInfo{hasNextPage endCursor}}}`;
      const data = await logger.time("tool.list_companies", () => gql(q, { first, after, query }), { tool: "list_companies" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    get_company: async (args) => {
      const { id } = GetCompanySchema.parse(args);
      const q = `query($id:ID!){company(id:$id){id name externalId note createdAt updatedAt contacts(first:10){edges{node{id customer{id displayName email}}}} locations(first:10){edges{node{id name}}}}}`;
      const data = await logger.time("tool.get_company", () => gql(q, { id }), { tool: "get_company" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    create_company: async (args) => {
      const params = CreateCompanySchema.parse(args);
      const q = `mutation companyCreate($input:CompanyCreateInput!){companyCreate(input:$input){company{id name}userErrors{field message}}}`;
      const data = await logger.time("tool.create_company", () => gql(q, { input: params }), { tool: "create_company" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    update_company: async (args) => {
      const { companyId, ...input } = UpdateCompanySchema.parse(args);
      const q = `mutation companyUpdate($companyId:ID!,$input:CompanyInput!){companyUpdate(companyId:$companyId,input:$input){company{id name}userErrors{field message}}}`;
      const data = await logger.time("tool.update_company", () => gql(q, { companyId, input }), { tool: "update_company" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    delete_company: async (args) => {
      const { id } = DeleteCompanySchema.parse(args);
      const q = `mutation companyDelete($id:ID!){companyDelete(id:$id){deletedCompanyId userErrors{field message}}}`;
      const data = await logger.time("tool.delete_company", () => gql(q, { id }), { tool: "delete_company" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    list_company_contacts: async (args) => {
      const { companyId, first, after } = ListContactsSchema.parse(args);
      const q = `query($companyId:ID!,$first:Int!,$after:String){company(id:$companyId){contacts(first:$first,after:$after){edges{node{id title customer{id displayName email}roleAssignments(first:5){edges{node{role{name}}}}}}pageInfo{hasNextPage endCursor}}}}`;
      const data = await logger.time("tool.list_company_contacts", () => gql(q, { companyId, first, after }), { tool: "list_company_contacts" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    create_company_contact: async (args) => {
      const { companyId, customerId, title, locale, roleAssignments } = CreateContactSchema.parse(args);
      const q = `mutation companyContactCreate($companyId:ID!,$input:CompanyContactInput!){companyContactCreate(companyId:$companyId,input:$input){companyContact{id title customer{id displayName}}userErrors{field message}}}`;
      const data = await logger.time("tool.create_company_contact", () => gql(q, { companyId, input: { customerId, title, locale, roleAssignments } }), { tool: "create_company_contact" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    list_company_locations: async (args) => {
      const { companyId, first, after } = ListLocationsSchema.parse(args);
      const q = `query($companyId:ID!,$first:Int!,$after:String){company(id:$companyId){locations(first:$first,after:$after){edges{node{id name phone billingAddress{address1 city countryCode zip}}}pageInfo{hasNextPage endCursor}}}}`;
      const data = await logger.time("tool.list_company_locations", () => gql(q, { companyId, first, after }), { tool: "list_company_locations" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
    create_company_location: async (args) => {
      const { companyId, ...locationInput } = CreateLocationSchema.parse(args);
      const q = `mutation companyLocationCreate($companyId:ID!,$input:CompanyLocationInput!){companyLocationCreate(companyId:$companyId,input:$input){companyLocation{id name}userErrors{field message}}}`;
      const data = await logger.time("tool.create_company_location", () => gql(q, { companyId, input: locationInput }), { tool: "create_company_location" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
