-- AlterTable
ALTER TABLE "threads" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'internal';

-- CreateTable
CREATE TABLE "customer_handoffs" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "context" TEXT,
    "reason" TEXT NOT NULL,
    "draft_reply" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewer" TEXT,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "customer_handoffs_pkey" PRIMARY KEY ("id")
);
