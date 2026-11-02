import type { AnalysisReport } from "../core/report-schema";
import type { Label } from "./labels";

// Comprobaciones automáticas de un informe frente a su etiqueta. No sustituyen
// la revisión humana: sirven para detectar rápido los fallos más graves,
// sobre todo las invenciones.

export type ModelOutcome =
  | "correct" // modelo esperado y acertado
  | "partial" // uno contiene al otro (B450 frente a PRIME B450M-A): revisar a mano
  | "wrong" // modelo esperado y el informe da otro
  | "abstained" // modelo esperado y el informe no da ninguno
  | "null_ok" // no hay modelo visible y el informe no lo inventa
  | "suspect"; // no hay modelo visible y el informe da uno: revisar a mano

export type DamageOutcome =
  | "detected"
  | "missed"
  | "abstained"
  | "true_negative"
  | "false_alarm"
  | "possible_flag" // sin daño real, pero el informe lo marca como posible
  | "not_scored";

export interface Score {
  categoryOk: boolean;
  model: ModelOutcome;
  damage: DamageOutcome;
  // Incumplimientos de las reglas de fiabilidad del prompt.
  violations: string[];
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function scoreReport(report: AnalysisReport, label: Label): Score {
  const id = report.identification;
  const violations: string[] = [];

  let model: ModelOutcome;
  if (label.model) {
    if (!id.model) model = "abstained";
    else {
      const [a, b] = [normalize(id.model), normalize(label.model)];
      model = a === b ? "correct" : a.includes(b) || b.includes(a) ? "partial" : "wrong";
    }
  } else {
    model = id.model ? "suspect" : "null_ok";
  }

  const status = report.diagnosis.status;
  let damage: DamageOutcome = "not_scored";
  if (label.damage === "yes") {
    damage = status === "cannot_assess" ? "abstained" : status === "no_visible_damage" ? "missed" : "detected";
  } else if (label.damage === "no") {
    damage =
      status === "visible_damage" ? "false_alarm" : status === "possible_damage" ? "possible_flag" : "true_negative";
  }

  if (label.category === "not_electronic" && report.image_assessment.shows_electronics) {
    violations.push("Trata como electrónica una imagen que no lo es.");
  }
  const knowledgeSpecs = report.specifications.filter((s) => s.source === "model_knowledge");
  if (knowledgeSpecs.length && (!id.model || id.confidence !== "high")) {
    violations.push(
      `Da ${knowledgeSpecs.length} especificación(es) «de conocimiento» sin modelo identificado con confianza alta.`,
    );
  }
  if (report.documentation_query && !id.model) {
    violations.push("Propone buscar documentación sin haber identificado el modelo.");
  }
  if (id.model && id.confidence === "low") {
    violations.push("Da un modelo concreto con confianza baja.");
  }
  // Con un síntoma descrito por el usuario, las hipótesis sin anomalía visible son legítimas.
  if (!label.context && report.diagnosis.hypotheses.length && report.observations.every((o) => o.kind !== "anomaly")) {
    violations.push("Plantea hipótesis de avería sin ninguna anomalía observada.");
  }

  return { categoryOk: report.identification.category === label.category, model, damage, violations };
}
