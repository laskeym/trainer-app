-- 1. Safely add static fields to the parent client table structure
alter table public.client 
    add column if not exists height numeric,
    add column if not exists fitness_goals text,
    add column if not exists medical_constraints text default 'None' not null;

-- 2. Clean up redundant columns from the dynamic metrics table
alter table public.client_metric 
    drop column if exists height;
