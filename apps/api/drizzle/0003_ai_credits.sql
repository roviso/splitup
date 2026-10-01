CREATE TABLE "ai_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"period" text NOT NULL,
	"turns" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_period" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_bonus" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "referred_by" uuid;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_sessions_user_id_index" ON "ai_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_referred_by_index" ON "users" USING btree ("referred_by");--> statement-breakpoint
UPDATE "users" SET "joined_at" = "created_at" WHERE "registered";