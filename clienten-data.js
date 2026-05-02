/* global window */
/**
 * Cliënten – persist + initiële seed (85 unieke records uit aangeleverde overzichten)
 * Rijen: voornaam, achternaam, cliëntnummer, locatie, fase-index (0=in zorg, 1=in aanvraag, 2=uit zorg), gemeente, organisatie
 */
(function () {
  "use strict";

  var CLIENTEN_STORAGE_KEY = "clientenItems";
  var CLIENTEN_SEED_FLAG = "clientenSeededFromBulk.v2";

  var FASES = ["in zorg", "in aanvraag", "uit zorg"];

  var RAW = [
    ["Jalaysa", "Jansen", 342, "Voorburggracht", 0, "Dijk en Waard", ""],
    ["Lisanne", "de Zeeuw", 341, "Leonard Bramerstraat", 0, "Rotterdam", ""],
    ["Arsalan", "Koula", 337, "Voorburggracht", 0, "Dijk en Waard", ""],
    ["Ronique", "Thakoer", 221, "Varnebroek", 0, "Rotterdam", "Youz"],
    ["Haifaa", "Alnakshbandi", 339, "Voorburggracht", 0, "Alkmaar", ""],
    ["Jordy", "Lont", 326, "Voorburggracht", 0, "Den Helder", ""],
    ["Romano", "Leone", 335, "Varnebroek", 0, "Alkmaar", ""],
    ["Bella", "van Meurs", 333, "Magdalenenstraat", 0, "", "Planet Young"],
    ["Dylaila", "Birney", 327, "Magdalenenstraat", 0, "", "IHub"],
    ["Maik", "Meijerink", 328, "Breedstraat", 0, "Alkmaar", ""],
    ["Dana", "Ligthart", 330, "Voorburggracht", 1, "Dijk en Waard", ""],
    ["Dano", "de Wagt", 331, "Breedstraat", 1, "Dijk en Waard", ""],
    ["Kim", "Duinhoven", 323, "Varnebroek", 1, "Alkmaar", ""],
    ["Nadia", "Trela", 322, "Voorburggracht", 1, "Medemblik", ""],
    ["Oskar", "Delendowski", 321, "Magdalenenstraat", 0, "", ""],
    ["Gianluca", "Frangiamore de Sola", 324, "Magdalenenstraat", 0, "Bergen (NH)", ""],
    ["Divano", "Vrij", 320, "Voorburggracht", 0, "Enkhuizen", ""],
    ["Elona", "van Milligen", 319, "", 0, "YOUZ/Rotterdam", "Youz"],
    ["Destiny", "Boot", 318, "Varnebroek", 0, "Alkmaar", ""],
    ["Shardely", "Eybrecht", 317, "Breedstraat", 0, "Den Helder", ""],
    ["Sara", "Kapli", 313, "Magdalenenstraat", 2, "", ""],
    ["Tshayren", "Landveld", 315, "Magdalenenstraat", 0, "YOUZ", "Youz"],
    ["Nikki", "Boekel", 216, "", 0, "Dijk en Waard", ""],
    ["Dylan", "Kauffman", 308, "", 2, "Dijk en Waard", ""],
    ["Iris", "Brouwer", 311, "Voorburggracht", 2, "Texel", ""],
    ["Annabel", "Dikmans", 90, "", 0, "Haarlemmermeer", ""],
    ["Sara", "Ali", 209, "", 0, "YOUZ/Rotterdam", "Youz"],
    ["Lucas", "Kortenhoeven", 261, "", 2, "YOUZ/Rotterdam", "Youz"],
    ["Neshanti", "di Perna", 108, "Breedstraat", 0, "", "Gripzorg"],
    ["Storm", "Kueter", 297, "Magdalenenstraat", 0, "Leidschendam-Voorburg", ""],
    ["Roma", "Baltus", 152, "Breedstraat", 2, "", "Gripzorg"],
    ["Nouska", "Westerbeek", 198, "", 0, "WMO", ""],
    ["Ricardo", "Rens", 267, "Varnebroek", 0, "Rotterdam", "Youz"],
    ["Donique", "de Nijs", 204, "", 0, "WMO", ""],
    ["Grace", "de Moor", 301, "Voorburggracht", 0, "YOUZ", "Youz"],
    ["Lotte", "Schuiling", 292, "Voorburggracht", 0, "Sliedrecht", ""],
    ["Danique", "Rietveld", 309, "Varnebroek", 0, "Alkmaar", ""],
    ["Nora", "Halbesma", 176, "Voorburggracht", 2, "Alkmaar", ""],
    ["Mitch", "Kloosterman", 283, "Breedstraat", 2, "Velsen/Kennemerland", ""],
    ["Joeliza", "van den Dool", 181, "Voorburggracht", 2, "Dijk en Waard", ""],
    ["Jason", "Beltzer", 21, "Voorburggracht", 2, "Dijk en Waard", ""],
    ["Albina", "Zeneli", 246, "Voorburggracht", 2, "Dijk en Waard", ""],
    ["Elize", "Jongebloed", 279, "Magdalenenstraat", 0, "Alkmaar", ""],
    ["Noëlla", "Duijvestijn", 172, "Breedstraat", 0, "Castricum", ""],
    ["Jay", "Stevens", 171, "Varnebroek", 0, "Heiloo", ""],
    ["Danielle", "Lamping", 275, "Varnebroek", 0, "Dijk en Waard", ""],
    ["Eliza", "Zwart", 293, "Breedstraat", 0, "Heiloo", ""],
    ["Roël", "Spiering", 259, "Varnebroek", 2, "Uitgeest", ""],
    ["Cloe", "Brown", 165, "Varnebroek", 0, "Castricum", ""],
    ["Jay Arnold", "Buter", 268, "Varnebroek", 2, "Dijk en Waard", ""],
    ["Jorgia", "Schoenmaker", 291, "Magdalenenstraat", 0, "Zaanstad", ""],
    ["Colin", "Wijngaard", 281, "Varnebroek", 0, "SED Stede Broec", ""],
    ["Silas", "Breederveld", 228, "Magdalenenstraat", 0, "Thub", "IHub"],
    ["Deborah", "van den Eijnden", 290, "Magdalenenstraat", 2, "Beverwijk", ""],
    ["Dion", "Martis Abukar", 276, "Voorburggracht", 2, "Beverwijk", ""],
    ["Jamey", "Hofman", 85, "", 0, "Den Helder", ""],
    ["Manaf", "Ghallab", 300, "Voorburggracht", 0, "Hollands Kroon", ""],
    ["Elin", "Verburg", 284, "Voorburggracht", 2, "Alkmaar", ""],
    ["Danischa", "de Vilder", 177, "satelliet woning", 0, "Dijk en Waard", ""],
    ["Dries", "Dekker", 12, "Magdalenenstraat", 0, "Dijk en Waard", ""],
    ["Kiyaro", "Lambert", 269, "Breedstraat", 0, "Dijk en Waard", ""],
    ["Phobek", "Mityaniq", 199, "Breedstraat", 0, "WLZ", ""],
    ["Linda", "Otto", 196, "satelliet woning", 0, "WLZ", ""],
    ["Nino", "Joosten", 197, "Breedstraat", 0, "WLZ", ""],
    ["Raymond", "Ader", 184, "Breedstraat", 0, "WLZ", ""],
    ["Ahmet", "Kat", 203, "", 2, "WLZ", ""],
    ["Tycho", "Kauffman", 250, "Breedstraat", 0, "Alkmaar", "Gripzorg"],
    ["Oliver", "Schoenmakers", 234, "Magdalenenstraat", 0, "Alkmaar", "Gripzorg"],
    ["Shufrandly", "Faries", 103, "Breedstraat", 2, "Dijk en Waard", "Gripzorg"],
    ["Sayed", "Danish", 253, "Breedstraat", 2, "Alkmaar", "Gripzorg"],
    ["Tamaika", "Cooks", 225, "Magdalenenstraat", 0, "", "Gripzorg"],
    ["Mahesh", "Don", 237, "Breedstraat", 2, "WLZ", ""],
    ["Denisha", "Wortel", 178, "Breedstraat", 0, "", "Gripzorg"],
    ["Shadena", "Bauman", 206, "Magdalenenstraat", 0, "Schagen", ""],
    ["Sara", "Narouz", 302, "Magdalenenstraat", 0, "Schagen", ""],
    ["Mitchel", "Heijm", 58, "Breedstraat", 0, "Ouder-Amstel", ""],
    ["Pelle", "van Stee", 278, "Magdalenenstraat", 0, "Schagen", ""],
    ["Joyce", "Voetel", 188, "Magdalenenstraat", 0, "SED Stede Broec", ""],
    ["Diboya", "Boerlijst", 235, "Magdalenenstraat", 0, "SED Stede Broec", ""],
    ["Jira", "Tharwarmporn", 200, "satelliet woning", 0, "WLZ", ""],
  ];

  function clientenIsoNow() {
    return new Date().toISOString();
  }

  function rowToClient(tup) {
    var fi = Math.max(0, Math.min(2, tup[4] | 0));
    return {
      id: "cl_" + String(tup[2]),
      voornaam: String(tup[0] || "").trim(),
      achternaam: String(tup[1] || "").trim(),
      clientnummer: Number(tup[2]),
      locatie: String(tup[3] || "").trim(),
      fase: FASES[fi],
      gemeente: String(tup[5] || "").trim(),
      organisatie: String(tup[6] || "").trim(),
      requiredForms: "",
      uitZorgDatum: "",
      inZorgDatum: "",
      medewerkerZoek: "",
      medewerkerEmpId: "",
      gedragswetenschapperZoek: "",
      detailNotities: [],
      zijbalkNotities: "",
      tabNotities: "",
      aanmaakdatum: clientenIsoNow(),
      laatstGewijzigd: clientenIsoNow(),
      archived: false,
    };
  }

  function buildSeedFromRaw() {
    return RAW.map(rowToClient);
  }

  function clientenReadStorage() {
    try {
      var raw = window.localStorage.getItem(CLIENTEN_STORAGE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      return Array.isArray(p) ? p : null;
    } catch (e) {
      return null;
    }
  }

  function clientenWriteStorage(items) {
    try {
      window.localStorage.setItem(CLIENTEN_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (e) {
      /* ignore */
    }
  }

  function getClientenItems() {
    var items = clientenReadStorage();
    if (items && items.length) return items;
    if (window.localStorage.getItem(CLIENTEN_SEED_FLAG)) return [];
    var seed = buildSeedFromRaw();
    clientenWriteStorage(seed);
    try {
      window.localStorage.setItem(CLIENTEN_SEED_FLAG, "1");
    } catch (e) {
      /* ignore */
    }
    return seed;
  }

  function setClientenItems(items) {
    return clientenWriteStorage(Array.isArray(items) ? items : []);
  }

  function generateClientenId() {
    return "cl_" + String(Date.now()) + "_" + String(Math.random()).slice(2, 8);
  }

  function upsertClienten(client) {
    var items = getClientenItems();
    if (!client.id) client.id = generateClientenId();
    if (!client.aanmaakdatum) client.aanmaakdatum = clientenIsoNow();
    client.laatstGewijzigd = clientenIsoNow();
    var idx = items.findIndex(function (c) {
      return c && c.id === client.id;
    });
    if (idx === -1) {
      items.push(client);
    } else {
      items[idx] = Object.assign({}, items[idx], client);
      items[idx].laatstGewijzigd = clientenIsoNow();
    }
    return setClientenItems(items);
  }

  function deleteClientenById(id) {
    var items = getClientenItems().filter(function (c) {
      return c.id !== id;
    });
    return setClientenItems(items);
  }

  function getClientenById(id) {
    if (!id) return null;
    var items = getClientenItems() || [];
    return items.find(function (c) {
      return c && String(c.id) === String(id);
    }) || null;
  }

  function ensureClientDetailFields(c) {
    if (!c || typeof c !== "object") return c;
    if (c.requiredForms == null) c.requiredForms = "";
    if (c.uitZorgDatum == null) c.uitZorgDatum = "";
    if (c.inZorgDatum == null) c.inZorgDatum = "";
    if (c.medewerkerZoek == null) c.medewerkerZoek = "";
    if (c.medewerkerEmpId == null) c.medewerkerEmpId = "";
    if (c.gedragswetenschapperZoek == null) c.gedragswetenschapperZoek = "";
    if (!Array.isArray(c.detailNotities)) c.detailNotities = [];
    if (c.zijbalkNotities == null) c.zijbalkNotities = "";
    if (c.tabNotities == null) c.tabNotities = "";
    return c;
  }

  window.getClientenItems = getClientenItems;
  window.setClientenItems = setClientenItems;
  window.generateClientenId = generateClientenId;
  window.upsertClienten = upsertClienten;
  window.deleteClientenById = deleteClientenById;
  window.getClientenById = getClientenById;
  window.ensureClientDetailFields = ensureClientDetailFields;
  window.FASEN_CLIËNT = FASES;
})();
