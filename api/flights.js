// Tripqo backend — haalt prijzen op voor de EXACTE door de gebruiker gekozen datums.
// Token staat veilig in Vercel Environment Variable (TP_TOKEN).
//
// Speciale origin "NL": checkt ALLE Nederlandse luchthavens en geeft per bestemming
// de goedkoopste vertrekluchthaven terug. Ideaal voor de "goedkoopste vakantie" zoeker.

const MAX_AGE_DAYS = 5;

const NL_AIRPORTS = ['EIN', 'AMS', 'RTM', 'GRQ', 'MST'];

// Geen strikt luchthaven-filter meer: de API bepaalt zelf of er een vlucht/prijs is.
// Alle bestemmingen kunnen vanaf elke luchthaven worden geprobeerd.

const SFEER_DEST = {
  zon:     ['BCN','LIS','AGP','JTR','DBV','PMI','FAO','IBZ','TFS','VLC','RAK','HRG','DXB','AUH','AYT','CFU','RHO','CHQ','AGA','ALG','LPA','ACE','MJV','ALC','FUE','OLB','PMO','HER','KGS','JMK','ZTH','SSH','SID','LCA','PUY','ZAD','MAH','KLX','SMI','JKH','EFL','MJT','AOK','JSI','BRI','BDS','SUF','CTA','AHO','BIA','TLN','NDR','RMF','BJV','PFO','VAR'],
  stad:    ['FCO','PRG','VIE','BUD','CPH','EDI','BER','PAR','MAD','FLR','CAI','IST','ATH','ZRH','CCF','RIX','RZE','BRQ','KUN','LUZ','POZ','SVQ','MXP','PSA','VRN','SKG','SZG','BSL','KRK','PRN','LON','GLA','BIO','GRO','GRX','BLQ','MPL','CMN','OUD','TNG','FEZ','ADB','AMM','TIA','DUB','GDN','KTW','WAW','WRO','OTP','CLJ','IAS','SOF','SKP','BEG','VNO'],
  natuur:  ['KEF','BGO','INN','GVA','TRD','NOC','SCV','TZL','FNC','RVN','TOS','EVE','SPC','PDL','EGC','CMF','GNB','KTT','KAO','SCR','SFT','LJU','ORK'],
  relaxed: ['OPO','MLA','NAP','SPU','NCE','VCE','DEB','OLB','LCA','ZAD'],
  ver:     ['RAK','HRG','CAI','DXB','AUH','IST','AYT','AGA','SSH','SID','PDL','CMN','NDR','OUD','TNG','FEZ','RMF','AMM','EVN'],
  alles:   ['BCN','LIS','PRG','BUD','FCO','PMI','RAK','AYT','ATH','NAP','DBV','VLC','MAD','SPU','AGA','LPA','RIX','ALG','ALC','MXP','HER','JMK','FNC','LCA','KRK','SSH','LON','SVQ','OLB','DUB','CTA','BLQ','BJV','GRX','TIA','PFO','EFL','LJU','BIO','WAW','OTP','SOF','BEG','VNO','GDN']
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = process.env.TP_TOKEN;
  if (!token) return res.status(500).json({ error: 'API token niet ingesteld' });

  const origin = (req.query.origin || 'AMS').toUpperCase();
  const sfeer = req.query.sfeer || 'zon';
  const budget = parseInt(req.query.budget) || 500;
  const departDate = req.query.depart;
  const returnDate = req.query.ret;

  if (!departDate) return res.status(400).json({ error: 'depart datum ontbreekt' });

  var baseTargets = SFEER_DEST[sfeer] || SFEER_DEST.zon;

  // Bepaal welke luchthavens we checken
  var airports = (origin === 'NL') ? NL_AIRPORTS : [origin];

  var now = Date.now();
  var maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  var bestPerDest = {}; // dest -> {price, origin, ageHours, ...}

  try {
    for (var a = 0; a < airports.length; a++) {
      var ap = airports[a];

      // Geen luchthaven-filter: probeer alle bestemmingen, API bepaalt beschikbaarheid
      var targets = baseTargets;

      for (var i = 0; i < targets.length; i++) {
        var dest = targets[i];
        var url = 'https://api.travelpayouts.com/v1/prices/cheap'
          + '?origin=' + ap
          + '&destination=' + dest
          + '&depart_date=' + departDate
          + (returnDate ? '&return_date=' + returnDate : '')
          + '&token=' + token
          + '&currency=eur';

        var r = await fetch(url);
        if (!r.ok) continue;
        var data = await r.json();

        if (data && data.success && data.data && data.data[dest]) {
          var offers = data.data[dest];
          var keys = Object.keys(offers);
          if (!keys.length) continue;

          var best = null;
          for (var k = 0; k < keys.length; k++) {
            var o = offers[keys[k]];
            if (!o.price) continue;
            if (o.actual === false) continue;
            // EXACTE DAG-CHECK: de vertrekdatum van deze prijs moet precies kloppen
            if (o.depart_date) {
              var od = String(o.depart_date).substring(0, 10);
              if (od !== departDate) continue;
            }
            if (o.found_at) {
              var fms = new Date(o.found_at).getTime();
              if (!isNaN(fms) && (now - fms) > maxAgeMs) continue;
            }
            if (!best || o.price < best.price) best = o;
          }

          if (best && best.price <= budget * 1.25) {
            var ageHours = null;
            if (best.found_at) {
              var fm = new Date(best.found_at).getTime();
              if (!isNaN(fm)) ageHours = Math.round((now - fm) / 3600000);
            }
            // Houd alleen de goedkoopste vertrekluchthaven per bestemming
            if (!bestPerDest[dest] || best.price < bestPerDest[dest].price) {
              bestPerDest[dest] = {
                dest: dest,
                price: best.price,
                origin: ap,
                airline: best.airline,
                ageHours: ageHours
              };
            }
          }
        }
      }
    }

    var results = Object.keys(bestPerDest).map(function(k){ return bestPerDest[k]; });
    results.sort(function(a, b) { return a.price - b.price; });

    return res.status(200).json({
      success: true,
      origin: origin,
      sfeer: sfeer,
      depart: departDate,
      count: results.length,
      maxAgeDays: MAX_AGE_DAYS,
      destinations: results
    });

  } catch (err) {
    return res.status(500).json({ error: 'Fout bij ophalen data', detail: String(err) });
  }
}
