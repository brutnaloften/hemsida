/**
 * Responses recorded from data.riksdagen.se on 2026-10-27 (docs/riksdag-api.md),
 * trimmed to a few fields and rows. Shapes (strings for numbers, nulls,
 * object-vs-array flipping, uppercase/lowercase vote ids) are kept as served.
 */

export const dokumentlistaProp = {
  dokumentlista: {
    "@traffar": "196",
    "@sida": "1",
    "@sidor": "98",
    "@nasta_sida":
      "http://data.riksdagen.se/dokumentlista/?sz=2&utformat=json&doktyp=prop&rm=2023%2f24&p=2",
    facettlista: null,
    dokument: [
      {
        dok_id: "HB0319",
        doktyp: "prop",
        subtyp: "",
        rm: "2023/24",
        beteckning: "19",
        nummer: "19",
        datum: "2023-11-23 00:00:00",
        publicerad: "2023-11-23 11:13:29",
        titel: "Ny kärnkraft i Sverige - ett första steg",
        organ: "Klimat- och näringslivsdepartementet",
        status: "Klar",
        dokument_url_html: "//data.riksdagen.se/dokument/HB0319.html",
        dokumentstatus_url_xml: "http://data.riksdagen.se/dokumentstatus/HB0319.xml",
        score: "1.0",
        sokdata: { statusrad: "<p>x</p>" },
      },
      {
        dok_id: "HB0389",
        doktyp: "prop",
        subtyp: "skr",
        rm: "2023/24",
        beteckning: "89",
        nummer: "89",
        datum: "2024-03-14",
        publicerad: "2024-03-14 10:00:00",
        titel: "Skrivelse 2023/24:89",
        organ: null,
        status: "Klar",
        dokument_url_html: "http://data.riksdagen.se/dokument/HB0389.html",
      },
    ],
  },
};

/** A single hit: `dokument` is a bare object instead of a one-element array. */
export const dokumentlistaSingle = {
  dokumentlista: {
    "@traffar": "1",
    "@sida": "1",
    "@sidor": "1",
    dokument: {
      dok_id: "sfs-2024-7",
      doktyp: "sfs",
      subtyp: "sfst",
      rm: "2024",
      beteckning: "2024:7",
      datum: "2024-01-25",
      titel: "Lag (2024:7) om preventiva vistelseförbud",
      organ: "Justitiedepartementet L4",
      status: "",
    },
  },
};

/** Zero hits: no `dokument` key at all. */
export const dokumentlistaEmpty = {
  dokumentlista: { "@traffar": "0", "@sida": "1", "@sidor": "0", facettlista: null },
};

export const dokumentstatusBet = {
  dokumentstatus: {
    dokument: {
      dok_id: "HB01NU5",
      doktyp: "bet",
      rm: "2023/24",
      beteckning: "NU5",
      datum: "2023-11-29",
      titel: "Ny kärnkraft i Sverige",
      organ: "NU",
      status: "Klar",
      html: "<p>the whole document, dropped by the client</p>",
    },
    dokutskottsforslag: {
      utskottsforslag: [
        {
          punkt: "1",
          rubrik: "Ny kärnkraft",
          beslutstyp: "röstning",
          votering_id: "2c198cdf-3a9c-4318-a678-e6aff5c2c68a",
          vinnare: "utskottet",
        },
        { punkt: "3", beslutstyp: "acklamation", votering_id: "" },
      ],
    },
    dokreferens: {
      referens: [
        {
          referenstyp: "behandlar",
          ref_dok_id: "HB0319",
          ref_dok_typ: "prop",
          ref_dok_rm: "2023/24",
          ref_dok_bet: "19",
          ref_dok_titel: "Ny kärnkraft i Sverige - ett första steg",
        },
        { referenstyp: "rskr", ref_dok_id: "HB0K45", ref_dok_typ: "rskr", ref_dok_bet: "45" },
      ],
    },
    dokuppgift: {
      uppgift: [{ kod: "rdbeslut", text: "Kammaren biföll utskottets förslag." }],
    },
    // Single activity: bare object.
    dokaktivitet: {
      aktivitet: {
        kod: "UBE",
        namn: "Beredning",
        datum: "2023-10-01",
        status: "inträffat",
        ordning: "1",
      },
    },
  },
};

/** One reference and one committee point: bare objects instead of arrays. */
export const dokumentstatusPropSingle = {
  dokumentstatus: {
    dokument: {
      dok_id: "HB0319",
      doktyp: "prop",
      rm: "2023/24",
      beteckning: "19",
      datum: "2023-11-23",
      titel: "Ny kärnkraft i Sverige - ett första steg",
      organ: "Klimat- och näringslivsdepartementet",
      status: "Klar",
    },
    dokreferens: {
      referens: {
        referenstyp: "behandlas_i",
        ref_dok_id: "HB01NU5",
        ref_dok_typ: "bet",
        ref_dok_bet: "NU5",
      },
    },
    dokutskottsforslag: {
      utskottsforslag: { punkt: "1", beslutstyp: "röstning", votering_id: "AAAA" },
    },
  },
};

/** dir: only `dokument`. */
export const dokumentstatusDir = {
  dokumentstatus: {
    dokument: {
      dok_id: "HBB11",
      doktyp: "dir",
      rm: "2023",
      beteckning: "1",
      datum: "2023-01-12",
      titel: "Tilläggsdirektiv till Biometriutredningen",
      organ: "Ju-dep",
      status: "Klar",
    },
  },
};

export const voteringlistaParti = {
  voteringlista: {
    "@gruppering": "parti",
    "@antal": "3",
    votering: [
      { parti: "M", Ja: "59", Nej: "", Frånvarande: "8", Avstår: "" },
      { parti: "S", Ja: "", Nej: "93", Frånvarande: "10", Avstår: "" },
      { parti: "-", Ja: "1", Nej: "", Frånvarande: "", Avstår: "" },
    ],
  },
};

/** One row: bare object. */
export const voteringlistaVoteringId = {
  voteringlista: {
    "@gruppering": "votering_id",
    "@antal": "1",
    votering: {
      votering_id: "2C198CDF-3A9C-4318-A678-E6AFF5C2C68A",
      Ja: "152",
      Nej: "149",
      Frånvarande: "48",
      Avstår: "",
    },
  },
};

export const voteringlistaEmpty = { voteringlista: { "@antal": "0", votering: [] } };
