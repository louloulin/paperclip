-- Company Templates - pre-built vertical industry templates
CREATE TABLE IF NOT EXISTS company_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID NOT NULL REFERENCES companies(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  industry TEXT NOT NULL DEFAULT 'technology',
  icon TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  config JSONB NOT NULL DEFAULT '{}',
  tags JSONB NOT NULL DEFAULT '[]',
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  price NUMERIC(10,2) DEFAULT '0',
  price_currency TEXT NOT NULL DEFAULT 'USD',
  download_count INT NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT '0',
  rating_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_templates_publisher_idx ON company_templates(publisher_id);
CREATE INDEX IF NOT EXISTS company_templates_category_idx ON company_templates(category);
CREATE INDEX IF NOT EXISTS company_templates_industry_idx ON company_templates(industry);
CREATE INDEX IF NOT EXISTS company_templates_status_idx ON company_templates(status);
CREATE INDEX IF NOT EXISTS company_templates_slug_idx ON company_templates(slug);

-- Template Reviews
CREATE TABLE IF NOT EXISTS company_template_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  rating INT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS template_reviews_template_idx ON company_template_reviews(template_id);
CREATE INDEX IF NOT EXISTS template_reviews_company_idx ON company_template_reviews(company_id);

-- Template Installs
CREATE TABLE IF NOT EXISTS company_template_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  version TEXT NOT NULL,
  config_overrides JSONB DEFAULT '{}',
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS template_installs_template_idx ON company_template_installs(template_id);
CREATE INDEX IF NOT EXISTS template_installs_company_idx ON company_template_installs(company_id);
CREATE INDEX IF NOT EXISTS template_installs_company_template_idx ON company_template_installs(company_id, template_id);
