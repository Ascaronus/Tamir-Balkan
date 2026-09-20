import type { Locale } from "@/lib/i18n/config"

type Section = { title: string; text: string }
type LegalContent = { title: string; sections: Section[] }
export const terms: Record<Locale, LegalContent> = {
  "sr": {
    "title": "TAMIR — Uslovi korišćenja testnog projekta",
    "sections": [
      {
        "title": "1. O projektu",
        "text": "TAMIR na adresi tamir.rs je testni i demonstracioni projekat preduzetnika Igor Demin pr Novi Sad (matični broj: 67195051; PIB: 113932057). Sajt je namenjen predstavljanju i ispitivanju funkcionalnosti internet platforme."
      },
      {
        "title": "2. Informativni sadržaj",
        "text": "Informacije, proizvodi prikazani u katalogu, fotografije, opisi, cene, podaci o dostupnosti i funkcionalnosti predstavljeni su u svrhu upoznavanja i demonstracije. Mogu sadržati testne podatke, nepotpune podatke ili greške i mogu se menjati tokom razvoja. Sam prikaz proizvoda ili cene nije obavezujuća ponuda za prodaju niti potvrda stvarne dostupnosti."
      },
      {
        "title": "3. Korišćenje funkcionalnosti",
        "text": "Registracija, korisnički nalog, korpa i obrasci za poručivanje deo su prikazanog funkcionalnog prototipa. Automatski prikaz broja, statusa ili potvrde tokom testiranja nije sam po sebi garancija stvarne isporuke. Pre bilo kakvog stvarnog plaćanja ili dogovora o kupovini potrebno je posebno potvrditi identitet prodavca, cenu, dostupnost, način isporuke i uslove konkretne transakcije."
      },
      {
        "title": "4. Podaci i kolačići",
        "text": "Oznaka testnog projekta ne znači da su podaci uneseni u obrasce fiktivni ili da se ne obrađuju. Nemojte unositi tuđe lične podatke ili podatke platnih kartica u testne obrasce. Upotreba analitičkih kolačića zavisi od vašeg izbora opisanog u Politici kolačića; korišćenje sajta samo po sebi nije saglasnost za analitiku."
      },
      {
        "title": "5. Obavezna prava",
        "text": "Ovo obaveštenje opisuje testnu i informativnu namenu projekta. Ono ne isključuje odgovornost propisanu zakonom, prava na zaštitu podataka ili prava potrošača ako se preko sajta u stvarnosti zaključi ili izvrši kupovina. Naziv „testni projekat” ne menja pravnu prirodu stvarno preduzetih radnji."
      }
    ]
  },
  "en": {
    "title": "TAMIR — Test project terms of use",
    "sections": [
      {
        "title": "1. About the project",
        "text": "TAMIR at tamir.rs is a test and demonstration project operated by Igor Demin pr Novi Sad (registration number: 67195051; PIB / tax ID: 113932057). The site presents and tests the functionality of an online platform."
      },
      {
        "title": "2. Information and demonstrations",
        "text": "Information, products displayed in the catalogue, photographs, descriptions, prices, availability information and functionality are presented for familiarisation and demonstration purposes. They may contain test data, incomplete information or errors and may change during development. Displaying a product or price alone is not a binding offer to sell or confirmation of actual availability."
      },
      {
        "title": "3. Using the features",
        "text": "Registration, customer accounts, the cart and ordering forms are part of the demonstrated functional prototype. An automatically displayed number, status or confirmation during testing is not by itself a guarantee of actual delivery. Before any real payment or purchase agreement, the seller’s identity, price, availability, delivery arrangements and terms of the specific transaction must be separately confirmed."
      },
      {
        "title": "4. Data and cookies",
        "text": "Describing the site as a test project does not mean that data entered into forms is fictitious or is not processed. Do not enter other people’s personal information or payment card details into test forms. Analytics cookies depend on your choice as described in the Cookie policy; using the site does not itself constitute consent to analytics."
      },
      {
        "title": "5. Mandatory rights",
        "text": "This notice describes the project’s testing and informational purpose. It does not exclude liability imposed by law, data protection rights or consumer rights if a purchase is actually concluded or fulfilled through the site. The label “test project” does not change the legal nature of actions actually taken."
      }
    ]
  }
}

