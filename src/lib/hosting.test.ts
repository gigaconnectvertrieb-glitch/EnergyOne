import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APP_HOST,
  FORBIDDEN_ON_RENDER,
  HOSTING_SPLIT,
  MAIL_SYSTEM,
  RENDER_SECRET_ENV,
  portalStoresMailboxPasswords,
  renderRunsMailserver,
  secretsStayInEnv,
} from "./hosting.ts";

describe("hosting split", () => {
  it("keeps Render as app host and Workspace as mail", () => {
    assert.equal(APP_HOST, "render");
    assert.equal(MAIL_SYSTEM, "google_workspace");
    assert.equal(renderRunsMailserver(), false);
    assert.equal(portalStoresMailboxPasswords(), false);
    assert.equal(secretsStayInEnv("render_env"), true);
    assert.equal(secretsStayInEnv("database"), false);
    assert.ok(RENDER_SECRET_ENV.includes("GOOGLE_WORKSPACE_PRIVATE_KEY"));
    assert.ok(FORBIDDEN_ON_RENDER.includes("smtp_server"));
    assert.ok(HOSTING_SPLIT.render.does_not.some((x) => /Mailserver/.test(x)));
    assert.ok(HOSTING_SPLIT.workspace.does.some((x) => /info@/.test(x)));
  });
});
