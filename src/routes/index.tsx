import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Check, Shield, User } from "lucide-react";
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
    <section className="relative overflow-hidden">
      <img
        src="/hero-germany.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-50"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/30" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-gold">
            Privat & Gewerbe · Deutschland
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.1] md:text-6xl">
            Energieberatung für Zuhause und Betrieb.{" "}
            <span className="text-gold">Kein Callcenter.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
            Haushalt, Praxis, Laden, Büro oder Betrieb: Wir erklären Tarif, Verbrauch
            und Wechsel persönlich. Fair, ohne Druck, mit einem festen Ansprechpartner.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/beratung">
              <Button size="lg">
                Beratung anfordern <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/energie">
              <Button size="lg" variant="outline">
                Strom & Gas
              </Button>
            </Link>
          </div>
          {phone ? (
            <p className="mt-4 text-sm text-muted">
              Anrufen:{" "}
              <a className="text-gold" href={telHref(phone)}>
                {formatPhone(phone) || phone}
              </a>
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-center">
          <img
            src="/logo-full.jpg"
            alt="E1 Direktvertrieb – Energie, die zu Ihnen passt."
            className="w-full max-w-md rounded-3xl object-contain bg-bg gold-hairline"
          />
        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    { icon: User, title: "Privat", text: "Haushalt, Strom und Gas – verständlich an der Tür." },
    { icon: Building2, title: "Gewerbe", text: "Praxis, Laden, Büro, Betrieb – ein Ansprechpartner." },
    { icon: Shield, title: "Ohne Druck", text: "Sie entscheiden. Wir erklären." },
  ];
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-3">
        {items.map((it) => (
          <div key={it.title} className="flex gap-4">
            <it.icon className="mt-0.5 size-6 text-gold" />
            <div>
              <p className="font-medium">{it.title}</p>
              <p className="text-sm text-muted">{it.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Audience() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <p className="text-xs uppercase tracking-[0.28em] text-gold">Für wen</p>
      <h2 className="mt-2 font-display text-4xl">Privatkunden und Unternehmen.</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Link to="/privat" className="rounded-3xl bg-surface p-6 gold-hairline">
          <User className="size-6 text-gold" />
          <h3 className="mt-4 text-xl font-medium">Privathaushalt</h3>
          <p className="mt-2 text-sm text-muted">
            Strom und Gas für die Wohnung oder das Haus. Vergleich, Wechsel,
            Widerruf – in Ruhe erklärt.
          </p>
          <p className="mt-4 text-sm text-gold">Zum Privatbereich</p>
        </Link>
        <Link to="/firmen" className="rounded-3xl bg-surface p-6 gold-hairline">
          <Building2 className="size-6 text-gold" />
          <h3 className="mt-4 text-xl font-medium">Unternehmen</h3>
          <p className="mt-2 text-sm text-muted">
            Gewerbe, Praxis, Gastronomie, Büro, Filiale. Ein fester Draht,
            keine Hotline. Anfragen an info@.
          </p>
          <p className="mt-4 text-sm text-gold">Zum Firmenbereich</p>
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
            Privat oder Gewerbe – dieselbe Nummer, derselbe Draht. Kein Callcenter.
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
      d: "Wir vergleichen Tarife, Kosten und Anbieter – transparent und unabhängig.",
    },
    {
      n: "3",
      t: "Sie entscheiden",
      d: "Sie erhalten alle Fakten und entscheiden selbst – frei, sicher und in Ihrem Tempo.",
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
      bio: "Head of Sales & Team. Baut Vertrieb, Organisation und Kundenbeziehung – und steht selbst vor Ort für ehrliche Beratung.",
    },
    {
      name: "Luca-Marco Marrancone",
      role: "Geschäftsführer & Gründer",
      bio: "Head of Sales & Team. Entwickelt Menschen und Strukturen, damit Beratung in ganz Deutschland persönlich bleibt.",
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
    "Der Strom- und Gasmarkt in Deutschland ist liberalisiert – Sie wählen frei.",
    "Grundversorgung ist ein Auffangnetz, oft teurer als ein guter Tarif.",
    "Der Wechsel erfolgt ohne Versorgungslücke.",
    "Den Preis beeinflussen Beschaffung, Netze, Steuern und Umlagen – wir erklären jeden Bestandteil.",
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
      a: "Ja. E1 ist Direktvertrieb vor Ort – kein Callcenter, keine Warteschleife.",
    },
    {
      q: "Bin ich verpflichtet, etwas abzuschließen?",
      a: "Nein. Sie entscheiden in Ruhe. Druck hat bei uns keinen Platz.",
    },
    {
      q: "Was kostet die Beratung?",
      a: "Die Erstberatung ist für Sie unverbindlich. Provisionen laufen über den Energievertrag, nicht über eine Beratungsgebühr an der Tür.",
    },
    {
      q: "Beraten Sie auch Firmen?",
      a: "Ja. Haushalt und Gewerbe. Anfragen landen bei info@e1direktvertrieb.de.",
    },
    {
      q: "Kann ich Strom und Gas gleichzeitig wechseln?",
      a: "Ja. Gas darf parallel laufen. Aktiv ist maximal ein Stromvertrag – das ist bei uns eine harte Regel.",
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
