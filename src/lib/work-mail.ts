export function workMail(first: string, last: string) {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "");
  const a = slug(first);
  const b = slug(last);
  if (!a || !b) return "";
  return `${a}.${b}@e1direktvertrieb.de`;
}
