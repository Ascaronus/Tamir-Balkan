// Additive, versioned schema. Executed before release activation; never drops store data.
export const reviewSchema = `
CREATE TABLE IF NOT EXISTS tamir_review (
 id text PRIMARY KEY, product_id text NOT NULL, customer_id text NOT NULL,
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 250),
 rating numeric(2,1) NOT NULL CHECK (rating BETWEEN 1 AND 5 AND mod(rating * 2, 1) = 0),
 version integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id, customer_id)
);
CREATE INDEX IF NOT EXISTS tamir_review_product_status ON tamir_review(product_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS tamir_review_vote (
 id text PRIMARY KEY, review_id text NOT NULL REFERENCES tamir_review(id) ON DELETE CASCADE,
 customer_id text NOT NULL, value smallint NOT NULL CHECK (value IN (-1,1)),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(review_id, customer_id)
);
CREATE TABLE IF NOT EXISTS tamir_review_audit (
 id text PRIMARY KEY, review_id text NOT NULL REFERENCES tamir_review(id),
 moderator_id text NOT NULL, previous jsonb NOT NULL, changes jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tamir_review_rate (
 key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS tamir_review_rate_expiry ON tamir_review_rate(expires_at);
`;
