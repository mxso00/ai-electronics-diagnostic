import * as z from "zod/v4";

// Contrato del informe de análisis. Es la pieza central del producto: la
// interfaz pinta exactamente esto y nada más. Los identificadores van en
// inglés; los textos que genera el modelo, en español.
//
// Reglas de diseño:
// - Todo campo que pueda no conocerse es nullable: preferimos null a inventar.
// - Cada afirmación lleva su origen (observado / hipótesis / por comprobar)
//   o su nivel de confianza, para que la interfaz pueda distinguirlos.

export const Confidence = z.enum(["high", "medium", "low"]);

export const ComponentCategory = z.enum([
  "motherboard",
  "graphics_card",
  "ram_module",
  "cpu",
  "power_supply",
  "storage_device",
  "appliance_board",
  "pcb_assembly",
  "electronic_module",
  "integrated_circuit",
  "capacitor",
  "resistor",
  "transistor",
  "diode",
  "inductor",
  "connector",
  "cable",
  "battery",
  "other_electronic",
  "not_electronic",
  "unknown",
]);

export const Hazard = z.enum([
  "mains_voltage",
  "high_voltage",
  "charged_capacitors",
  "lithium_battery",
  "thermal",
  "chemical",
  "esd_sensitive",
]);

export const Difficulty = z.enum(["beginner", "intermediate", "advanced"]);

export const AnalysisReport = z.object({
  summary: z.string().describe("Una o dos frases con lo esencial del análisis, en español."),

  image_assessment: z.object({
    shows_electronics: z.boolean(),
    quality: z.enum(["good", "acceptable", "poor"]),
    issues: z
      .array(z.string())
      .describe("Problemas de la foto que limitan el análisis: desenfoque, reflejos, zona cortada…"),
  }),

  identification: z.object({
    category: ComponentCategory,
    name: z.string().describe("Nombre descriptivo en español, p. ej. «Placa base ATX»."),
    manufacturer: z.string().nullable(),
    model: z.string().nullable().describe("Solo si se lee en la imagen o se deduce sin ambigüedad. Si no, null."),
    visible_markings: z.array(z.string()).describe("Texto leído literalmente en la imagen, sin corregir ni completar."),
    basis: z.string().describe("En qué se basa la identificación."),
    confidence: Confidence,
  }),

  function_description: z
    .string()
    .nullable()
    .describe("Para qué sirve el componente dentro del circuito o del equipo."),

  specifications: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        source: z
          .enum(["visible_marking", "model_knowledge"])
          .describe(
            "visible_marking: impreso en el componente. model_knowledge: conocido para ese modelo exacto; nunca para modelos aproximados.",
          ),
      }),
    )
    .describe("Vacío si no hay especificaciones verificables."),

  observations: z
    .array(
      z.object({
        description: z.string(),
        location: z
          .string()
          .describe("Dónde está en la imagen, en palabras: «esquina superior izquierda, junto al zócalo»."),
        kind: z.enum(["normal", "anomaly"]),
      }),
    )
    .describe("Solo hechos visibles en la foto, sin interpretar."),

  diagnosis: z.object({
    status: z.enum(["no_visible_damage", "possible_damage", "visible_damage", "cannot_assess"]),
    hypotheses: z.array(
      z.object({
        fault: z.string(),
        reasoning: z.string().describe("Qué observaciones apoyan esta hipótesis."),
        possible_causes: z.array(z.string()),
        confidence: Confidence,
      }),
    ),
    limitations: z
      .string()
      .describe("Qué no se puede saber desde esta foto (fallos eléctricos, internos, zonas no visibles…)."),
  }),

  checks: z
    .array(
      z.object({
        action: z.string(),
        purpose: z.string().describe("Qué hipótesis confirma o descarta."),
        tools: z.array(z.string()),
        requires_power: z.boolean().describe("true si exige el equipo encendido o conectado."),
        difficulty: Difficulty,
      }),
    )
    .describe("Comprobaciones pendientes para confirmar el diagnóstico."),

  solutions: z.array(
    z.object({
      action: z.string(),
      when: z.string().describe("En qué caso aplica (p. ej. «si se confirma el condensador abierto»)."),
      difficulty: Difficulty,
    }),
  ),

  safety: z.object({
    hazards: z.array(Hazard),
    notes: z.string().nullable(),
  }),

  professional_help: z.object({
    recommended: z.boolean(),
    reason: z.string().nullable(),
  }),

  documentation_query: z
    .string()
    .nullable()
    .describe("Fabricante y modelo exactos para buscar documentación. null si el modelo no es seguro."),

  follow_up: z
    .array(z.string())
    .describe("Fotos o datos adicionales que mejorarían el análisis. Vacío si no hacen falta."),
});

export type AnalysisReport = z.infer<typeof AnalysisReport>;

// Qué quiere averiguar el usuario (paso 2 del flujo).
export const AnalysisGoal = z.enum(["auto", "identify", "damage", "explain", "documentation"]);
export type AnalysisGoal = z.infer<typeof AnalysisGoal>;

export const UserLevel = z.enum(["beginner", "intermediate", "expert"]);
export type UserLevel = z.infer<typeof UserLevel>;
