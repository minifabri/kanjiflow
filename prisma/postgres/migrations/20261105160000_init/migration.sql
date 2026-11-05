-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "interfaceLanguage" TEXT NOT NULL DEFAULT 'it',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "dailyLessonLimit" INTEGER NOT NULL DEFAULT 15,
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
    "onboardingCompletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ContentSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "license" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "characters" TEXT NOT NULL,
    "primaryMeaning" TEXT NOT NULL,
    "lessonOrder" INTEGER NOT NULL,
    "strokeCount" INTEGER,
    "frequencyRank" INTEGER,
    "partOfSpeech" TEXT,
    "usageNotes" TEXT,
    "contentSourceId" TEXT NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectMeaning" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT,
    "language" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isAccepted" BOOLEAN NOT NULL DEFAULT true,
    "origin" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubjectMeaning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectReading" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reading" TEXT NOT NULL,
    "readingType" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isAccepted" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubjectReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectComponent" (
    "parentSubjectId" TEXT NOT NULL,
    "componentSubjectId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,

    CONSTRAINT "SubjectComponent_pkey" PRIMARY KEY ("parentSubjectId", "componentSubjectId")
);

-- CreateTable
CREATE TABLE "Mnemonic" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT,
    "mnemonicType" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'it',
    "content" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mnemonic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExampleSentence" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "japaneseText" TEXT NOT NULL,
    "kanaText" TEXT,
    "translatedText" TEXT NOT NULL,
    "translationLanguage" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExampleSentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "collectionType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionSubject" (
    "collectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CollectionSubject_pkey" PRIMARY KEY ("collectionId", "subjectId")
);

