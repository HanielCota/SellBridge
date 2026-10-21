-- Translate only the built-in English labels; preserve category IDs and customized names.
UPDATE categories AS category
SET name = translation.portuguese_name
FROM (VALUES
  ('moda-feminina', 'Women''s clothing', 'Moda feminina'),
  ('moda-masculina', 'Men''s clothing', 'Moda masculina'),
  ('calcados', 'Footwear', 'Calçados'),
  ('acessorios', 'Accessories', 'Acessórios'),
  ('beleza', 'Beauty and personal care', 'Beleza e cuidados pessoais'),
  ('casa', 'Home and decor', 'Casa e decoração'),
  ('cozinha', 'Kitchen', 'Cozinha'),
  ('eletronicos', 'Electronics and accessories', 'Eletrônicos e acessórios'),
  ('pet', 'Pet supplies', 'Produtos para animais'),
  ('fitness', 'Fitness', 'Esporte e atividade física'),
  ('papelaria', 'Stationery', 'Papelaria'),
  ('infantil', 'Children and toys', 'Infantil e brinquedos')
) AS translation(slug, english_name, portuguese_name)
WHERE category.slug = translation.slug AND category.name = translation.english_name;
