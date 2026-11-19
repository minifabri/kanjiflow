-- CreateTable
CREATE TABLE "GrammarPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "examples" TEXT NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GrammarExercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pointId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" TEXT NOT NULL,
    "answerIndex" INTEGER NOT NULL,
    "solution" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "GrammarExercise_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "GrammarPoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserGrammarProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "srsStage" INTEGER NOT NULL,
    "lessonCompletedAt" DATETIME NOT NULL,
    "nextReviewAt" DATETIME,
    "burnedAt" DATETIME,
    "markedKnownAt" DATETIME,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserGrammarProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserGrammarProgress_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "GrammarPoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GrammarAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientAttemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "exerciseId" TEXT,
    "mode" TEXT NOT NULL,
    "chosenIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "previousStage" INTEGER,
    "nextStage" INTEGER,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrammarAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GrammarAttempt_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "GrammarPoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GrammarAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "GrammarExercise" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSettings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "dailyLessonLimit" INTEGER NOT NULL DEFAULT 15,
    "dailyGrammarLessons" INTEGER NOT NULL DEFAULT 3,
    "lessonBatchSize" INTEGER NOT NULL DEFAULT 5,
    "maxApprenticeItems" INTEGER NOT NULL DEFAULT 120,
    "studyPath" TEXT NOT NULL DEFAULT 'jlpt',
    "targetJlpt" TEXT NOT NULL DEFAULT 'N3',
    "typoTolerance" TEXT NOT NULL DEFAULT 'conservative',
    "questionPriority" TEXT NOT NULL DEFAULT 'balanced',
    "showFurigana" BOOLEAN NOT NULL DEFAULT true,
    "showRomajiHints" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Rome',
    "notificationPreferences" TEXT NOT NULL DEFAULT '{}',
    "srsConfiguration" TEXT NOT NULL DEFAULT '{}',
    "activeCollectionId" TEXT,
    "onboardingCompletedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("activeCollectionId", "dailyLessonLimit", "lessonBatchSize", "maxApprenticeItems", "notificationPreferences", "onboardingCompletedAt", "questionPriority", "showFurigana", "showRomajiHints", "srsConfiguration", "studyPath", "targetJlpt", "theme", "timezone", "typoTolerance", "updatedAt", "userId") SELECT "activeCollectionId", "dailyLessonLimit", "lessonBatchSize", "maxApprenticeItems", "notificationPreferences", "onboardingCompletedAt", "questionPriority", "showFurigana", "showRomajiHints", "srsConfiguration", "studyPath", "targetJlpt", "theme", "timezone", "typoTolerance", "updatedAt", "userId" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GrammarPoint_slug_key" ON "GrammarPoint"("slug");

-- CreateIndex
CREATE INDEX "GrammarPoint_level_position_idx" ON "GrammarPoint"("level", "position");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarExercise_pointId_position_key" ON "GrammarExercise"("pointId", "position");

-- CreateIndex
CREATE INDEX "UserGrammarProgress_userId_nextReviewAt_idx" ON "UserGrammarProgress"("userId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserGrammarProgress_userId_pointId_key" ON "UserGrammarProgress"("userId", "pointId");

-- CreateIndex
CREATE UNIQUE INDEX "GrammarAttempt_clientAttemptId_key" ON "GrammarAttempt"("clientAttemptId");

-- CreateIndex
CREATE INDEX "GrammarAttempt_userId_attemptedAt_idx" ON "GrammarAttempt"("userId", "attemptedAt");

-- CreateIndex
CREATE INDEX "GrammarAttempt_userId_pointId_idx" ON "GrammarAttempt"("userId", "pointId");

