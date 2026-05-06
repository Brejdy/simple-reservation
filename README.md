# Ford Mustang rezervace

Staticka GitHub Pages aplikace pro rezervace auta pres Google Calendar API. Rezervace i sdilena aktualni poloha auta se ukladaji do Google Calendar.

## Nastaveni

1. V Google Cloud Console vytvor projekt.
2. Zapni **Google Calendar API**.
3. Vytvor **OAuth Client ID** typu Web application.
4. Do povolenych JavaScript origins pridej adresu GitHub Pages, napriklad:
   `https://uzivatel.github.io`
5. Vytvor API key a dopln v `app.js`:
   - `googleClientId`
   - `googleApiKey`
   - `calendarId`

`calendarId` muze byt `primary`, nebo ID sdileneho kalendare z nastaveni Google Calendar.

## Heslo

Vychozi heslo je v `app.js`:

```js
password: "mustang2026"
```

Je to jen jednoducha klientská brana. Protoze GitHub Pages je staticky hosting, heslo si umi precist kdokoliv, kdo otevře zdrojovy kod stranky.

## Publikace na GitHub Pages

Nahraj soubory do repozitare a v GitHubu zapni:

`Settings -> Pages -> Deploy from a branch -> main -> /root`

Po ulozeni bude aplikace dostupna na GitHub Pages URL repozitare.
