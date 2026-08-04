# Plansi — kuvista walkthrough-videoksi (prototyyppi)

Lataa asunnon huonekuvia, valitse kameraliike per huone, ja saat ulos
lyhyet AI-generoidut walkthrough-videoklipit.

## Mitä tämä on

Toimiva Next.js-prototyyppi:
- `/app/page.js` — käyttöliittymä (kuvien lataus, huoneen nimeäminen, liikkeen valinta)
- `/app/api/generate/route.js` — lähettää kuvan fal.ai:n image-to-video-jonoon
- `/app/api/status/route.js` — kyselee jonon tilaa ja palauttaa valmiin videon osoitteen

## Käyttöönotto

1. Asenna riippuvuudet:
   ```
   npm install
   ```
2. Hanki API-avain osoitteesta **https://fal.ai** (rekisteröidy → Dashboard → Keys).
   fal.ai:ssa on ilmainen aloituskrediitti, ja se toimii yhdellä avaimella
   usealle eri video-mallille (Kling, Veo, jne.), joten sillä on helpoin aloittaa.
3. Kopioi `.env.local.example` nimelle `.env.local` ja liitä avain sinne:
   ```
   FAL_KEY=oma_avaimesi
   ```
4. Käynnistä kehityspalvelin:
   ```
   npm run dev
   ```
5. Avaa `http://localhost:3000`, lataa muutama huonekuva ja paina "Luo videot".

## Tärkeä huomio mallin nimestä

`FAL_MODEL`-vakio molemmissa API-reiteissä (`generate` ja `status`) osoittaa
tiettyyn fal.ai-malliin. Mallien osoitteet (slugit) ja tarkat parametrinimet
muuttuvat ajoittain — **tarkista voimassa oleva malli ja sen parametrit
osoitteesta https://fal.ai/models ennen käyttöönottoa**, ja päivitä vakio
tarvittaessa.

## Mitä puuttuu tuotantoversiosta

Tämä on toimiva runko, ei valmis tuote. Seuraavaksi kannattaa lisätä:

- **Klippien yhdistäminen yhdeksi videoksi** (esim. FFmpeg palvelimella tai
  erillisessä worker-palvelussa), koska nyt jokainen huone tuottaa oman klipin.
- **Tallennus** (esim. Cloudflare R2 / S3) ladatuille kuville ja valmiille
  videoille — nyt kuvat kulkevat vain selaimen ja API:n välillä eikä mitään
  tallenneta pysyvästi.
- **Jonotus taustalla** (esim. Redis-pohjainen työjono), jos halutaan tukea
  isompaa käyttäjämäärää ilman että selain pitää yhteyttä auki koko ajan.
- **Käyttäjätilit ja maksut** (esim. Stripe + tietokanta), jos tuote julkaistaan
  maksullisena.
- **Virhesietoisuus**: uudelleenyritykset epäonnistuneille generoinneille,
  selkeät virheviestit käyttäjälle.

## Deployaus

Helpoin tapa julkaista tämä on **Vercel** (sama yhtiö kuin Next.js taustalla):
1. Vie projekti GitHubiin.
2. Yhdistä repo Verceliin (vercel.com → New Project).
3. Lisää `FAL_KEY` Vercelin Environment Variables -asetuksiin.
4. Deploy.
