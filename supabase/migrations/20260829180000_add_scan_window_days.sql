alter table app_config add column if not exists scan_window_days integer not null default 90;
