import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMimeMessage, readableMailBody } from "./mail-mime.ts";

describe("mail mime", () => {
  it("decodes google multipart html announcements", () => {
    const raw = [
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="000000000000f82413065a5c07b0"',
      "",
      "--000000000000f82413065a5c07b0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("We are happy to announce that the Cloud Organization is now available for your domain!").toString("base64"),
      "",
      "--000000000000f82413065a5c07b0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<p>We are happy to announce that the <a href=3D\"https://cloud.google.com/\">Cloud Organization</a> is now available.</p>",
      "",
      "--000000000000f82413065a5c07b0--",
      "",
    ].join("\r\n");
    const parsed = parseMimeMessage(raw);
    assert.match(parsed.text, /Cloud Organization/);
    assert.match(parsed.html, /<a href="https:\/\/cloud.google.com\//);
    assert.equal(readableMailBody(raw).includes("Content-Transfer-Encoding"), false);
  });
});
