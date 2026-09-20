import type { Locale } from "@/lib/i18n/config"

type Section = { title: string; text: string }
type LegalContent = { title: string; sections: Section[] }
export const terms: Record<Locale, LegalContent> = {
  "sr": {
    "title": "TAMIR — Uslovi korišćenja",
    "sections": [
      {
        "title": "1. O projektu",
        "text": "TAMIR na adresi tamir.rs je testni i demonstracioni projekat namenjen predstavljanju i ispitivanju funkcionalnosti internet platforme. Ovi uslovi objašnjavaju korišćenje sajta; Politika privatnosti posebno opisuje obradu ličnih podataka."
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
      },
      {
        "title": "6. Nalog i dozvoljeno korišćenje",
        "text": "Čuvajte pristupne podatke naloga i unosite samo podatke koje imate pravo da koristite. Nisu dozvoljeni pokušaji neovlašćenog pristupa, ometanje rada, slanje zlonamernog sadržaja ili zloupotreba tuđih podataka."
      },
      {
        "title": "7. Sadržaj i spoljne veze",
        "text": "Tekstovi, fotografije i oznake mogu biti zaštićeni pravima njihovih nosilaca. Prikaz na sajtu ne daje automatsku dozvolu za komercijalno korišćenje. Spoljne veze vode ka servisima sa sopstvenim pravilima; pre slanja podataka proverite njihovu politiku privatnosti."
      },
      {
        "title": "8. Izmene i dostupnost",
        "text": "Tokom razvoja pojedine funkcije mogu biti privremeno nedostupne ili izmenjene. Nova verzija uslova objavljuje se na ovoj stranici. Izmene ne ukidaju već nastala prava i ne predstavljaju novi pristanak za obradu podataka."
      }
    ]
  },
  "en": {
    "title": "TAMIR — Terms of use",
    "sections": [
      {
        "title": "1. About the project",
        "text": "TAMIR at tamir.rs is a test and demonstration project presenting the functionality of an online platform. These terms explain use of the site; the Privacy policy separately describes personal data processing."
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
      },
      {
        "title": "6. Accounts and acceptable use",
        "text": "Protect your account credentials and enter only information you are entitled to use. Unauthorised access attempts, service disruption, malicious content and misuse of other people’s information are not permitted."
      },
      {
        "title": "7. Content and external links",
        "text": "Text, photographs and marks may be protected by their respective rights holders. Display on the site does not automatically permit commercial reuse. External links lead to services with their own rules; check their privacy notices before submitting information."
      },
      {
        "title": "8. Changes and availability",
        "text": "Features may change or become temporarily unavailable during development. Revised terms are published on this page. Changes do not remove rights already acquired or constitute renewed consent to data processing."
      }
    ]
  }
}

