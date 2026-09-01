function cleanIban(raw?: string) {
  return (raw || "").replace(/\s+/g, "").toUpperCase();
}

function ibanLooksValid(iban: string) {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban);
}

export type SepaCredit = {
  name: string;
  iban: string;
  amount: number;
  remittance: string;
};

export type SepaPainInput = {
  messageId: string;
  created?: Date;
  executionDate: string;
  debtorName: string;
  debtorIban: string;
  debtorBic?: string;
  credits: SepaCredit[];
};

function esc(s: string) {
  return s
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function nm(s: string) {
  return esc(s.replace(/\s+/g, " ").trim()).slice(0, 70);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function amt(n: number) {
  return round2(n).toFixed(2);
}

export function buildPain001(input: SepaPainInput) {
  const debtorIban = cleanIban(input.debtorIban);
  if (!ibanLooksValid(debtorIban)) throw new Error("Firmen-IBAN für SEPA fehlt oder ist ungültig. Unter System eintragen.");
  const credits = input.credits
    .map((c) => ({
      name: c.name.trim(),
      iban: cleanIban(c.iban),
      amount: round2(c.amount),
      remittance: (c.remittance || "Provision E1").slice(0, 140),
    }))
    .filter((c) => c.amount > 0 && ibanLooksValid(c.iban));
  if (!credits.length) throw new Error("Niemand in diesem Lauf hat eine Auszahlungs-IBAN.");
  const sum = round2(credits.reduce((a, c) => a + c.amount, 0));
  const created = (input.created || new Date()).toISOString().replace(/\.\d+Z$/, "Z");
  const msgId = esc(input.messageId.slice(0, 35));
  const bic = (input.debtorBic || "").replace(/\s+/g, "").toUpperCase();
  const dbtrAgt = bic
    ? `<DbtrAgt><FinInstnId><BIC>${esc(bic)}</BIC></FinInstnId></DbtrAgt>`
    : "";
  const txs = credits
    .map((c, i) => {
      const id = esc(`${input.messageId}-${i + 1}`.slice(0, 35));
      return `<CdtTrfTxInf>
        <PmtId><EndToEndId>${id}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${amt(c.amount)}</InstdAmt></Amt>
        <Cdtr><Nm>${nm(c.name)}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${c.iban}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(c.remittance)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${created}</CreDtTm>
      <NbOfTxs>${credits.length}</NbOfTxs>
      <CtrlSum>${amt(sum)}</CtrlSum>
      <InitgPty><Nm>${nm(input.debtorName)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${credits.length}</NbOfTxs>
      <CtrlSum>${amt(sum)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${esc(input.executionDate)}</ReqdExctnDt>
      <Dbtr><Nm>${nm(input.debtorName)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${debtorIban}</IBAN></Id></DbtrAcct>
      ${dbtrAgt}
      <ChrgBr>SLEV</ChrgBr>
      ${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`.replace(/\n\s+/g, "\n").trim();
}
