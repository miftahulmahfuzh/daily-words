CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"vocab_entry_id" uuid,
	"daily_card_id" uuid,
	"journal_entry_id" uuid,
	"payload" jsonb NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_entity_check" CHECK ((
        ("shares"."entity_type" = 'vocab'
           and "shares"."vocab_entry_id" is not null
           and "shares"."daily_card_id" is null and "shares"."journal_entry_id" is null)
     or ("shares"."entity_type" = 'card'
           and "shares"."daily_card_id" is not null
           and "shares"."vocab_entry_id" is null and "shares"."journal_entry_id" is null)
     or ("shares"."entity_type" = 'journal'
           and "shares"."journal_entry_id" is not null
           and "shares"."vocab_entry_id" is null and "shares"."daily_card_id" is null)
      ))
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_vocab_entry_id_vocab_entries_id_fk" FOREIGN KEY ("vocab_entry_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_daily_card_id_daily_cards_id_fk" FOREIGN KEY ("daily_card_id") REFERENCES "public"."daily_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shares_slug_uniq" ON "shares" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_vocab_entry_uniq" ON "shares" USING btree ("vocab_entry_id") WHERE "shares"."vocab_entry_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "shares_daily_card_uniq" ON "shares" USING btree ("daily_card_id") WHERE "shares"."daily_card_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "shares_journal_entry_uniq" ON "shares" USING btree ("journal_entry_id") WHERE "shares"."journal_entry_id" is not null;--> statement-breakpoint
CREATE INDEX "shares_user_created_idx" ON "shares" USING btree ("user_id","created_at" DESC NULLS LAST);