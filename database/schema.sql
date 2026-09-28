
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  username       VARCHAR(50) UNIQUE NOT NULL,
  email          VARCHAR(255) UNIQUE NOT NULL,
  password       TEXT NOT NULL,              
  role           VARCHAR(20) NOT NULL DEFAULT 'customer', 
  premium_until  TIMESTAMPTZ,               
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS frames (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  size        VARCHAR(10) NOT NULL CHECK (size IN ('5x15', '10x15')),
  type        VARCHAR(10) NOT NULL CHECK (type IN ('free', 'premium')),
  image_url   TEXT NOT NULL,               
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  owner_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  access_token  TEXT UNIQUE,
  category      TEXT NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS photos (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  frame_id    INTEGER REFERENCES frames(id) ON DELETE SET NULL,
  image_data  TEXT NOT NULL,                
  thumb_data  TEXT,
  caption     VARCHAR(120),
  printed     BOOLEAN NOT NULL DEFAULT FALSE,
  is_galeri   BOOLEAN NOT NULL DEFAULT FALSE,
  is_hasil    BOOLEAN NOT NULL DEFAULT FALSE,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  featured    BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS premium_codes (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(20) UNIQUE NOT NULL, -- SNAP-XXXXXX
  duration_days  INTEGER NOT NULL,
  used_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at        TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,                
  status         VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS printer_settings (
  id            SERIAL PRIMARY KEY,
  printer_name  VARCHAR(100),
  connected     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO printer_settings (id, printer_name, connected)
VALUES (1, NULL, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_photos_expires_at ON photos (expires_at);
CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos (user_id);
CREATE INDEX IF NOT EXISTS idx_premium_codes_status ON premium_codes (status);
CREATE INDEX IF NOT EXISTS idx_frames_type ON frames (type);

CREATE INDEX IF NOT EXISTS idx_frames_category ON frames (category);
CREATE INDEX IF NOT EXISTS idx_photos_is_galeri ON photos (is_galeri);


--bingkai custom dengan token
ALTER TABLE frames ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE frames ADD COLUMN IF NOT EXISTS access_token TEXT UNIQUE;
ALTER TABLE frames ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'free';
UPDATE frames SET category = type WHERE category = 'free' AND type = 'premium';

--galeri web
ALTER TABLE photos ADD COLUMN IF NOT EXISTS thumb_data TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS caption VARCHAR(120);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS is_galeri BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS is_hasil BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE photos SET is_galeri = TRUE, is_permanent = TRUE WHERE featured = TRUE AND is_galeri = FALSE;