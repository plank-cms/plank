INSERT INTO plank_settings (namespace, key, value)
VALUES ('general', 'timezone', 'UTC')
ON CONFLICT (namespace, key) DO NOTHING;