export const cookiePolicy: Record<Locale, LegalContent> = {
  sr: { title: "TAMIR — Politika kolačića", sections: [
    { title: "Neophodno skladištenje", text: "Prodavnica koristi kolačiće i skladište pregledača za funkcije koje tražite. store_locale čuva ručno izabran jezik do godinu dana. tamir_consent_v1 čuva prihvatanje ili odbijanje analitike 180 dana. Lokalno skladište tb_cart_id pamti korpu, a tb_customer_token prijavu do odjave, uklanjanja ili prestanka važenja sesije. Podaci potvrde porudžbine gosta nalaze se u skladištu sesije kartice pregledača. Odbijanje analitike ne isključuje ove funkcije." },
    { title: "Opciona analitika", text: "Google Analytics (G-0L34ZN3ZB6) učitava se tek nakon prihvatanja. Prikuplja podatke o pregledima stranica, korišćenju sajta, uređaju i pregledaču, uz onlajn identifikatore. Google obrađuje ove podatke kao pružalac usluge; obrada može uključiti prenos podataka van Srbije. Kolačići _ga i _ga_* prepoznaju pregledač i sesije; podešeni su na najviše 180 dana od poslednjeg ažuriranja. Google signals i personalizacija oglasa nisu uključeni ovom integracijom. Analitički podaci nisu nužno anonimni." },
    { title: "Vaš izbor", text: "Prihvati analitiku i Odbij analitiku dostupni su na prvom dolasku. Bez izbora ili posle odbijanja Google tag se ne učitava. Izbor važi 180 dana, osim ako ranije obrišete podatke pregledača ili se verzija pravila promeni. Podešavanja kolačića u podnožju omogućavaju promenu izbora. Povlačenje saglasnosti briše dostupne analitičke kolačiće za ovaj sajt i ponovo učitava stranicu da zaustavi već učitanu analitiku. Ono ne briše automatski podatke ranije poslate Google-u." },
    { title: "Kontrola i informacije", text: "Kolačiće i lokalno skladište možete obrisati i u podešavanjima pregledača. Brisanje neophodnih podataka može odjaviti nalog ili ukloniti vezu sa korpom. Detalji o obradi ličnih podataka i ostvarivanju prava opisani su u Politici privatnosti. Dodatne informacije o Google-ovoj obradi dostupne su u politici navedenoj ispod." },
  ] },
  en: { title: "TAMIR — Cookie policy", sections: [
    { title: "Essential storage", text: "The store uses cookies and browser storage for functions you request. store_locale saves your manual language choice for up to one year. tamir_consent_v1 remembers acceptance or rejection of analytics for 180 days. Local storage tb_cart_id remembers the cart, and tb_customer_token maintains sign-in until logout, removal or session expiry. Guest order confirmation data is kept in the browser tab’s session storage. Rejecting analytics does not disable these functions." },
    { title: "Optional analytics", text: "Google Analytics (G-0L34ZN3ZB6) loads only after acceptance. It collects page views, site usage, device and browser information with online identifiers. Google processes this information as the service provider; processing may involve transfers outside Serbia. The _ga and _ga_* cookies recognise browsers and sessions and are configured for up to 180 days after their last update. This integration does not enable Google signals or advertising personalisation. Analytics data is not necessarily anonymous." },
    { title: "Your choice", text: "Accept analytics and Reject analytics are available on your first visit. Without a choice or after rejection, the Google tag is not loaded. Your choice lasts 180 days unless you clear browser data earlier or the policy version changes. Cookie settings in the footer lets you change your choice. Withdrawing consent deletes accessible analytics cookies for this site and reloads the page to stop previously loaded analytics. It does not automatically delete information already sent to Google." },
    { title: "Control and information", text: "You can also delete cookies and local storage in your browser settings. Removing essential data may sign you out or remove the link to your cart. See the Privacy policy for personal data processing and your rights. Further information about Google’s processing is available in its policy linked below." },
  ] },
}

