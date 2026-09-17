-- Append-only daily KPI snapshots for Owner Dashboard period charts.
CREATE TABLE IF NOT EXISTS dashboard_kpi_history (
  day date NOT NULL,
  metrics jsonb NOT NULL,
  source text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day)
);

CREATE INDEX IF NOT EXISTS dashboard_kpi_history_day_idx
  ON dashboard_kpi_history (day DESC);
