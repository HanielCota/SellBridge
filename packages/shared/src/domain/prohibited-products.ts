/**
 * Item classes the marketplaces we publish to refuse: medicines, encapsulated supplements,
 * tobacco, weapons, pesticides and live animals. A supplier product whose title or description
 * names one never reaches review — `supplier-panel-catalog-completeness.ts` blocks the submission
 * and the reviewer's "Produto proibido" reason stays for what only a person can spot.
 */

export interface ProhibitedProductGroup {
  readonly id: string;
  readonly label: string;
  /** Lowercase, accent-free words or phrases. A match is the whole word or phrase, never a piece. */
  readonly terms: readonly string[];
}

export const PROHIBITED_PRODUCT_GROUPS = [
  {
    id: "medicines",
    label: "Medicamentos",
    terms: [
      "medicamento",
      "medicamentos",
      "remedio",
      "remedios",
      "antibiotico",
      "antibioticos",
      "anti-inflamatorio",
      "antiinflamatorio",
      "analgesico",
      "analgesicos",
      "tarja preta",
      "tarja vermelha",
      "receita medica",
      "uso controlado",
      "ampola injetavel",
    ],
  },
  {
    id: "supplements",
    label: "Suplementos e encapsulados",
    terms: [
      "encapsulado",
      "encapsulados",
      "em capsulas",
      "capsula gelatinosa",
      "capsulas gelatinosas",
      "softgel",
      "suplemento",
      "suplementos",
      "suplemento alimentar",
      "anabolizante",
      "anabolizantes",
      "emagrecedor",
      "emagrecedores",
      "termogenico",
      "termogenicos",
      "whey protein",
      "creatina",
      "hipercalorico",
      "pre-treino",
    ],
  },
  {
    id: "tobacco",
    label: "Tabaco e cigarros eletrônicos",
    terms: [
      "cigarro",
      "cigarros",
      "cigarro eletronico",
      "vape",
      "vaper",
      "pod descartavel",
      "narguile",
      "tabaco",
      "essencia para narguile",
    ],
  },
  {
    id: "weapons",
    label: "Armas e munições",
    terms: [
      "arma de fogo",
      "municao",
      "municoes",
      "revolver",
      "pistola",
      "soco ingles",
      "taser",
      "spray de pimenta",
    ],
  },
  {
    id: "pesticides",
    label: "Agrotóxicos e venenos",
    terms: ["agrotoxico", "agrotoxicos", "pesticida", "pesticidas", "raticida", "chumbinho"],
  },
  {
    id: "live_animals",
    label: "Animais vivos",
    terms: ["animal vivo", "animais vivos", "filhote vivo", "passaro vivo"],
  },
] as const satisfies readonly ProhibitedProductGroup[];

export interface ProhibitedProductMatch {
  readonly groupId: string;
  readonly label: string;
  readonly term: string;
}

function withoutAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function escapeForRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// These tool and storage names contain ambiguous class words without naming a restricted item.
// Remove only the named object: another restricted item in the same listing still blocks it.
const NON_RESTRICTED_PRODUCT_NAMES = [
  /(?<![\p{L}\p{N}])pistola\s+(?:de\s+)?(?:cola(?:\s+quente)?|pintura|silicone|massagem|massageadora)(?![\p{L}\p{N}])/gu,
  /(?<![\p{L}\p{N}])(?:organizador(?:a)?(?:\s+(?:semanal|diario|mensal))?|porta)[\s-]+(?:de\s+|para\s+)?(?:medicamentos|remedios)(?![\p{L}\p{N}])/gu,
];

function mentions(text: string, term: string): boolean {
  const wholeWord = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeForRegExp(term)}(?![\\p{L}\\p{N}])`,
    "u",
  );
  return wholeWord.test(text);
}

/**
 * The first prohibited class the text names, or `null` when it names none. Accents and case do
 * not matter; "cápsulas de café" is not a match because only whole terms count.
 */
export function findProhibitedProduct(text: string): ProhibitedProductMatch | null {
  const normalized = withoutAccents(text).toLowerCase();
  if (normalized.trim().length === 0) {
    return null;
  }
  const searchable = NON_RESTRICTED_PRODUCT_NAMES.reduce(
    (remaining, pattern) => remaining.replace(pattern, " "),
    normalized,
  );
  for (const group of PROHIBITED_PRODUCT_GROUPS) {
    const term = group.terms.find((candidate) => mentions(searchable, candidate));
    if (term !== undefined) {
      return { groupId: group.id, label: group.label, term };
    }
  }
  return null;
}

/** What a supplier reads when a product names a prohibited class. */
export function prohibitedProductMessage(match: ProhibitedProductMatch): string {
  return `Não aceitamos ${match.label.toLowerCase()}: o anúncio cita "${match.term}". Retire o produto ou corrija o texto.`;
}
