export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = process.env.TP_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'API token niet ingesteld' });
  }

  const origin = (req.query.origin || 'AMS').toUpperCase();
  const sfeer = req.query.sfeer || 'zon';
  const budget = parseInt(req.query.budget) || 500;
  const maand = req.query.maand || getNextMonth();

  var sfeerDest = {
    zon:     ['BCN','LIS','AGP','JTR','DBV','PMI','FAO','NAP','OPO','VLC'],
    stad:    ['FCO','PRG','VIE','BUD','CPH','EDI'],
    natuur:  ['KEF','BGO','INN'],
    relaxed: ['BUD','OPO','MLA','NAP']
  };

  var targets = sfeerDest[sfeer] || sfeerDest.zon;
  var results = [];

  try {
    for (var i = 0; i < targets.length; i++) {
      var dest = targets[i];
      var url = 'https://api.travelpayouts.com/v1/prices/cheap'
        + '?origin=' + origin
        + '&destination=' + dest
        + '&depart_date=' + maand
        + '&token=' + token
        + '&currency=eur';

      var r = await fetch(url);
      if (!r.ok) continue;
      var data = await r.json();

      if (data && data.success && data.data && data.data[dest]) {
        var offers = data.data[dest];
        var keys = Object.keys(offers);
        if (keys.length > 0) {
          var cheapest = offers[keys[0]];
          if (cheapest.price && cheapest.price <= budget * 1.2) {
            results.push({
              dest: dest,
              price: cheapest.price,
              airline: cheapest.airline,
              departure: cheapest.departure_at,
              returnDate: cheapest.return_at
            });
          }
        }
      }
    }

    results.sort(function(a, b) { return a.price - b.price; });

    return res.status(200).json({
      success: true,
      origin: origin,
      sfeer: sfeer,
      count: results.length,
      destinations: results
    });

  } catch (err) {
    return res.status(500).json({ error: 'Fout bij ophalen data', detail: String(err) });
  }
}

function getNextMonth() {
  var d = new Date();
  d.setMonth(d.getMonth() + 1);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}
