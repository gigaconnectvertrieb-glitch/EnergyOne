import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { getPublicContact } from "@/lib/server/public";
import { formatPhone, telHref } from "@/lib/contact";

export const Route = createFileRoute("/impressum")({ component: Page });

function Page() {
  const [phone, setPhone] = useState("");
  useEffect(() => {
    getPublicContact()
      .then((c) => setPhone(c.phone || ""))
      .catch(() => setPhone(""));
  }, []);
  return (
    <PublicShell>
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="font-display text-5xl">Impressum</h1>
        <div className="mt-6 space-y-3 text-sm text-muted">
          <p>E1 Direktvertrieb®</p>
          <p>Geschäftsführung: Orhan Salo, Luca-Marco Marrancone</p>
          <p>Deutschland</p>
          {phone ? (
            <p>
              Telefon:{" "}
              <a className="text-gold" href={telHref(phone)}>
                {formatPhone(phone) || phone}
              </a>
              <span> · Telefon</span>
            </p>
          ) : null}
          <p>
            E-Mail:{" "}
            <a className="text-gold" href="mailto:info@e1direktvertrieb.de">
              info@e1direktvertrieb.de
            </a>
          </p>
          <p>
            Geschäftsführung:{" "}
            <a className="text-gold" href="mailto:orhan.salo@e1direktvertrieb.de">
              orhan.salo@e1direktvertrieb.de
            </a>
            {" · "}
            <a className="text-gold" href="mailto:luca.marrancone@e1direktvertrieb.de">
              luca.marrancone@e1direktvertrieb.de
            </a>
          </p>
          <p>Mailanbieter: Google Workspace (Gmail) auf der Domain e1direktvertrieb.de.</p>
          <p>
            Hinweis: Dies ist die digitale Vertriebsplattform. Verbindliche
            Anbieterangaben der operativen Gesellschaft werden im Produktivbetrieb
            hier vollständig geführt (Angaben gemäß § 5 DDG).
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
