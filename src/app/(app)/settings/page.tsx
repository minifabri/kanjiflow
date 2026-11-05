import Link from "next/link";
import { getStudyContext } from "@/server/study/context";
import { prisma } from "@/server/db";
import { SettingsForm } from "./settings-form";
import { DEFAULT_INTERVALS_MS, REVIEWABLE_STAGES, stageLabel } from "@/domain/srs";
import { parseJson } from "@/domain/settings";
import { authMode } from "@/server/auth/session";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const ctx = await getStudyContext();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  const notif = parseJson(ctx.settings.notificationPreferences) as { reviewReminders?: boolean };
  const intervals = REVIEWABLE_STAGES.map((s) => ({
    stage: s,
    label: stageLabel(s),
    hours: Math.round((ctx.srs.intervalsMs[s] / 3600_000) * 100) / 100,
    defaultHours: DEFAULT_INTERVALS_MS[s] / 3600_000,
  }));
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/settings/data" className="text-secondary hover:underline">
            Dati e fonti
          </Link>
          <Link href="/onboarding" className="text-secondary hover:underline">
            Rifai la configurazione iniziale
          </Link>
        </div>
      </header>
      <SettingsForm
        settings={{
          dailyLessonLimit: ctx.settings.dailyLessonLimit,
          lessonBatchSize: ctx.settings.lessonBatchSize,
          maxApprenticeItems: ctx.settings.maxApprenticeItems,
          studyPath: ctx.settings.studyPath,
          targetJlpt: ctx.settings.targetJlpt,
          typoTolerance: ctx.settings.typoTolerance,
          questionPriority: ctx.settings.questionPriority,
          showFurigana: ctx.settings.showFurigana,
          showRomajiHints: ctx.settings.showRomajiHints,
          theme: ctx.settings.theme,
          interfaceLanguage: user.interfaceLanguage,
          timezone: ctx.settings.timezone,
          reviewReminders: !!notif.reviewReminders,
          roundDownToHour: ctx.srs.roundDownToHour,
          guruPenaltyFactor: ctx.srs.guruPenaltyFactor,
        }}
        intervals={intervals}
      />
      {authMode() === "enabled" && (
        <form action="/api/auth/logout" method="post" className="text-right">
          <button className="text-sm text-muted hover:text-foreground">Esci</button>
        </form>
      )}
    </div>
  );
}
