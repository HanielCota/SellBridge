import { z } from "zod";

/** The 27 federative units, as suppliers and the catalog filters store them. */
export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export const stateSchema = z.enum(BRAZILIAN_STATES);
export type BrazilianState = z.infer<typeof stateSchema>;

/** Each state's full name, as people say it; the code alone is easy to mistake (AM, AP, AL). */
export const BRAZILIAN_STATE_NAMES: Readonly<Record<BrazilianState, string>> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

/** Each state's capital: the city most people there pick, so it leads the suggestions. */
export const BRAZILIAN_STATE_CAPITALS: Readonly<Record<BrazilianState, string>> = {
  AC: "Rio Branco",
  AL: "Maceió",
  AP: "Macapá",
  AM: "Manaus",
  BA: "Salvador",
  CE: "Fortaleza",
  DF: "Brasília",
  ES: "Vitória",
  GO: "Goiânia",
  MA: "São Luís",
  MT: "Cuiabá",
  MS: "Campo Grande",
  MG: "Belo Horizonte",
  PA: "Belém",
  PB: "João Pessoa",
  PR: "Curitiba",
  PE: "Recife",
  PI: "Teresina",
  RJ: "Rio de Janeiro",
  RN: "Natal",
  RS: "Porto Alegre",
  RO: "Porto Velho",
  RR: "Boa Vista",
  SC: "Florianópolis",
  SP: "São Paulo",
  SE: "Aracaju",
  TO: "Palmas",
};

/** "Roraima (RR)": the name people know, with the code the address keeps. */
export function stateLabel(state: BrazilianState): string {
  return `${BRAZILIAN_STATE_NAMES[state]} (${state})`;
}
