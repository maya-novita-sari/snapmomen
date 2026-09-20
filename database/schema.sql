CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password        TEXT NOT NULL,
  role            TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  premium_until   TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frames (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  size            TEXT NOT NULL CHECK (size IN ('5x15', '10x15')),
  type            TEXT NOT NULL CHECK (type IN ('free', 'premium')),
  image_url       TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  frame_id        INTEGER REFERENCES frames(id) ON DELETE SET NULL,
  image_data      TEXT NOT NULL,
  printed         BOOLEAN DEFAULT FALSE,
  expires_at      TIMESTAMP DEFAULT (NOW() + INTERVAL '3 days'),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS premium_codes (
  id              SERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  duration_days   INTEGER NOT NULL CHECK (duration_days > 0),
  used_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at         TIMESTAMP,
  expires_at      TIMESTAMP,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS printer_settings (
  id              SERIAL PRIMARY KEY,
  printer_name    TEXT,
  connected       BOOLEAN DEFAULT FALSE,
  updated_at      TIMESTAMP DEFAULT NOW()
);

INSERT INTO printer_settings (id, printer_name, connected)
VALUES (1, NULL, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_photos_expires ON photos(expires_at);
CREATE INDEX IF NOT EXISTS idx_premium_codes_code ON premium_codes(code);
CREATE INDEX IF NOT EXISTS idx_premium_codes_status ON premium_codes(status);
CREATE INDEX IF NOT EXISTS idx_users_premium_until ON users(premium_until);