import type * as z from "zod/v4";
import type { AnalysisReport, ComponentCategory, Hazard } from "./report-schema";

type HazardId = z.infer<typeof Hazard>;
type Category = z.infer<typeof ComponentCategory>;

// Los avisos de seguridad no dependen del criterio del modelo: el modelo
// señala riesgos y la categoría del componente añade los que siempre aplican.
// El texto de cada aviso es fijo y lo revisamos nosotros, no se genera.

const IMPLIED_BY_CATEGORY: Partial<Record<Category, HazardId[]>> = {
  power_supply: ["mains_voltage", "charged_capacitors"],
  appliance_board: ["mains_voltage", "charged_capacitors"],
  battery: ["lithium_battery", "chemical"],
  motherboard: ["esd_sensitive"],
  graphics_card: ["esd_sensitive"],
  ram_module: ["esd_sensitive"],
  cpu: ["esd_sensitive"],
};

export const SAFETY_WARNINGS: Record<HazardId, { level: "danger" | "caution"; text: string }> = {
  mains_voltage: {
    level: "danger",
    text: "Este equipo funciona con tensión de red. Desconéctalo antes de abrirlo y no midas con él enchufado salvo que tengas formación y equipo adecuados.",
  },
  high_voltage: {
    level: "danger",
    text: "Puede haber alta tensión (retroiluminación, fuentes, microondas, flashes). Un contacto puede ser mortal. Recomendamos un técnico cualificado.",
  },
  charged_capacitors: {
    level: "danger",
    text: "Los condensadores grandes pueden conservar carga peligrosa con el equipo desenchufado. Descárgalos de forma segura y comprueba la tensión antes de tocarlos.",
  },
  lithium_battery: {
    level: "danger",
    text: "Una batería de litio dañada o hinchada puede incendiarse. No la perfores, no la dobles ni la cargues; guárdala en un lugar no inflamable y llévala a un punto de reciclaje.",
  },
  thermal: {
    level: "caution",
    text: "Riesgo de quemaduras: disipadores, reguladores y el soldador pueden alcanzar temperaturas altas.",
  },
  chemical: {
    level: "caution",
    text: "Electrolito, corrosión o restos de batería pueden ser irritantes. Usa guantes, ventila la zona y no los toques con la piel.",
  },
  esd_sensitive: {
    level: "caution",
    text: "Componente sensible a la electricidad estática. Trabaja con pulsera antiestática o descárgate tocando una superficie metálica conectada a tierra.",
  },
};

export function safetyWarnings(report: AnalysisReport) {
  const hazards = new Set<HazardId>([
    ...report.safety.hazards,
    ...(IMPLIED_BY_CATEGORY[report.identification.category] ?? []),
  ]);
  return [...hazards]
    .map((id) => ({ id, ...SAFETY_WARNINGS[id] }))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1));
}
