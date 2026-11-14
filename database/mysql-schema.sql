-- MySQL 8.x schema for Replay Console (session replay + OpenTelemetry spans).
-- Matches the queries in src/lib/replay-actions.ts and src/routes/api/public/*.ts.
--
--   mysql -u <user> -p < database/mysql-schema.sql
--
-- Creates the database if missing; change the name below if MYSQL_DATABASE in .env differs.

CREATE DATABASE IF NOT EXISTS replay_console CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE replay_console;

CREATE TABLE IF NOT EXISTS websites (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  site_key VARCHAR(100) NOT NULL,
  allowed_origins JSON NOT NULL,
  permitted_paths JSON NOT NULL,
  retention_days INT NOT NULL DEFAULT 30,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_websites_site_key (site_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per recorded page visit ("module"); session_id groups visits from one browser tab.
CREATE TABLE IF NOT EXISTS visits (
  id CHAR(36) NOT NULL PRIMARY KEY,
  website_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  user_agent VARCHAR(300) NULL,
  module VARCHAR(200) NOT NULL,
  url VARCHAR(2000) NOT NULL,
  path VARCHAR(1000) NOT NULL,
  started_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_visits_site_started (website_id, started_at),
  KEY idx_visits_session (session_id),
  CONSTRAINT fk_visits_website FOREIGN KEY (website_id) REFERENCES websites (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- rrweb events, stored in the order the recorder uploaded them (seq).
CREATE TABLE IF NOT EXISTS replay_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  visit_id CHAR(36) NOT NULL,
  seq INT NOT NULL,
  events JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_replay_chunks_visit_seq (visit_id, seq),
  CONSTRAINT fk_replay_chunks_visit FOREIGN KEY (visit_id) REFERENCES visits (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OpenTelemetry spans captured in the browser. start_time/end_time keep milliseconds (DATETIME(3))
-- because the replay page matches them against rrweb event timestamps.
CREATE TABLE IF NOT EXISTS telemetry_spans (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  visit_id CHAR(36) NOT NULL,
  trace_id VARCHAR(64) NULL,
  span_id VARCHAR(64) NULL,
  parent_span_id VARCHAR(64) NULL,
  name VARCHAR(200) NOT NULL,
  kind VARCHAR(50) NOT NULL DEFAULT 'INTERNAL',
  status VARCHAR(20) NOT NULL DEFAULT 'UNSET',
  duration_ms DECIMAL(12, 2) NOT NULL DEFAULT 0,
  start_time DATETIME(3) NOT NULL,
  end_time DATETIME(3) NOT NULL,
  attributes JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_spans_visit_start (visit_id, start_time),
  KEY idx_spans_trace (trace_id),
  CONSTRAINT fk_spans_visit FOREIGN KEY (visit_id) REFERENCES visits (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Built-in demo site used by /demo (it loads recorder.js with data-site-key="demo-site-key").
INSERT IGNORE INTO websites (id, name, site_key, allowed_origins, permitted_paths, retention_days)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Demo Shop (built-in test site)',
  'demo-site-key',
  JSON_ARRAY('*'),
  JSON_ARRAY('/demo*'),
  30
);


USE replay_console;

-- 1. Clients Table (Tenants)
CREATE TABLE IF NOT EXISTS clients (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL DEFAULT 'Default Key',
  key_prefix VARCHAR(16) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
  expires_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  last_used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_api_keys_hash (key_hash),
  KEY idx_api_keys_lookup (key_prefix, status),
  CONSTRAINT fk_api_keys_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Associate Websites with Clients (Preserves existing data)
-- First create a default admin client if one does not exist
INSERT IGNORE INTO clients (id, name, email, status)
VALUES ('10000000-0000-4000-8000-000000000001', 'Default Organization', 'admin@replay.local', 'active');

-- Check if column exists, add client_id
SET @dbname = DATABASE();
SET @tablename = "websites";
SET @columnname = "client_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE websites ADD COLUMN client_id CHAR(36) NULL AFTER id, ADD CONSTRAINT fk_websites_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE;"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Backfill existing websites (such as Demo Shop) to the default client
UPDATE websites SET client_id = '10000000-0000-4000-8000-000000000001' WHERE client_id IS NULL;



CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  role ENUM('admin', 'viewer') NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;