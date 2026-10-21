-- Required reference data must be available without the optional demo seed.
-- Keep existing category IDs and names, including customized legacy categories.
INSERT INTO "categories" ("slug", "name") VALUES
  ('moda-feminina', 'Women''s clothing'),
  ('moda-masculina', 'Men''s clothing'),
  ('calcados', 'Footwear'),
  ('acessorios', 'Accessories'),
  ('beleza', 'Beauty and personal care'),
  ('casa', 'Home and decor'),
  ('cozinha', 'Kitchen'),
  ('eletronicos', 'Electronics and accessories'),
  ('pet', 'Pet supplies'),
  ('fitness', 'Fitness'),
  ('papelaria', 'Stationery'),
  ('infantil', 'Children and toys')
ON CONFLICT ("slug") DO NOTHING;