export const cookiePolicy: Record<Locale, LegalContent> = {
  sr: { title: "TAMIR — Politika kolačića", sections: [
    { title: "Neophodno skladištenje", text: "Prodavnica koristi kolačiće i skladište pregledača za funkcije koje tražite. store_locale čuva ručno izabran jezik do godinu dana. tamir_consent_v1 čuva prihvatanje ili odbijanje analitike 180 dana. Lokalno skladište tb_cart_id pamti korpu, a tb_customer_token prijavu do odjave, uklanjanja ili prestanka važenja sesije. Podaci potvrde porudžbine gosta nalaze se u skladištu sesije kartice pregledača. Odbijanje analitike ne isključuje ove funkcije." },
    { title: "Opciona analitika", text: "Google Analytics (G-0L34ZN3ZB6) učitava se tek nakon prihvatanja. Prikuplja podatke o pregledima stranica, korišćenju sajta, uređaju i pregledaču, uz onlajn identifikatore. Google obrađuje ove podatke kao pružalac usluge; obrada može uključiti prenos podataka van Srbije. Kolačići _ga i _ga_* prepoznaju pregledač i sesije; podešeni su na najviše 180 dana od poslednjeg ažuriranja. Google signals i personalizacija oglasa nisu uključeni ovom integracijom. Analitički podaci nisu nužno anonimni." },
    { title: "Vaš izbor", text: "Prihvati analitiku i Odbij analitiku dostupni su na prvom dolasku. Bez izbora ili posle odbijanja Google tag se ne učitava. Izbor važi 180 dana, osim ako ranije obrišete podatke pregledača ili se verzija pravila promeni. Podešavanja kolačića u podnožju omogućavaju promenu izbora. Povlačenje saglasnosti briše dostupne analitičke kolačiće za ovaj sajt i ponovo učitava stranicu da zaustavi već učitanu analitiku. Ono ne briše automatski podatke ranije poslate Google-u." },
    { title: "Kontrola i informacije", text: "Kolačiće i lokalno skladište možete obrisati i u podešavanjima pregledača. Brisanje neophodnih podataka može odjaviti nalog ili ukloniti vezu sa korpom. Za informacije o operateru projekta i kontakt za pitanja o obradi podataka pogledajte Uslove korišćenja. Dodatne informacije o Google-ovoj obradi dostupne su u politici navedenoj ispod." },
  ] },
  en: { title: "TAMIR — Cookie policy", sections: [
    { title: "Essential storage", text: "The store uses cookies and browser storage for functions you request. store_locale saves your manual language choice for up to one year. tamir_consent_v1 remembers acceptance or rejection of analytics for 180 days. Local storage tb_cart_id remembers the cart, and tb_customer_token maintains sign-in until logout, removal or session expiry. Guest order confirmation data is kept in the browser tab’s session storage. Rejecting analytics does not disable these functions." },
    { title: "Optional analytics", text: "Google Analytics (G-0L34ZN3ZB6) loads only after acceptance. It collects page views, site usage, device and browser information with online identifiers. Google processes this information as the service provider; processing may involve transfers outside Serbia. The _ga and _ga_* cookies recognise browsers and sessions and are configured for up to 180 days after their last update. This integration does not enable Google signals or advertising personalisation. Analytics data is not necessarily anonymous." },
    { title: "Your choice", text: "Accept analytics and Reject analytics are available on your first visit. Without a choice or after rejection, the Google tag is not loaded. Your choice lasts 180 days unless you clear browser data earlier or the policy version changes. Cookie settings in the footer lets you change your choice. Withdrawing consent deletes accessible analytics cookies for this site and reloads the page to stop previously loaded analytics. It does not automatically delete information already sent to Google." },
    { title: "Control and information", text: "You can also delete cookies and local storage in your browser settings. Removing essential data may sign you out or remove the link to your cart. See Terms of use for project operator identification and contact information for data processing questions. Further information about Google’s processing is available in its policy linked below." },
  ] },
}
