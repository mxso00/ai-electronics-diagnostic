import * as z from "zod/v4";

export const DocType = z.enum(["manual", "product", "specs", "firmware", "support", "datasheet", "other"]);
export type DocType = z.infer<typeof DocType>;

export const DocLink = z.object({
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  type: DocType,
  official: z.boolean(),
});
export type DocLink = z.infer<typeof DocLink>;

export const DocsResult = z.object({
  manufacturer: z.string().nullable(),
  model: z.string(),
  // Dominio oficial del fabricante, si lo conocemos (para sugerir dónde buscar).
  officialSite: z.string().nullable(),
  links: z.array(DocLink),
  checkedAt: z.number(),
});
export type DocsResult = z.infer<typeof DocsResult>;

export class DocsError extends Error {
  constructor(
    readonly code: "not_configured" | "quota" | "rate_limited" | "service_unavailable",
    message: string,
  ) {
    super(message);
  }
}
