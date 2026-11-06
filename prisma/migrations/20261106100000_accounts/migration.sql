-- AlterTable
ALTER TABLE "User" ADD COLUMN "disabledAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- DropIndex
DROP INDEX "SubjectMeaning_subjectId_language_meaning_origin_key";

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectMeaning_subjectId_language_meaning_origin_userId_key" ON "SubjectMeaning"("subjectId", "language", "meaning", "origin", "userId");