export const privacyPolicy: Record<Locale, LegalContent> = {
  "sr": {
    "title": "TAMIR — Politika privatnosti",
    "sections": [
      {
        "title": "Podaci u okviru projekta",
        "text": "Ova politika obuhvata tamir.rs. Testni status sajta ne znači da su podaci koje unosite anonimni ili izmišljeni. Registracija, prijava, korpa i obrasci mogu obrađivati stvarne lične podatke."
      },
      {
        "title": "Šta se obrađuje i zašto",
        "text": "Prilikom registracije i korišćenja naloga obrađuju se ime, e-pošta, telefon, podaci za prijavu i sačuvane adrese. Korpa i porudžbine sadrže izabrane proizvode, varijante, količine, iznose, adresu i napomene koje unesete. Ovi podaci služe traženim funkcijama naloga i obrade porudžbine. Nemojte unositi podatke platnih kartica u slobodna tekstualna polja."
      },
      {
        "title": "Tehnički podaci i osnov obrade",
        "text": "Server može beležiti IP adresu, vreme zahteva, putanju i podatke pregledača radi rada sistema, otklanjanja grešaka i sprečavanja zloupotrebe. Za obradu potrebnu za stvarnu porudžbinu primenjuje se osnov izvršenja ugovora ili predugovornih radnji na vaš zahtev; za obavezne evidencije zakonska obaveza; za nužnu bezbednost legitimni interes uz uvažavanje vaših prava. Analitika zahteva poseban pristanak. Sam pregled sajta nije saglasnost za sve vrste obrade."
      },
      {
        "title": "Kolačići i analitika",
        "text": "Neophodno skladištenje podržava korpu, prijavu, izbor jezika i izbor kolačića. Google Analytics učitava se tek kada prihvatite analitiku. Prihvatanje ili odbijanje pamti se 180 dana. Podešavanja kolačića u podnožju omogućavaju promenu izbora. Povlačenje saglasnosti ne briše automatski ranije poslate podatke. Detalji su u Politici kolačića."
      },
      {
        "title": "Pristup podacima i prenos",
        "text": "Podaci potrebni za rad sajta obrađuju se na serverskoj infrastrukturi i dostupni su ovlašćenim administratorima i tehničkim pružaocima usluga u potrebnom obimu. Kada prihvatite analitiku, podatke obrađuje i Google. Obrada može uključiti države van Srbije; svaki prenos mora imati odgovarajući pravni osnov i zaštitne mere. Ova politika ne potvrđuje postojanje konkretnih ugovora o prenosu koji nisu objavljeni."
      },
      {
        "title": "Čuvanje i zaštita",
        "text": "Podaci naloga i porudžbina nisu automatski izbrisani zatvaranjem stranice. Rok zavisi od svrhe obrade, trajanja naloga, zakonskih obaveza i eventualnih sporova; konkretan raspored čuvanja potrebno je dodatno utvrditi. Ograničenje pristupa i druge mere zaštite smanjuju rizik, ali nijedan sistem ne garantuje apsolutnu bezbednost. Ne šaljite osetljive podatke kroz napomene porudžbine."
      },
      {
        "title": "Vaša prava",
        "text": "Pod zakonskim uslovima možete tražiti pristup, ispravku, brisanje, ograničenje obrade i prenosivost podataka, uložiti prigovor i povući pristanak. Zaštita od zloupotrebe može zahtevati proveru identiteta podnosioca. Možete podneti pritužbu Povereniku za informacije od javnog značaja i zaštitu podataka o ličnosti u Srbiji. Pravo na brisanje ne ukida obavezno zakonsko čuvanje."
      },
      {
        "title": "Spoljni servisi i izmene",
        "text": "Za podatke koje samostalno dostavite spoljnim sajtovima važe njihove politike. Promene ove politike objavljuju se ovde; ako nova svrha zahteva pristanak, mora se zatražiti poseban izbor."
      }
    ]
  },
  "en": {
    "title": "TAMIR — Privacy policy",
    "sections": [
      {
        "title": "Data within this project",
        "text": "This policy covers tamir.rs. The site’s test status does not make submitted information anonymous or fictitious. Registration, sign-in, the cart and forms can process real personal information."
      },
      {
        "title": "Information processed and its purpose",
        "text": "Registration and account features process names, email addresses, phone numbers, sign-in information and saved addresses. Carts and orders contain selected products, variants, quantities, amounts, addresses and notes you enter. These support the account and order functions you request. Do not enter payment card details in free-text fields."
      },
      {
        "title": "Technical information and legal grounds",
        "text": "The server may log IP addresses, request times, paths and browser information to operate the system, diagnose errors and prevent abuse. Processing necessary for an actual order relies on performing a contract or taking pre-contractual steps at your request; mandatory records rely on legal obligations; necessary security relies on legitimate interests balanced against your rights. Analytics requires separate consent. Merely visiting does not authorise every type of processing."
      },
      {
        "title": "Cookies and analytics",
        "text": "Essential storage supports the cart, sign-in, language and cookie choices. Google Analytics loads only after you accept analytics. Acceptance or rejection is remembered for 180 days. Cookie settings in the footer lets you change this choice. Withdrawal does not automatically erase information previously sent. See the Cookie policy for details."
      },
      {
        "title": "Access and transfers",
        "text": "Information needed to operate the site is processed on server infrastructure and accessed by authorised administrators and technical service providers as necessary. Google also processes analytics information when you accept it. Processing may involve countries outside Serbia; transfers require an appropriate legal basis and safeguards. This notice does not attest to specific unpublished transfer agreements."
      },
      {
        "title": "Retention and security",
        "text": "Closing a page does not automatically delete account or order records. Retention depends on the purpose, account duration, legal duties and potential disputes; a specific retention schedule still needs to be established. Access restrictions and other safeguards reduce risk, but no system guarantees absolute security. Do not submit sensitive information in order notes."
      },
      {
        "title": "Your rights",
        "text": "Subject to legal conditions, you may request access, correction, erasure, restriction or portability, object to processing and withdraw consent. Identity verification may be needed to prevent misuse of requests. You may complain to Serbia’s Commissioner for Information of Public Importance and Personal Data Protection. Erasure rights do not override mandatory legal retention."
      },
      {
        "title": "External services and changes",
        "text": "Information you independently submit to external sites is governed by their policies. Changes to this notice are published here; a new purpose requiring consent must be presented as a separate choice."
      }
    ]
  }
}
