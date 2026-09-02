import { createContract, pushNewsales, type ContractDraft } from "@/lib/server/api";
import { dropQueued, listQueued } from "./offline-queue";

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
          /* API fehlt oder New Sales down — Auftrag ist in der DB */
        }
      }
      await dropQueued(row.id);
      sent += 1;
    } catch {
      break;
    }
  }
  const left = (await listQueued()).length;
  return { sent, left };
}
