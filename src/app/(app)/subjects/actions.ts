"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getStudyContext } from "@/server/study/context";
import { addSynonym, removeSynonym, resetSubject, resurrectSubject, saveMnemonic, saveNote, suspendSubject } from "@/server/study/subject-admin";
import { markKnown } from "@/server/study/known";

const id = z.string().min(1);

async function done(subjectId: string) {
  revalidatePath(`/subjects/${subjectId}`);
  revalidatePath("/");
}

export async function suspendAction(subjectId: string, suspend: boolean) {
  await suspendSubject(await getStudyContext(), id.parse(subjectId), suspend);
  await done(subjectId);
}
export async function resetAction(subjectId: string) {
  await resetSubject(await getStudyContext(), id.parse(subjectId));
  await done(subjectId);
}
export async function resurrectAction(subjectId: string) {
  await resurrectSubject(await getStudyContext(), id.parse(subjectId));
  await done(subjectId);
}
export async function markKnownAction(subjectId: string, mode: "maintain" | "burn") {
  await markKnown(await getStudyContext(), [id.parse(subjectId)], z.enum(["maintain", "burn"]).parse(mode), false);
  await done(subjectId);
}
export async function saveNoteAction(subjectId: string, content: string) {
  await saveNote(await getStudyContext(), id.parse(subjectId), z.string().max(5000).parse(content));
  await done(subjectId);
}
export async function saveMnemonicAction(subjectId: string, type: "meaning" | "reading", content: string) {
  await saveMnemonic(await getStudyContext(), id.parse(subjectId), z.enum(["meaning", "reading"]).parse(type), z.string().max(2000).parse(content));
  await done(subjectId);
}
export async function addSynonymAction(subjectId: string, meaning: string) {
  await addSynonym(await getStudyContext(), id.parse(subjectId), z.string().min(1).max(80).parse(meaning));
  await done(subjectId);
}
export async function removeSynonymAction(subjectId: string, meaning: string) {
  await removeSynonym(await getStudyContext(), id.parse(subjectId), z.string().min(1).max(80).parse(meaning));
  await done(subjectId);
}
