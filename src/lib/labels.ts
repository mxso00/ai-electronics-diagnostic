import type * as z from "zod/v4";
import type { AnalysisGoal, AnalysisReport, ComponentCategory, UserLevel } from "@/core/report-schema";

// Textos en español para los valores del informe.

type Category = z.infer<typeof ComponentCategory>;
type Report = AnalysisReport;

export const CATEGORY_LABEL: Record<Category, string> = {
  motherboard: "Placa base",
  graphics_card: "Tarjeta gráfica",
  ram_module: "Memoria RAM",
  cpu: "Procesador",
  power_supply: "Fuente de alimentación",
  storage_device: "Almacenamiento",
  appliance_board: "Placa de electrodoméstico",
  pcb_assembly: "Placa de circuito",
  electronic_module: "Módulo electrónico",
  integrated_circuit: "Circuito integrado",
  capacitor: "Condensador",
  resistor: "Resistencia",
  transistor: "Transistor",
  diode: "Diodo",
  inductor: "Bobina",
  connector: "Conector",
  cable: "Cable",
  battery: "Batería",
  other_electronic: "Componente electrónico",
  not_electronic: "No es electrónica",
  unknown: "Sin identificar",
};

export const CONFIDENCE_LABEL: Record<Report["identification"]["confidence"], string> = {
  high: "Confianza alta",
  medium: "Confianza media",
  low: "Confianza baja",
};

export const STATUS: Record<
  Report["diagnosis"]["status"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  no_visible_damage: { label: "Sin daños visibles", tone: "success" },
  possible_damage: { label: "Posible daño", tone: "warning" },
  visible_damage: { label: "Daño visible", tone: "danger" },
  cannot_assess: { label: "No se puede valorar con esta foto", tone: "neutral" },
};

export const DIFFICULTY_LABEL: Record<Report["checks"][number]["difficulty"], string> = {
  beginner: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

// "documentation" no se ofrece aún: la búsqueda de documentación no está
// implementada y no queremos prometer algo que no hacemos.
export const GOALS: { value: z.infer<typeof AnalysisGoal>; label: string; hint: string }[] = [
  { value: "auto", label: "Automático", hint: "Identificación y estado" },
  { value: "identify", label: "Identificar", hint: "Qué es exactamente" },
  { value: "damage", label: "Detectar daños", hint: "Averías visibles" },
  { value: "explain", label: "Cómo funciona", hint: "Para qué sirve" },
];

export const LEVELS: { value: z.infer<typeof UserLevel>; label: string }[] = [
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "expert", label: "Avanzado" },
];
