import { redirect } from "next/navigation";

export default function MedicoConsultasPage() {
  // A tela completa do médico já existe e inclui:
  // - lista de pacientes/consultas
  // - seleção do paciente
  // - geração de receita e atestado
  redirect("/tela-do-medico");
}

