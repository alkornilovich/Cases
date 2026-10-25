-- Загрузка данных кейса в PostgreSQL и роль только на чтение для бота.
-- psql -d puzzle -f scripts/load_postgres.sql   (запускать из корня проекта)
CREATE TABLE regions (region_id int PRIMARY KEY, region_name text, regional_center text);
CREATE TABLE outlets (outlet_id int PRIMARY KEY, outlet_name text, region_id int, city text, outlet_type text, address text, opened_date date, closed_date date);
CREATE TABLE products (product_id int PRIMARY KEY, product_name text, category text, unit_price numeric, unit text, launch_date date, discontinued_date date);
CREATE TABLE clients (client_id int PRIMARY KEY, client_name text, inn text, segment text, region_id int, registered_date date, is_key_client boolean);
CREATE TABLE contracts (contract_id int PRIMARY KEY, contract_number text, client_id int, start_date date, end_date date, status text, payment_terms_days int, base_discount_pct numeric);
CREATE TABLE sales (sale_id int PRIMARY KEY, sale_date date, contract_id int, client_id int, outlet_id int, product_id int, quantity int, amount numeric);
CREATE TABLE sales_plan (plan_id int PRIMARY KEY, plan_month date, outlet_id int, product_id int, plan_amount numeric, plan_qty int);
CREATE TABLE discounts (discount_id int PRIMARY KEY, sale_id int, client_id int, discount_date date, discount_amount numeric, discount_pct numeric, reason text);
\copy regions FROM 'data/regions.csv' CSV HEADER NULL '\N'
\copy outlets FROM 'data/outlets.csv' CSV HEADER NULL '\N'
\copy products FROM 'data/products.csv' CSV HEADER NULL '\N'
\copy clients FROM 'data/clients.csv' CSV HEADER NULL '\N'
\copy contracts FROM 'data/contracts.csv' CSV HEADER NULL '\N'
\copy sales FROM 'data/sales.csv' CSV HEADER NULL '\N'
\copy sales_plan FROM 'data/sales_plan.csv' CSV HEADER NULL '\N'
\copy discounts FROM 'data/discounts.csv' CSV HEADER NULL '\N'
CREATE ROLE bi_bot LOGIN PASSWORD 'change_me';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_bot;
ALTER ROLE bi_bot SET default_transaction_read_only = on;
ALTER ROLE bi_bot SET statement_timeout = '15s';