-- CreateTable
CREATE TABLE "SubjectClassification" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classificationSystem" TEXT NOT NULL,
    "classificationValue" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,

    CONSTRAINT "SubjectClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubjectProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "srsStage" INTEGER NOT NULL DEFAULT 0,
    "unlockedAt" TIMESTAMP(3),
    "lessonCompletedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "burnedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "markedKnownAt" TIMESTAMP(3),
    "meaningCorrectCount" INTEGER NOT NULL DEFAULT 0,
    "meaningIncorrectCount" INTEGER NOT NULL DEFAULT 0,
    "readingCorrectCount" INTEGER NOT NULL DEFAULT 0,
    "readingIncorrectCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubjectProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'review',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "config" TEXT,

    CONSTRAINT "ReviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAttempt" (
    "id" TEXT NOT NULL,
    "clientAttemptId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "submittedAnswer" TEXT NOT NULL,
    "normalizedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "responseTimeMs" INTEGER NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTransition" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "previousStage" INTEGER NOT NULL,
    "nextStage" INTEGER NOT NULL,
    "meaningIncorrect" INTEGER NOT NULL DEFAULT 0,
    "readingIncorrect" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "subjectId" TEXT,
    "localDate" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentSource_key_key" ON "ContentSource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");

-- CreateIndex
CREATE INDEX "Subject_type_lessonOrder_idx" ON "Subject"("type", "lessonOrder");

-- CreateIndex
CREATE INDEX "Subject_characters_idx" ON "Subject"("characters");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectMeaning_subjectId_language_meaning_origin_key" ON "SubjectMeaning"("subjectId", "language", "meaning", "origin");

-- CreateIndex
CREATE INDEX "SubjectMeaning_meaning_idx" ON "SubjectMeaning"("meaning");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectReading_subjectId_readingType_reading_key" ON "SubjectReading"("subjectId", "readingType", "reading");

-- CreateIndex
CREATE INDEX "SubjectReading_reading_idx" ON "SubjectReading"("reading");

-- CreateIndex
CREATE INDEX "SubjectComponent_componentSubjectId_idx" ON "SubjectComponent"("componentSubjectId");

-- CreateIndex
CREATE INDEX "Mnemonic_subjectId_mnemonicType_idx" ON "Mnemonic"("subjectId", "mnemonicType");

-- CreateIndex
CREATE UNIQUE INDEX "ExampleSentence_subjectId_sourceId_japaneseText_key" ON "ExampleSentence"("subjectId", "sourceId", "japaneseText");

-- CreateIndex
CREATE UNIQUE INDEX "StudyCollection_userId_name_key" ON "StudyCollection"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectClassification_subjectId_classificationSystem_key" ON "SubjectClassification"("subjectId", "classificationSystem");

-- CreateIndex
CREATE INDEX "SubjectClassification_classificationSystem_classificationValue_idx" ON "SubjectClassification"("classificationSystem", "classificationValue");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubjectProgress_userId_subjectId_key" ON "UserSubjectProgress"("userId", "subjectId");

-- CreateIndex
CREATE INDEX "UserSubjectProgress_userId_nextReviewAt_idx" ON "UserSubjectProgress"("userId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "UserSubjectProgress_userId_srsStage_idx" ON "UserSubjectProgress"("userId", "srsStage");

-- CreateIndex
CREATE INDEX "ReviewSession_userId_status_idx" ON "ReviewSession"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewAttempt_clientAttemptId_key" ON "ReviewAttempt"("clientAttemptId");

-- CreateIndex
CREATE INDEX "ReviewAttempt_sessionId_subjectId_idx" ON "ReviewAttempt"("sessionId", "subjectId");

-- CreateIndex
CREATE INDEX "ReviewAttempt_subjectId_attemptedAt_idx" ON "ReviewAttempt"("subjectId", "attemptedAt");

-- CreateIndex
CREATE INDEX "ReviewAttempt_attemptedAt_idx" ON "ReviewAttempt"("attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTransition_sessionId_subjectId_key" ON "ReviewTransition"("sessionId", "subjectId");

-- CreateIndex
CREATE INDEX "ReviewTransition_userId_createdAt_idx" ON "ReviewTransition"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserNote_userId_subjectId_key" ON "UserNote"("userId", "subjectId");

-- CreateIndex
CREATE INDEX "StudyActivity_userId_localDate_idx" ON "StudyActivity"("userId", "localDate");

-- CreateIndex
CREATE INDEX "StudyActivity_userId_activityType_timestamp_idx" ON "StudyActivity"("userId", "activityType", "timestamp");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_contentSourceId_fkey" FOREIGN KEY ("contentSourceId") REFERENCES "ContentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectMeaning" ADD CONSTRAINT "SubjectMeaning_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectMeaning" ADD CONSTRAINT "SubjectMeaning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectReading" ADD CONSTRAINT "SubjectReading_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectComponent" ADD CONSTRAINT "SubjectComponent_parentSubjectId_fkey" FOREIGN KEY ("parentSubjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectComponent" ADD CONSTRAINT "SubjectComponent_componentSubjectId_fkey" FOREIGN KEY ("componentSubjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mnemonic" ADD CONSTRAINT "Mnemonic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mnemonic" ADD CONSTRAINT "Mnemonic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleSentence" ADD CONSTRAINT "ExampleSentence_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExampleSentence" ADD CONSTRAINT "ExampleSentence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyCollection" ADD CONSTRAINT "StudyCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSubject" ADD CONSTRAINT "CollectionSubject_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "StudyCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSubject" ADD CONSTRAINT "CollectionSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectClassification" ADD CONSTRAINT "SubjectClassification_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectClassification" ADD CONSTRAINT "SubjectClassification_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubjectProgress" ADD CONSTRAINT "UserSubjectProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubjectProgress" ADD CONSTRAINT "UserSubjectProgress_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSession" ADD CONSTRAINT "ReviewSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAttempt" ADD CONSTRAINT "ReviewAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAttempt" ADD CONSTRAINT "ReviewAttempt_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTransition" ADD CONSTRAINT "ReviewTransition_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTransition" ADD CONSTRAINT "ReviewTransition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTransition" ADD CONSTRAINT "ReviewTransition_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyActivity" ADD CONSTRAINT "StudyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyActivity" ADD CONSTRAINT "StudyActivity_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
