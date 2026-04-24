CREATE TABLE wheel_items (
  id         TEXT    PRIMARY KEY,
  emoji      TEXT    NOT NULL DEFAULT '🍽️',
  zh         TEXT    NOT NULL,
  en         TEXT    NOT NULL,
  added_by   TEXT,
  created_at INTEGER NOT NULL
);

-- Seed with current default items
INSERT INTO wheel_items (id, emoji, zh, en, added_by, created_at) VALUES
  ('wi-01', '🍜', '牛肉粉',   'Beef Noodle Soup',       NULL, 1700000001000),
  ('wi-02', '🍝', '肠旺面',   'Changwang Noodles',       NULL, 1700000002000),
  ('wi-03', '🍢', '串串',     'Skewers',                 NULL, 1700000003000),
  ('wi-04', '🍗', '辣子鸡',   'Spicy Chicken',           NULL, 1700000004000),
  ('wi-05', '🫕', '糯米饭',   'Sticky Rice',             NULL, 1700000005000),
  ('wi-06', '🐷', '猪脚饭',   'Pork Trotter Rice',       NULL, 1700000006000),
  ('wi-07', '🌶️', '酸辣粉',  'Hot & Sour Noodles',      NULL, 1700000007000),
  ('wi-08', '🥟', '小笼包',   'Soup Dumplings',          NULL, 1700000008000),
  ('wi-09', '🍚', '小米粥',   'Millet Congee',           NULL, 1700000009000),
  ('wi-10', '🥘', '黄焖鸡',   'Braised Chicken',         NULL, 1700000010000),
  ('wi-11', '🍱', '盖浇饭',   'Rice Bowl',               NULL, 1700000011000),
  ('wi-12', '🍜', '螺蛳粉',   'Luosifen Noodles',        NULL, 1700000012000),
  ('wi-13', '🥘', '麻辣烫',   'Spicy Hot Pot',           NULL, 1700000013000),
  ('wi-14', '☕', '咖啡+面包', 'Coffee & Bread',          NULL, 1700000014000),
  ('wi-15', '🍕', '披萨',     'Pizza',                   NULL, 1700000015000),
  ('wi-16', '🍗', '炸鸡',     'Fried Chicken',           NULL, 1700000016000),
  ('wi-17', '🍔', '汉堡',     'Burger',                  NULL, 1700000017000),
  ('wi-18', '🍣', '寿司',     'Sushi',                   NULL, 1700000018000),
  ('wi-19', '🫔', '肉夹馍',   'Pork Flatbread',          NULL, 1700000019000),
  ('wi-20', '🍲', '砂锅粥',   'Clay Pot Congee',         NULL, 1700000020000),
  ('wi-21', '🥪', '三明治',   'Sandwich',                NULL, 1700000021000),
  ('wi-22', '🥗', '凉拌面',   'Cold Noodles',            NULL, 1700000022000),
  ('wi-23', '🦴', '排骨粥',   'Spare Rib Congee',        NULL, 1700000023000);
