CREATE TABLE "journal_entry_embeddings" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"text_sha" text NOT NULL,
	"norm_sha" text NOT NULL,
	"model" text,
	"embedding" vector(1536),
	"attempts" integer DEFAULT 0 NOT NULL,
	"failed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entry_embeddings" ADD CONSTRAINT "journal_entry_embeddings_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_embeddings" ADD CONSTRAINT "journal_entry_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_entry_embeddings_norm_idx" ON "journal_entry_embeddings" USING btree ("user_id","norm_sha");--> statement-breakpoint
CREATE INDEX "journal_entry_embeddings_user_status_idx" ON "journal_entry_embeddings" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "journal_entry_embeddings_hnsw_idx" ON "journal_entry_embeddings" USING hnsw ("embedding" vector_cosine_ops);