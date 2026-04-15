-- Stripe Payment Sessions - tracks checkout sessions for paid skills
CREATE TABLE IF NOT EXISTS stripe_payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  skill_id UUID NOT NULL REFERENCES skill_mart_skills(id),
  stripe_session_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  seller_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_sessions_company_idx ON stripe_payment_sessions(company_id);
CREATE INDEX IF NOT EXISTS stripe_sessions_skill_idx ON stripe_payment_sessions(skill_id);
CREATE INDEX IF NOT EXISTS stripe_sessions_stripe_idx ON stripe_payment_sessions(stripe_session_id);
CREATE INDEX IF NOT EXISTS stripe_sessions_status_idx ON stripe_payment_sessions(status);

-- Skill Mart Purchases - confirmed purchase records
CREATE TABLE IF NOT EXISTS skill_mart_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  skill_id UUID NOT NULL REFERENCES skill_mart_skills(id),
  session_id UUID REFERENCES stripe_payment_sessions(id),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS skill_purchases_company_idx ON skill_mart_purchases(company_id);
CREATE INDEX IF NOT EXISTS skill_purchases_skill_idx ON skill_mart_purchases(skill_id);
CREATE INDEX IF NOT EXISTS skill_purchases_company_skill_idx ON skill_mart_purchases(company_id, skill_id);

-- Stripe Connect Accounts - seller accounts for payout
CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  stripe_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  country TEXT DEFAULT 'US',
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_connect_company_idx ON stripe_connect_accounts(company_id);
CREATE INDEX IF NOT EXISTS stripe_connect_account_idx ON stripe_connect_accounts(stripe_account_id);

-- Payout Summaries - monthly per seller
CREATE TABLE IF NOT EXISTS stripe_payout_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  period TEXT NOT NULL,
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  platform_fees NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_payout NUMERIC(12,2) NOT NULL DEFAULT 0,
  sales_count INT NOT NULL DEFAULT 0,
  payout_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stripe_payout_company_period_idx ON stripe_payout_summaries(company_id, period);
