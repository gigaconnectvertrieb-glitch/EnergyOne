import { createContract, pushNewsales, type ContractDraft } from "@/lib/server/api";
import { logFieldVisit } from "@/lib/server/field-api";
import { dropQueued, dropVisit, listQueued, listVisits } from "./offline-queue";

export async function flushOfflineContracts() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { sent: 0, left: 0 };
  const rows = await listQueued();
  let sent = 0;
  for (const row of rows) {
    try {
      const res = await createContract({ data: { ...row.data, parked: Boolean(row.data.parked) } });
      if (res?.id && !row.data.parked) {
        try {
          await pushNewsales({ data: { id: res.id } });
        } catch {
          /* */
        }
      }
      await dropQueued(row.id);
      sent += 1;
    } catch {
      continue;
    }
  }
  try {
    const visits = await listVisits();
    for (const v of visits) {
      try {
        await logFieldVisit({ data: v.data as { reason: string } });
        await dropVisit(v.id);
      } catch {
        continue;
      }
    }
  } catch {
    /* */
  }
  const left = (await listQueued()).length;
  return { sent, left };
}