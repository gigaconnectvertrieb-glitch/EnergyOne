import { promises as dns } from "node:dns";
import {
  interpretDkimGoogle,
  interpretDmarcRecord,
  interpretMxGoogle,
  interpretSpfRecord,
  type AuthState,
  type DmarcPolicy,
} from "./mail";

export type DnsProbe = {
  spf: AuthState;
  dkim: AuthState;
  dmarc: AuthState;
  mx: AuthState;
  dmarc_policy: DmarcPolicy | null;
  seen: {
    spf: string[];
    dkim: string[];
    dmarc: string[];
    mx: string[];
  };
  error: string | null;
};

async function txt(name: string): Promise<string[]> {
  try {
    const rows = await dns.resolveTxt(name);
    return rows.map((parts) => parts.join(""));
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") return [];
    throw err;
  }
}

async function cname(name: string): Promise<string[] | null> {
  try {
    return await dns.resolveCname(name);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") return null;
    throw err;
  }
}

async function mx(name: string): Promise<string[]> {
  try {
    const rows = await dns.resolveMx(name);
    return rows.map((r) => r.exchange);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") return [];
    throw err;
  }
}

export async function probeMailDns(domain: string): Promise<DnsProbe> {
  try {
    const [spfRecords, dmarcRecords, mxHosts, googleTxt, googleCname] = await Promise.all([
      txt(domain),
      txt(`_dmarc.${domain}`),
      mx(domain),
      txt(`google._domainkey.${domain}`),
      cname(`google._domainkey.${domain}`),
    ]);
    const dkimSeen = [...googleTxt];
    if (googleCname) dkimSeen.push(...googleCname.map((v) => `CNAME → ${v}`));
    const dmarc = interpretDmarcRecord(dmarcRecords);
    return {
      spf: interpretSpfRecord(spfRecords),
      dkim: interpretDkimGoogle(googleTxt, googleCname),
      dmarc: dmarc.state,
      mx: interpretMxGoogle(mxHosts),
      dmarc_policy: dmarc.policy,
      seen: { spf: spfRecords, dkim: dkimSeen, dmarc: dmarcRecords, mx: mxHosts },
      error: null,
    };
  } catch (err) {
    return {
      spf: "fehlt",
      dkim: "fehlt",
      dmarc: "fehlt",
      mx: "fehlt",
      dmarc_policy: null,
      seen: { spf: [], dkim: [], dmarc: [], mx: [] },
      error: err instanceof Error ? err.message : "DNS nicht erreichbar",
    };
  }
}
