-- Developer Incentive Program Tables
-- T3.9: Developer profiles, earnings tracking, and payout management

CREATE TABLE IF NOT EXISTS developer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  total_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_sales INTEGER NOT NULL DEFAULT 0,
  total_skills INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by UUID,
  referral_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payout_method TEXT DEFAULT 'stripe',
  payout_details JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_profiles_company_idx ON developer_profiles(company_id);
CREATE INDEX IF NOT EXISTS dev_profiles_tier_idx ON developer_profiles(tier);
CREATE INDEX IF NOT EXISTS dev_profiles_referral_idx ON developer_profiles(referral_code);

CREATE TABLE IF NOT EXISTS developer_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  period TEXT NOT NULL,
  sales_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
  platform_fees NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  referral_bonus NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tier_bonus NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_payout NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  new_customers INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_earnings_company_period_idx ON developer_earnings(company_id, period);

CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  method TEXT NOT NULL DEFAULT 'stripe',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payout_method_details JSONB DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payout_requests_company_idx ON payout_requests(company_id);
CREATE INDEX IF NOT EXISTS payout_requests_status_idx ON payout_requests(status);
CREATE INDEX IF NOT EXISTS payout_requests_created_idx ON payout_requests(created_at);

-- Auto-update developer tier based on total earnings
CREATE OR REPLACE FUNCTION update_developer_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_earnings >= 10000 THEN
    NEW.tier := 'platinum';
  ELSIF NEW.total_earnings >= 5000 THEN
    NEW.tier := 'gold';
  ELSIF NEW.total_earnings >= 1000 THEN
    NEW.tier := 'silver';
  ELSE
    NEW.tier := 'bronze';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_dev_tier ON developer_profiles;
CREATE TRIGGER trigger_update_dev_tier
  BEFORE UPDATE ON developer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_developer_tier();
