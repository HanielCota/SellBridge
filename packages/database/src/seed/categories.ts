export interface SeedCategory {
  slug: string;
  name: string;
}

export const CATEGORIES: SeedCategory[] = [
  { slug: "moda-feminina", name: "Moda feminina" },
  { slug: "moda-masculina", name: "Moda masculina" },
  { slug: "calcados", name: "Calçados" },
  { slug: "acessorios", name: "Acessórios" },
  { slug: "beleza", name: "Beleza e cuidados" },
  { slug: "casa", name: "Casa e decoração" },
  { slug: "cozinha", name: "Cozinha" },
  { slug: "eletronicos", name: "Eletrônicos e acessórios" },
  { slug: "pet", name: "Pet shop" },
  { slug: "fitness", name: "Fitness" },
  { slug: "papelaria", name: "Papelaria" },
  { slug: "infantil", name: "Infantil e brinquedos" },
];
