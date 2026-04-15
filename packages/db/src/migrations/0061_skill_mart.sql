-- 0061: SkillMart - 技能市场
-- 开发者发布 Skills 到市场，支持评分/评论/版本管理

-- Published skills in the marketplace
CREATE TABLE skill_mart_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  markdown TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  version TEXT NOT NULL DEFAULT '1.0.0',
  source_type TEXT NOT NULL DEFAULT 'local_path',
  source_locator TEXT,
  download_count INTEGER NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  price NUMERIC(10,2) DEFAULT 0,
  price_currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX skill_mart_skills_company_idx ON skill_mart_skills(company_id);
CREATE INDEX skill_mart_skills_status_idx ON skill_mart_skills(status);
CREATE INDEX skill_mart_skills_review_status_idx ON skill_mart_skills(review_status);
CREATE UNIQUE INDEX skill_mart_skills_company_skill_key_idx ON skill_mart_skills(company_id, skill_key);

-- Reviews and ratings for marketplace skills
CREATE TABLE skill_mart_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skill_mart_skills(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX skill_mart_reviews_skill_idx ON skill_mart_reviews(skill_id);
CREATE INDEX skill_mart_reviews_company_idx ON skill_mart_reviews(company_id);

-- Download records
CREATE TABLE skill_mart_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skill_mart_skills(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX skill_mart_downloads_skill_idx ON skill_mart_downloads(skill_id);
CREATE INDEX skill_mart_downloads_company_idx ON skill_mart_downloads(company_id);

-- Function to update skill rating_avg when a review is added/updated/deleted
CREATE OR REPLACE FUNCTION update_skill_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE skill_mart_skills
    SET rating_avg = (
      SELECT COALESCE(AVG(rating), 0)
      FROM skill_mart_reviews
      WHERE skill_id = NEW.skill_id AND status = 'approved'
    ),
    rating_count = (
      SELECT COUNT(*)
      FROM skill_mart_reviews
      WHERE skill_id = NEW.skill_id AND status = 'approved'
    ),
    updated_at = NOW()
    WHERE id = NEW.skill_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE skill_mart_skills
    SET rating_avg = (
      SELECT COALESCE(AVG(rating), 0)
      FROM skill_mart_reviews
      WHERE skill_id = NEW.skill_id AND status = 'approved'
    ),
    rating_count = (
      SELECT COUNT(*)
      FROM skill_mart_reviews
      WHERE skill_id = NEW.skill_id AND status = 'approved'
    ),
    updated_at = NOW()
    WHERE id = NEW.skill_id OR id = OLD.skill_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE skill_mart_skills
    SET rating_avg = (
      SELECT COALESCE(AVG(rating), 0)
      FROM skill_mart_reviews
      WHERE skill_id = OLD.skill_id AND status = 'approved'
    ),
    rating_count = (
      SELECT COUNT(*)
      FROM skill_mart_reviews
      WHERE skill_id = OLD.skill_id AND status = 'approved'
    ),
    updated_at = NOW()
    WHERE id = OLD.skill_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER skill_rating_trigger
AFTER INSERT OR UPDATE OR DELETE ON skill_mart_reviews
FOR EACH ROW EXECUTE FUNCTION update_skill_rating();

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_download_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE skill_mart_skills
  SET download_count = download_count + 1,
      updated_at = NOW()
  WHERE id = NEW.skill_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER download_count_trigger
AFTER INSERT ON skill_mart_downloads
FOR EACH ROW EXECUTE FUNCTION increment_download_count();
