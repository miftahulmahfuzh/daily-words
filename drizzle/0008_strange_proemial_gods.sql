ALTER TABLE "vocab_entries" ADD COLUMN "origin_term" text;--> statement-breakpoint
ALTER TABLE "vocab_entries" ADD COLUMN "origin_language" text;--> statement-breakpoint
ALTER TABLE "vocab_entries" ADD COLUMN "origin_context" text;--> statement-breakpoint
ALTER TABLE "vocab_entries" ADD CONSTRAINT "vocab_entries_origin_context_needs_term" CHECK ("vocab_entries"."origin_context" is null or "vocab_entries"."origin_term" is not null);