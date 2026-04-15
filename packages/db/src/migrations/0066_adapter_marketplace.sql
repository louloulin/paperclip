-- Adapter Marketplace tables
-- T3.8: Third-party adapter plugin marketplace

-- Adapter listings published to marketplace
CREATE TABLE IF NOT EXISTS adapter_marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  adapter_type TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  markdown TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]',
  version TEXT NOT NULL DEFAULT '1.0.0',
  source_type TEXT NOT NULL DEFAULT 'npm',
  source_locator TEXT,
  author_name TEXT,
  author_url TEXT,
  homepage_url TEXT,
  repository_url TEXT,
  config_schema JSONB,
  compatible_adapters JSONB NOT NULL DEFAULT '[]',
  install_count INTEGER NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT '0',
  rating_count INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  price NUMERIC(10,2),
  price_currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft',
  review_status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adapter_marketplace_company_idx ON adapter_marketplace(company_id);
CREATE INDEX IF NOT EXISTS adapter_marketplace_status_idx ON adapter_marketplace(status);
CREATE UNIQUE INDEX IF NOT EXISTS adapter_marketplace_company_type_idx ON adapter_marketplace(company_id, adapter_type);

-- Reviews for adapter marketplace listings
CREATE TABLE IF NOT EXISTS adapter_marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id UUID NOT NULL REFERENCES adapter_marketplace(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  rating INTEGER NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adapter_marketplace_reviews_adapter_idx ON adapter_marketplace_reviews(adapter_id);
CREATE INDEX IF NOT EXISTS adapter_marketplace_reviews_company_idx ON adapter_marketplace_reviews(company_id);

-- Install records
CREATE TABLE IF NOT EXISTS adapter_marketplace_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adapter_id UUID NOT NULL REFERENCES adapter_marketplace(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  version TEXT NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adapter_marketplace_installs_adapter_idx ON adapter_marketplace_installs(adapter_id);
CREATE INDEX IF NOT EXISTS adapter_marketplace_installs_company_idx ON adapter_marketplace_installs(company_id);

-- Trigger to update install_count
CREATE OR REPLACE FUNCTION update_adapter_install_count() RETURNS TRIGGER AS $$
BEGIN
  UPDATE adapter_marketplace SET install_count = install_count + 1 WHERE id = NEW.adapter_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_adapter_install_count ON adapter_marketplace_installs;
CREATE TRIGGER trg_adapter_install_count AFTER INSERT ON adapter_marketplace_installs
  FOR EACH ROW EXECUTE FUNCTION update_adapter_install_count();

-- Trigger to update rating_avg and rating_count
CREATE OR REPLACE FUNCTION update_adapter_rating() RETURNS TRIGGER AS $$
BEGIN
  UPDATE adapter_marketplace SET
    rating_avg = (SELECT COALESCE(AVG(rating)::numeric(3,2), 0) FROM adapter_marketplace_reviews WHERE adapter_id = NEW.adapter_id AND status = 'approved'),
    rating_count = (SELECT COUNT(*) FROM adapter_marketplace_reviews WHERE adapter_id = NEW.adapter_id AND status = 'approved'),
    updated_at = NOW()
  WHERE id = NEW.adapter_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_adapter_rating ON adapter_marketplace_reviews;
CREATE TRIGGER trg_adapter_rating AFTER INSERT OR UPDATE ON adapter_marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION update_adapter_rating();
