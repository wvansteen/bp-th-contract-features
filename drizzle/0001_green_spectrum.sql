ALTER TABLE "documents" ADD COLUMN "document" "bytea" DEFAULT '\x'::bytea NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "smart_features" jsonb DEFAULT '{}'::jsonb NOT NULL;