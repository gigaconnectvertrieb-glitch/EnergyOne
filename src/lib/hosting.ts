/** Render hosts the app. Google Workspace is the mail system. No mailserver on Render. */

export const APP_HOST = "render" as const;
export const MAIL_SYSTEM = "google_workspace" as const;

/** Names only. Values live exclusively in Render Environment Variables. */
export const RENDER_SECRET_ENV = [
  "GOOGLE_WORKSPACE_CLIENT_EMAIL",
  "GOOGLE_WORKSPACE_PRIVATE_KEY",
  "GOOGLE_WORKSPACE_ADMIN_EMAIL",
] as const;

export const RENDER_OPTIONAL_ENV = [
  "GOOGLE_WORKSPACE_CUSTOMER_ID",
  "GMAIL_SMTP_USER",
  "GMAIL_APP_PASSWORD",
] as const;

export const DOCUSIGN_SECRET_ENV = [
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_PRIVATE_KEY",
] as const;

export const FORBIDDEN_ON_RENDER = [
  "mailbox_passwords",
  "smtp_server",
  "mail_transfer_agent",
  "GOOGLE_WORKSPACE_SMTP_PASS",
] as const;

export const HOSTING_SPLIT = {
  render: {
    title: "Render",
    role: "App- und API-Server",
    does: [
      "Portal und Datenbank hosten",
      "Gmail API aufrufen (senden und empfangen)",
      "Admin SDK aufrufen (User anlegen und sperren)",
      "Mails in der Datenbank Kunde und Auftrag zuordnen",
    ],
    does_not: [
      "Kein Mailserver",
      "Keine Mitarbeiter-Passwörter speichern",
      "Keine API-Keys in der Datenbank",
    ],
  },
  workspace: {
    title: "Google Workspace",
    role: "Mailsystem",
    does: [
      "Echte Postfächer auf e1direktvertrieb.de",
      "info@, bewerbung@, business@",
      "orhan.salo@, luca.marrancone@",
      "vorname.nachname@ für Mitarbeiter",
    ],
    does_not: ["Kein App-Hosting", "Keine Kundendatenbank"],
  },
} as const;

export function secretsStayInEnv(storedSomewhere: string) {
  return storedSomewhere === "render_env";
}

export function renderRunsMailserver() {
  return false;
}

export function portalStoresMailboxPasswords() {
  return false;
}
