-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_thread_id_fkey";

-- AlterTable: threads.id SERIAL -> TEXT (no default; the client generates the id)
ALTER TABLE "threads" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "threads" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
DROP SEQUENCE IF EXISTS "threads_id_seq";

-- AlterTable: messages.thread_id INTEGER -> TEXT
ALTER TABLE "messages" ALTER COLUMN "thread_id" TYPE TEXT USING "thread_id"::text;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
