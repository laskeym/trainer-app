alter table workout_session add column scheduled_start timestamptz;
alter table workout_session add column scheduled_end timestamptz;

-- Backfill: treat existing scheduled_date as a default 9am start, 1hr session
update workout_session
set scheduled_start = scheduled_date::timestamptz + interval '9 hours',
    scheduled_end = scheduled_date::timestamptz + interval '10 hours'
where scheduled_start is null;

alter table workout_session alter column scheduled_start set not null;
alter table workout_session drop column scheduled_date;
