import { connection } from "next/server";
import { DiagnosticApp } from "@/components/DiagnosticApp";
import { activeModel, isFreeTierModel } from "@/lib/config";

export default async function Home() {
  // La configuración del modelo se lee en cada petición, no al compilar.
  await connection();
  return <DiagnosticApp testMode={isFreeTierModel(activeModel())} />;
}
