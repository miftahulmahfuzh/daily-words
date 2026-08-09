DROP INDEX "chat_messages_session_created_idx";--> statement-breakpoint
CREATE INDEX "chat_messages_session_round_created_idx" ON "chat_messages" USING btree ("session_id","round","created_at");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_kind_check" CHECK ("chat_messages"."kind" in ('opener', 'reply', 'verdict'));