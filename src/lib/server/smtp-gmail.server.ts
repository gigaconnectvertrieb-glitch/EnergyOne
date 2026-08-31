import { connect } from "node:tls";
import { MAIL_DOMAIN } from "@/lib/mail";

function env(key: string) {
  return (process.env[key] ?? "").trim();
}

export function gmailAppPasswordReady() {
  const user = env("GMAIL_SMTP_USER") || env("GOOGLE_WORKSPACE_ADMIN_EMAIL");
  const pass = env("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
  return Boolean(user && pass.length >= 8);
}

export function gmailSmtpUser() {
  return env("GMAIL_SMTP_USER") || env("GOOGLE_WORKSPACE_ADMIN_EMAIL") || `business@${MAIL_DOMAIN}`;
}

function readReply(socket: NodeJS.ReadableStream, expect: number) {
  return new Promise<string>((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) || "";
      if (/^\d{3} /.test(last)) {
        socket.off("data", onData);
        const code = Number(last.slice(0, 3));
        if (code !== expect) reject(new Error(`SMTP ${last.slice(0, 80)}`));
        else resolve(buf);
      }
    };
    socket.on("data", onData);
  });
}

export async function sendViaAppPassword(input: {
  to: string;
  subject: string;
  text: string;
  from?: string;
  filename?: string;
  pdf?: Buffer;
}) {
  const user = gmailSmtpUser();
  const pass = env("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
  if (!user || !pass) throw new Error("GMAIL_APP_PASSWORD fehlt.");
  const from = input.from || user;
  const recipients = input.to.split(",").map((x) => x.trim()).filter(Boolean);
  const boundary = "e1mail" + Date.now().toString(36);
  const headers = [
    `From: E1 Direktvertrieb <${from}>`,
    `To: ${recipients.join(", ")}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
  ];
  let body: string;
  if (input.pdf && input.filename) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      input.text.replace(/\r?\n/g, "\r\n"),
      `--${boundary}`,
      "Content-Type: application/pdf",
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${input.filename.replace(/"/g, "")}"`,
      "",
      input.pdf.toString("base64").replace(/(.{76})/g, "$1\r\n"),
      `--${boundary}--`,
      "",
    ].join("\r\n");
  } else {
    headers.push("Content-Type: text/plain; charset=UTF-8");
    body = input.text.replace(/\r?\n/g, "\r\n") + "\r\n";
  }
  const raw = `${headers.join("\r\n")}\r\n\r\n${body}`;

  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" }, async () => {
      try {
        const write = async (line: string, code: number) => {
          socket.write(`${line}\r\n`);
          await readReply(socket, code);
        };
        await readReply(socket, 220);
        await write("EHLO e1direktvertrieb.de", 250);
        await write("AUTH LOGIN", 334);
        await write(Buffer.from(user).toString("base64"), 334);
        await write(Buffer.from(pass).toString("base64"), 235);
        await write(`MAIL FROM:<${from}>`, 250);
        for (const rcpt of recipients) await write(`RCPT TO:<${rcpt}>`, 250);
        await write("DATA", 354);
        socket.write(`${raw}\r\n.\r\n`);
        await readReply(socket, 250);
        socket.write("QUIT\r\n");
        socket.end();
        resolve();
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });
    socket.setTimeout(20000, () => {
      socket.destroy();
      reject(new Error("SMTP Timeout"));
    });
    socket.on("error", reject);
  });
}
