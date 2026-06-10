import { z } from "zod";

const layoutSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const viewportSchema = z.tuple([z.number(), z.number(), z.number()]);

const sourceSchema = z.union([
  z.tuple([z.literal("note"), z.string()]),
  z.tuple([z.literal("heading"), z.string(), z.string()]),
  z.tuple([z.literal("block"), z.string(), z.string()]),
  z.tuple([z.literal("text"), z.string()]),
  z.tuple([z.literal("image"), z.string()]),
  z.tuple([z.literal("attachment"), z.string()]),
  z.tuple([z.literal("url"), z.string()]),
]);

const kindSchema = z.enum(["note", "heading", "block", "text", "image", "attachment", "url"]);
const statusSchema = z.enum(["draft", "in-progress", "done", "archived"]);
const prioritySchema = z.enum(["low", "medium", "high", "critical"]);

const nodeSchema = z
  .object({
    k: kindSchema,
    s: sourceSchema,
    l: layoutSchema,
    st: statusSchema.optional(),
    p: prioritySchema.optional(),
    cl: z.string().nullable().optional(),
    col: z.string().optional(),
    i: z.string().optional(),
  })
  .strict();

const clusterSchema = z
  .object({
    h: z.string(),
    src: sourceSchema.optional(),
    l: layoutSchema,
    col: z.string().optional(),
    collapsed: z.boolean().optional(),
  })
  .strict();

const endpointSchema = z.tuple([z.enum(["node", "cluster"]), z.string()]);

const edgeObjectSchema = z
  .object({
    from: endpointSchema,
    to: endpointSchema,
    d: z.boolean().optional(),
    lbl: z.string().optional(),
    col: z.string().optional(),
    dash: z.boolean().optional(),
  })
  .strict();

const edgeTupleSchema = z.tuple([z.string(), z.string(), z.union([z.literal(0), z.literal(1)])]);

const edgeSchema = z.union([edgeTupleSchema, edgeObjectSchema]);

export const compactStateSchema = z
  .object({
    v: z.number(),
    id: z.string(),
    n: z.record(z.string(), nodeSchema).default({}),
    c: z.record(z.string(), clusterSchema).default({}),
    e: z.record(z.string(), edgeSchema).default({}),
    vp: viewportSchema.optional(),
  })
  .strict();

export type CompactState = z.infer<typeof compactStateSchema>;
export type CompactSource = z.infer<typeof sourceSchema>;
export type CompactNode = z.infer<typeof nodeSchema>;
export type CompactCluster = z.infer<typeof clusterSchema>;
export type CompactEdge = z.infer<typeof edgeSchema>;
