import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, CheckboxRow, Select } from "@/components/ui/field";
import { getPublicContact, submitLead } from "@/lib/server/public";
import { formatPhone, telHref } from "@/lib/contact";
import { toast } from "sonner";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <PublicShell>
      <Hero />
      <TrustStrip />
      <Audience />
      <BeratungBand />
      <Steps />
      <Founders />
      <Facts />
      <Faq />
    </PublicShell>
  );
}

function Hero() {
  const [phone, setPhone] = useState("");
  useEffect(() => {
    getPublicContact()
      .then((c) => setPhone(c.phone || ""))
      .catch(() => setPhone(""));
  }, []);
  return (
    <section className="relative min-h-[88dvh] overflow-hidden">
      <img
        src="/brand-hero.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-55 ken-img"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/75 to-bg" />
      <div className="relative mx-auto flex min-h-[88dvh] max-w-6xl flex-col justify-end px-4 pb-16 pt-28 md:pb-24">
        <p className="reveal text-[11px] uppercase tracking-[0.42em] text-gold">
          E1 Direktvertrieb® · Deutschland
        </p>
        <h1 className="reveal reveal-d1 mt-6 max-w-4xl font-display text-5xl leading-[0.95] md:text-7xl">
          Energie, die zu Ihnen passt.
        </h1>
        <p className="reveal reveal-d2 mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
          Privathaushalt und Unternehmen. Persönliche Beratung statt Callcenter.
          Ein Gesicht, ein Name, eine Nummer.
        </p>
        <div className="reveal reveal-d3 mt-10 flex flex-wrap items-center gap-4">
          <Link to="/privat">
            <Button size="lg">Privathaushalt</Button>
          </Link>
          <Link to="/firmen">
            <Button size="lg" variant="outline">
              Unternehmen
            </Button>
          </Link>
          {phone ? (
            <a className="text-sm tracking-wide text-gold" href={telHref(phone)}>
              {formatPhone(phone) || phone}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    { title: "Privat", text: "Haushalt, Strom und Gas. Verständlich an der Tür." },
    { title: "Gewerbe", text: "Praxis, Laden, Büro, Betrieb. Ein Ansprechpartner." },
    { title: "Ohne Druck", text: "Sie entscheiden. Wir erklären." },
  ];
  return (
    <section className="border-y border-line/60">
      <div className="mx-auto grid max-w-6xl gap-px bg-line/60 md:grid-cols-3">
        {items.map((it) => (
          <div key={it.title} className="bg-bg px-6 py-10">
            <p className="text-[11px] uppercase tracking-[0.28em] text-gold">{it.title}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">{it.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Audience() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <p className="text-[11px] uppercase tracking-[0.32em] text-gold">Zwei Welten</p>
      <h2 className="mt-3 font-display text-4xl md:text-5xl">Privat. Unternehmen.</h2>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Link to="/privat" className="group relative min-h-72 overflow-hidden rounded-[1.75rem]">
          <img src="/brand-home.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition duration-700 group-hover:scale-[1.04] group-hover:opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
          <div className="relative flex h-full flex-col justify-end p-8">
            <p className="text-[11px] uppercase tracking-[0.28em] text-gold">Privathaushalt</p>
            <h3 className="mt-2 font-display text-3xl">Zuhause.</h3>
            <p className="mt-2 max-w-sm text-sm text-muted">Wohnung oder Haus. Tarif, Wechsel, Widerruf. In Ruhe erklärt.</p>
          </div>
        </Link>
        <Link to="/firmen" className="group relative min-h-72 overflow-hidden rounded-[1.75rem]">
          <img src="/brand-business.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition duration-700 group-hover:scale-[1.04] group-hover:opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
          <div className="relative flex h-full flex-col justify-end p-8">
            <p className="text-[11px] uppercase tracking-[0.28em] text-gold">Geschäftskunden</p>
            <h3 className="mt-2 font-display text-3xl">Betrieb.</h3>
            <p className="mt-2 max-w-sm text-sm text-muted">Praxis, Handel, Gastro, Filiale. Gespräch mit der Geschäftsführung.</p>
          </div>
        </Link>
      </div>
    </section>
  );
}

function BeratungBand() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"privat" | "gewerbe">("privat");
  const [company, setCompany] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitLead({ data: { name, phone, zip, message, consent, kind, company } });
      toast.success("Anfrage gesendet. Wir melden uns persönlich.");
      setName("");
      setPhone("");
      setZip("");
      setMessage("");
      setCompany("");
      setKind("privat");
      setConsent(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Senden fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="relative mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-gold">Beratung anfordern</p>
          <h2 className="mt-3 font-display text-4xl">Beratung anfordern</h2>
          <p className="mt-4 text-muted">
            Privat oder Gewerbe. Dieselbe Nummer, derselbe Draht. Kein Callcenter.
          </p>
        </div>
        <form onSubmit={onSubmit} className="rounded-3xl bg-surface p-5 gold-hairline md:p-6">
          <p className="mb-4 text-sm text-muted">
            Bitte teilen Sie uns Ihre Daten mit. Unser Berater kontaktiert Sie zeitnah.
          </p>
          <div className="grid gap-3">
            <Field label="Ich bin">
              <Select value={kind} onChange={(e) => setKind(e.target.value === "gewerbe" ? "gewerbe" : "privat")}>
                <option value="privat">Privatkunde</option>
                <option value="gewerbe">Unternehmen / Gewerbe</option>
              </Select>
            </Field>
            {kind === "gewerbe" ? (
              <Field label="Firma">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Telefon">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <Field label="PLZ">
              <Input value={zip} onChange={(e) => setZip(e.target.value)} />
            </Field>
            <Field label="Nachricht (optional)">
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <CheckboxRow checked={consent} onChange={setConsent}>
              Ich willige in die Verarbeitung meiner Daten zur Kontaktaufnahme ein.{" "}
              <Link to="/datenschutz" className="text-gold">
                Datenschutz
              </Link>
            </CheckboxRow>
            <Button type="submit" disabled={busy} className="w-full">
              Anfrage senden <ArrowRight className="size-4" />
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

function Steps() {
  const steps = [
    {
      n: "1",
      t: "Persönliches Gespräch",
      d: "Wir lernen Sie und Ihre Ziele in einem vertraulichen Gespräch kennen.",
    },
    {
      n: "2",
      t: "Individueller Vergleich",
      d: "Wir vergleichen Tarife, Kosten und Anbieter. Transparent und unabhängig.",
    },
    {
      n: "3",
      t: "Sie entscheiden",
      d: "Sie erhalten alle Fakten und entscheiden selbst. Frei, sicher und in Ihrem Tempo.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-xs uppercase tracking-[0.28em] text-gold">So läuft Ihre Beratung ab</p>
      <h2 className="mt-2 font-display text-4xl">Drei Schritte zu Ihrer Energielösung</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-3xl bg-surface p-6 gold-hairline">
            <p className="font-display text-4xl text-gold">{s.n}</p>
            <h3 className="mt-3 text-lg font-medium">{s.t}</h3>
            <p className="mt-2 text-sm text-muted">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Founders() {
  const people = [
    {
      name: "Orhan Salo",
      role: "Geschäftsführer & Gründer",
      bio: "Head of Sales und Team. Baut Vertrieb, Organisation und Kundenbeziehung und steht selbst vor Ort.",
    },
    {
      name: "Luca-Marco Marrancone",
      role: "Geschäftsführer & Gründer",
      bio: "Head of Sales und Team. Entwickelt Menschen und Strukturen, damit Beratung in ganz Deutschland persönlich bleibt.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <p className="text-xs uppercase tracking-[0.28em] text-gold">Die Köpfe hinter E1</p>
      <h2 className="mt-2 font-display text-4xl">Erfahren. Unabhängig. Leidenschaftlich.</h2>
      <p className="mt-3 max-w-2xl text-muted">
        Wir sind kein Konzern ohne Gesicht. Wir stehen mit unserem Namen dafür ein,
        dass Beratung wieder persönlich wird.
      </p>
      <img
        src="/hero-founders.jpg"
        alt="Das E1-Team mit den Gründern Orhan Salo und Luca-Marco Marrancone"
        className="mt-8 h-56 w-full rounded-3xl object-cover object-[50%_35%] gold-hairline md:h-80"
      />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {people.map((p) => (
          <article key={p.name} className="rounded-3xl bg-surface p-5 gold-hairline">
            <h3 className="text-lg font-medium">{p.name}</h3>
            <p className="text-sm text-gold">{p.role}</p>
            <p className="mt-2 text-sm text-muted">{p.bio}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Facts() {
  const facts = [
    "Der Strom- und Gasmarkt in Deutschland ist liberalisiert. Sie wählen frei.",
    "Grundversorgung ist ein Auffangnetz, oft teurer als ein guter Tarif.",
    "Der Wechsel erfolgt ohne Versorgungslücke.",
    "Den Preis beeinflussen Beschaffung, Netze, Steuern und Umlagen. Wir erklären jeden Bestandteil.",
  ];
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-display text-4xl">Strom & Gas: Was Sie wissen sollten</h2>
        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {facts.map((f) => (
            <li key={f} className="flex gap-3 text-sm text-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-gold" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: "Kommt wirklich jemand zu mir nach Hause?",
      a: "Ja. E1 ist Direktvertrieb vor Ort. Kein Callcenter, keine Warteschleife.",
    },
    {
      q: "Bin ich verpflichtet, etwas abzuschließen?",
      a: "Nein. Sie entscheiden in Ruhe. Druck hat bei uns keinen Platz.",
    },
    {
      q: "Was kostet die Beratung?",
      a: "Die Erstberatung ist unverbindlich. Provisionen laufen über den Energievertrag, nicht über eine Gebühr an der Tür.",
    },
    {
      q: "Beraten Sie auch Firmen?",
      a: "Ja. Haushalt und Gewerbe. Anfragen landen bei info@e1direktvertrieb.de.",
    },
    {
      q: "Kann ich Strom und Gas gleichzeitig wechseln?",
      a: "Ja. Gas darf parallel laufen. Aktiv ist maximal ein Stromvertrag.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 pb-8">
      <h2 className="font-display text-4xl">Häufige Fragen</h2>
      <div className="mt-6 grid gap-3">
        {items.map((it) => (
          <details key={it.q} className="rounded-2xl bg-surface p-4 gold-hairline">
            <summary className="cursor-pointer font-medium">{it.q}</summary>
            <p className="mt-2 text-sm text-muted">{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
