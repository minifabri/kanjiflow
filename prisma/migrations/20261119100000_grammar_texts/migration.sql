-- CreateTable
CREATE TABLE "GrammarText" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleIt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GrammarTextBlank" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "textId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "pointId" TEXT,
    "choices" TEXT NOT NULL,
    "answerIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "GrammarTextBlank_textId_fkey" FOREIGN KEY ("textId") REFERENCES "GrammarText" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GrammarTextBlank_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "GrammarPoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GrammarTextAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "correctCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrammarTextAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GrammarTextAttempt_textId_fkey" FOREIGN KEY ("textId") REFERENCES "GrammarText" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GrammarText_slug_key" ON "GrammarText"("slug");

-- CreateIndex
CREATE INDEX "GrammarText_level_position_idx" ON "GrammarText"("level", "position");

-- CreateIndex
CREATE INDEX "GrammarTextBlank_pointId_idx" ON "GrammarTextBlank"("pointId");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarTextBlank_textId_position_key" ON "GrammarTextBlank"("textId", "position");

-- CreateIndex
CREATE INDEX "GrammarTextAttempt_userId_textId_idx" ON "GrammarTextAttempt"("userId", "textId");

-- CreateIndex
CREATE INDEX "GrammarTextAttempt_userId_completedAt_idx" ON "GrammarTextAttempt"("userId", "completedAt");

