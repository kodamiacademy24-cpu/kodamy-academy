-- KODAMI D1 SCHEMA
CREATE TABLE IF NOT EXISTS docentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'docente',
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  materia TEXT NOT NULL DEFAULT 'matematicas',
  tema TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'documento',
  extension TEXT NOT NULL DEFAULT '',
  descripcion TEXT DEFAULT '',
  descripcion_ia INTEGER DEFAULT 0,
  portada_url TEXT DEFAULT '',
  video_preview_url TEXT DEFAULT '',
  archivo_url TEXT NOT NULL DEFAULT '',
  nivel INTEGER DEFAULT 1,
  docente_id INTEGER,
  visitas INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (docente_id) REFERENCES docentes(id)
);

CREATE TABLE IF NOT EXISTS temas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  materia TEXT NOT NULL,
  nombre TEXT NOT NULL
);

INSERT OR IGNORE INTO temas (materia, nombre) VALUES
  ('matematicas','Álgebra'),
  ('matematicas','Geometría'),
  ('matematicas','Fracciones'),
  ('matematicas','Estadística'),
  ('matematicas','Aritmética'),
  ('matematicas','Trigonometría'),
  ('matematicas','Cálculo'),
  ('matematicas','Probabilidad'),
  ('matematicas','Ecuaciones'),
  ('matematicas','Funciones');

CREATE TABLE IF NOT EXISTS cerebro_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  materia TEXT NOT NULL DEFAULT 'matematicas',
  libro TEXT NOT NULL DEFAULT '',
  chunk_index INTEGER NOT NULL DEFAULT 0,
  contenido TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recursos_materia ON recursos(materia);
CREATE INDEX IF NOT EXISTS idx_recursos_tipo ON recursos(tipo);
CREATE INDEX IF NOT EXISTS idx_recursos_tema ON recursos(tema);
CREATE INDEX IF NOT EXISTS idx_cerebro_materia ON cerebro_chunks(materia);
