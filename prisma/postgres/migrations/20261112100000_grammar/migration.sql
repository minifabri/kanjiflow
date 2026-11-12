-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "dailyGrammarLessons" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "GrammarPoint" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "examples" TEXT NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrammarPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarExercise" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" TEXT NOT NULL,
    "answerIndex" INTEGER NOT NULL,
    "solution" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "GrammarExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGrammarProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "srsStage" INTEGER NOT NULL,
    "lessonCompletedAt" TIMESTAMP(3) NOT NULL,
    "nextReviewAt" TIMESTAMP(3),
    "burnedAt" TIMESTAMP(3),
    "markedKnownAt" TIMESTAMP(3),
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGrammarProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrammarAttempt" (
    "id" TEXT NOT NULL,
    "clientAttemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "exerciseId" TEXT,
    "mode" TEXT NOT NULL,
    "chosenIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "previousStage" INTEGER,
    "nextStage" INTEGER,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrammarAttempt_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "GrammarExercise" ADD CONSTRAINT "GrammarExercise_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "GrammarPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGrammarProgress" ADD CONSTRAINT "UserGrammarProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGrammarProgress" ADD CONSTRAINT "UserGrammarProgress_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "GrammarPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarAttempt" ADD CONSTRAINT "GrammarAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarAttempt" ADD CONSTRAINT "GrammarAttempt_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "GrammarPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrammarAttempt" ADD CONSTRAINT "GrammarAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "GrammarExercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

