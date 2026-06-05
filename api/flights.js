// Tripqo backend — haalt prijzen op voor de EXACTE door de gebruiker gekozen datums.
// Token staat veilig in Vercel Environment Variable (TP_TOKEN).

const MAX_AGE_DAYS = 5;

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

  if (!departDate) {
    return res.status(400).json({ error: 'depart datum ontbreekt' });
  }

  var sfeerDest = {
    zon:     ['BCN','LIS','AGP','JTR','DBV','PMI','FAO','VLC','IBZ','TFS','CFU','RHO','CHQ','AYT'],
    stad:    ['FCO','PRG','VIE','BUD','CPH','EDI','BER','PAR','MAD','FLR','ATH','ZRH','IST'],
    natuur:  ['KEF','BGO','INN','GVA','TRD'],
    relaxed: ['OPO','MLA','NAP','SPU','NCE','VCE'],
    ver:     ['RAK','HRG','CAI','DXB','AUH','IST','AYT'],
    alles:   ['BCN','LIS','PRG','BUD','FCO','PMI','RAK','AYT','ATH','NAP','DBV','VLC','MAD','SPU','IST','OPO','VIE','CPH']
  };

  var targets = sfeerDest[sfeer] || sfeerDest.zon;
  var results = [];
  var now = Date.now();
  var maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  try {
    for (var i = 0; i < targets.length; i++) {
      var dest = targets[i];

      var url = 'https://api.travelpayouts.com/v1/prices/cheap'
        + '?origin=' + origin
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
          if (o.found_at) {
            var foundMs = new Date(o.found_at).getTime();
            if (!isNaN(foundMs) && (now - foundMs) > maxAgeMs) continue;
          }
          if (!best || o.price < best.price) best = o;
        }

        if (best && best.price <= budget * 1.25) {
          var ageHours = null;
          if (best.found_at) {
            var fms = new Date(best.found_at).getTime();
            if (!isNaN(fms)) ageHours = Math.round((now - fms) / 3600000);
          }
          results.push({
            dest: dest,
            price: best.price,
            airline: best.airline,
            departure: best.depart_date || departDate,
            returnDate: best.return_date || returnDate || null,
            ageHours: ageHours
          });
        }
      }
    }

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
