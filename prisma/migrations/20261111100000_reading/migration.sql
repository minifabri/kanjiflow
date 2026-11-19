-- CreateTable
CREATE TABLE "ReadingPassage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleIt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReadingQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" TEXT NOT NULL,
    "answerIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "ReadingQuestion_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "ReadingPassage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReadingPassageSubject" (
    "passageId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY ("passageId", "subjectId"),
    CONSTRAINT "ReadingPassageSubject_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "ReadingPassage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReadingPassageSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReadingAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "lookups" TEXT NOT NULL DEFAULT '[]',
    "durationMs" INTEGER NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReadingAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReadingAttempt_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "ReadingPassage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LessonPriority" (
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "subjectId"),
    CONSTRAINT "LessonPriority_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonPriority_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadingPassage_slug_key" ON "ReadingPassage"("slug");

-- CreateIndex
CREATE INDEX "ReadingPassage_level_position_idx" ON "ReadingPassage"("level", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingQuestion_passageId_position_key" ON "ReadingQuestion"("passageId", "position");

-- CreateIndex
CREATE INDEX "ReadingPassageSubject_subjectId_idx" ON "ReadingPassageSubject"("subjectId");

-- CreateIndex
CREATE INDEX "ReadingAttempt_userId_passageId_idx" ON "ReadingAttempt"("userId", "passageId");

-- CreateIndex
CREATE INDEX "ReadingAttempt_userId_completedAt_idx" ON "ReadingAttempt"("userId", "completedAt");

