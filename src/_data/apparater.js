// Reference-forbrug pr. apparat + pris-spænd-model. Single source for guides + /spar/-tabel.
// kWh-tal: ærlige 2026-DK-referencer (verificér mod src/app/pricing.js ved review).
// prisspaend = forskel i kr/kWh mellem dyre og billige timer (lav/typisk/høj dag).
const prisspaend = { lav: 0.40, typisk: 1.10, hoej: 2.50 };

const liste = [
  {
    slug: "elbil", navn: "Elbil-opladning", enhed: "pr. fuld opladning",
    kwh: 50, kanFlyttes: true, frekvensOmAaret: 90,
    resume: "Størst potentiale. En fuld opladning flyttet til natbillige timer kan spare mest af alle apparater.",
    forudsaetning: "Kræver kun at du sætter til om aftenen og lader bilen/laderen styre starttidspunktet.",
  },
  {
    slug: "opvaskemaskine", navn: "Opvaskemaskine", enhed: "pr. opvask",
    kwh: 1.0, kanFlyttes: true, frekvensOmAaret: 300,
    resume: "Lille beløb pr. gang, men nemt: tænd udskudt-start om natten.",
    forudsaetning: "De fleste maskiner har udskudt start (timer).",
  },
  {
    slug: "vaskemaskine", navn: "Vaskemaskine", enhed: "pr. vask",
    kwh: 0.9, kanFlyttes: true, frekvensOmAaret: 200,
    resume: "Som opvask: beskeden gevinst pr. vask, men gratis at flytte med timer.",
    forudsaetning: "Kræver udskudt start; varmtvandstilslutning ændrer regnestykket.",
  },
  {
    slug: "varmepumpe", navn: "Varmepumpe & varmt vand", enhed: "pr. dag",
    kwh: 15, kanFlyttes: false, frekvensOmAaret: 365,
    resume: "Stort årsforbrug giver stort potentiale, men kun hvis systemet kan tidsstyres uden at gå på kompromis med komfort eller legionella-sikkerhed.",
    forudsaetning: "Mange varmepumper/varmtvandsbeholdere kan IKKE tidsstyres uden videre. Tjek om din kan, før du regner med besparelsen.",
  },
];

function bySlug(slug) { return liste.find((a) => a.slug === slug); }
function besparelse(a, niveau = "typisk") {
  return Math.round(a.kwh * prisspaend[niveau] * 100) / 100;
}
function besparelseOmAaret(a, niveau = "typisk") {
  return Math.round(besparelse(a, niveau) * a.frekvensOmAaret);
}

// ESM (repoet er type:module). 11ty 3.x læser ESM _data-filer fint.
export default { prisspaend, liste, bySlug, besparelse, besparelseOmAaret };
