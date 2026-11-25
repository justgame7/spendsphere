// SpendSphere — turns bank / card / UPI SMS into transactions and categories.
// Pure functions, no DOM. Exposed as window.SpendParser.
(function () {
  const CATEGORIES = {
    food:      { name: 'Food & Dining',   color: '#ff8a5c', icon: '🍔' },
    groceries: { name: 'Groceries',       color: '#7ee081', icon: '🛒' },
    shopping:  { name: 'Shopping',        color: '#ff6fb5', icon: '🛍️' },
    transport: { name: 'Travel & Fuel',   color: '#5cc8ff', icon: '🚕' },
    bills:     { name: 'Bills & Recharge',color: '#ffd166', icon: '💡' },
    home:      { name: 'Rent & Home',     color: '#ffa94d', icon: '🏠' },
    entertain: { name: 'Entertainment',   color: '#b388ff', icon: '🎬' },
    health:    { name: 'Health',          color: '#4dd8c0', icon: '💊' },
    emi:       { name: 'EMI & Loans',     color: '#ff5c7a', icon: '🏦' },
    invest:    { name: 'Investments',     color: '#8fa8ff', icon: '📈' },
    education: { name: 'Education',       color: '#f0a3ff', icon: '🎓' },
    cash:      { name: 'Cash Withdrawal', color: '#c2c8d6', icon: '🏧' },
    transfer:  { name: 'Transfers',       color: '#9aa4ff', icon: '↗️' },
    other:     { name: 'Other',           color: '#6b7390', icon: '•' },
  };

  // Keyword → category. Checked against merchant first, then the whole message.
  const RULES = [
    ['food', /swiggy|zomato|domino|pizza|mcdonald|kfc|burger|starbucks|cafe|coffee|restaura|hotel|biryani|eatsure|dunzo daily|chaayos|haldiram|bakery|food|dine|barbeque|subway/i],
    ['groceries', /bigbasket|blinkit|zepto|grofers|dmart|d-mart|reliance fresh|more retail|jiomart|instamart|supermarket|grocery|kirana|nature.?s basket|spencer|milk|dairy|country delight|licious|fresh/i],
    ['shopping', /amazon|amzn|flipkart|myntra|ajio|meesho|nykaa|tata ?cliq|croma|reliance digital|decathlon|ikea|lifestyle|westside|zara|h&m|max fashion|pantaloons|lenskart|mall|store|mart\b|shop/i],
    ['transport', /uber|ola\b|olacabs|rapido|irctc|redbus|makemytrip|goibibo|indigo|air ?india|vistara|akasa|spicejet|petrol|diesel|fuel|hpcl|bpcl|iocl|indian oil|shell|fastag|metro|parking|yatra|cleartrip|ixigo|toll/i],
    ['bills', /electric|bescom|tneb|tangedco|msedcl|bses|tata power|adani|water|gas\b|indane|bharat ?gas|lpg|airtel|jio|vodafone|\bvi\b|bsnl|broadband|act fibernet|recharge|dth|tata ?play|postpaid|prepaid|bill ?pay|billdesk|insurance|lic\b|premium/i],
    ['home', /\brent\b|landlord|maintenance|society|housing|nobroker|urban ?company|furniture|pepperfry/i],
    ['entertain', /netflix|spotify|hotstar|prime video|disney|sonyliv|zee5|youtube|bookmyshow|pvr|inox|cinema|movie|gaming|steam|playstation|apple\.com|google ?play|jiocinema|audible/i],
    ['health', /pharma|medic|apollo|1mg|netmeds|pharmeasy|hospital|clinic|diagnos|lab\b|health|dental|doctor|practo|cult\.?fit|gym|fitness/i],
    ['emi', /\bemi\b|loan|bajaj fin|home ?credit|repayment|nach|ecs|mandate|credit card (?:bill|payment)|card ?payment|cc payment|cred\b/i],
    ['invest', /zerodha|groww|upstox|angel ?one|kite|mutual ?fund|\bmf\b|\bsip\b|nps|ppf|smallcase|coin by|indmoney|kuvera|paytm money|dhan\b|stocks?|demat|fixed deposit|\bfd\b|recurring deposit|\brd\b/i],
    ['education', /school|college|universit|tuition|course|udemy|coursera|byju|unacademy|fees|exam|books?\b/i],
    ['cash', /atm|cash ?withdraw|withdrawn at|nfs|cash wdl|wdl/i],
  ];

  const AMOUNT = /(?:rs\.?|inr|₹)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/i;
  const DEBIT = /\b(debited|debit(?:ed)? for|spent|paid|sent|withdrawn|withdrawal|purchase|txn of|transaction of|charged|dr\.?\b|deducted|payment of .* (?:made|done|successful)|used (?:for|at)|auto[- ]?debit)/i;
  const CREDIT = /\b(credited|received|deposited|refund|reversed|cashback|cr\.?\b)/i;
  const IGNORE = /\b(otp|one time password|will be debited|to be debited|is due|due on|due date|minimum (?:amount|due)|total (?:amount )?due|statement|declined|failed|unsuccessful|request(?:ed)? money|collect request|has requested|offer|pre-?approved|eligible|congratulations|win\b|reward points|limit (?:of|is)|available limit|e-?mandate .*registered|will be (?:auto-?)?(?:debited|deducted)|scheduled)/i;
  const PERSONAL_SENDER = /^\+?\d{10,}$/;

  function titleCase(s) {
    return s.toLowerCase().replace(/(^|[\s.&-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }

  function cleanMerchant(m) {
    if (!m) return '';
    m = m.replace(/\s+/g, ' ').trim();
    m = m.replace(/^(?:vpa|upi|m\/s\.?|ms\.?|mr\.?|mrs\.?)\s+/i, '');
    m = m.replace(/^(?:sip|emi|payment|bill payment|purchase)\s+(?:in|to|for|of|at)\s+/i, '');
    m = m.replace(/(?:\s+(?:electricity|bill|payment|mutual fund|online|order))+$/i, '');
    m = m.replace(/[*#]+/g, ' ');
    m = m.replace(/\b(?:pvt|private|ltd|limited|india|llp|technologies|services)\b\.?/gi, '');
    m = m.replace(/[\s\-_.,:]+$/g, '').replace(/^[\s\-_.,:]+/g, '');
    m = m.replace(/\s{2,}/g, ' ').trim();
    if (/^\d+$/.test(m) || m.length < 2) return '';
    return titleCase(m).slice(0, 32);
  }

  function extractMerchant(body, type) {
    let m;
    // "Acct XX debited ... & Netflix credited"
    if ((m = body.match(/[&;]\s*([A-Za-z][A-Za-z0-9 .&'-]{1,30}?)\s+credited/i))) { const c = cleanMerchant(m[1]); if (c) return c; }
    if (type === 'credit' && (m = body.match(/\b(?:from|by)\s+(?:(?:neft|imps|upi|rtgs)\s+)?(?:from\s+)?([A-Za-z][A-Za-z0-9 .&'-]{1,40}?)(?=\s*\(|\s+(?:on|via|ref|avl|upi|info)\b|[.,;]|$)/i))) {
      if (!/^(?:a\/?c|ac|account|your|xx|neft|imps|upi)\b/i.test(m[1])) { const c = cleanMerchant(m[1]); if (c) return c; }
    }
    // UPI VPA, e.g. "to VPA swiggy.stores@axisbank" or "paytm-12345@ptys"
    if ((m = body.match(/(?:vpa|upi(?: id)?|to)\s*:?\s*([a-z0-9.\-_]{3,})@[a-z]{2,}/i))) {
      let h = m[1].replace(/[.\-_]?\d{4,}.*$/, '').replace(/[.\-_](stores?|payments?|online|pay|merchant|upi|in)$/i, '');
      h = h.replace(/[.\-_]+/g, ' ');
      const c = cleanMerchant(h);
      if (c) return c;
    }
    const stop = '(?=\\s+(?:on|via|ref|upi|txn|avl|avail|is|from|using|for|with|dated|bal|and|thru|through|by|at)\\b|[.,;(]|\\s+\\d|$)';
    const pats = [
      new RegExp('\\b(?:at|@)\\s+([A-Za-z][A-Za-z0-9&\'\\- .*]{1,40}?)' + stop, 'i'),
      new RegExp('\\b(?:to|towards|paid to|sent to|trf to|transfer to)\\s+([A-Za-z][A-Za-z0-9&\'\\- .*]{1,40}?)' + stop, 'i'),
      /\binfo[:\s-]+([A-Za-z][A-Za-z0-9&'\- .*\/]{1,40})/i,
      /\b(?:for|on)\s+([A-Z][A-Za-z0-9&'\- .]{2,30}?)\s+(?:order|purchase|payment)/,
    ];
    for (const p of pats) {
      const r = body.match(p);
      if (r) {
        let c = r[1];
        if (/^(?:a\/?c|ac|acct|account|your|card|xx|x+\d|beneficiary|mobile|bank)/i.test(c)) continue;
        c = cleanMerchant(c.replace(/\/.*$/, ''));
        if (c) return c;
      }
    }
    if (/atm|cash wdl|withdrawn/i.test(body)) return 'ATM Cash';
    return '';
  }

  function extractBank(address, body) {
    const a = (address || '').toUpperCase().replace(/^[A-Z]{2}-/, '').replace(/-[A-Z]$/, '');
    const map = [['HDFC', 'HDFC Bank'], ['ICICI', 'ICICI Bank'], ['SBI', 'SBI'], ['AXIS', 'Axis Bank'], ['KOTAK', 'Kotak'], ['KMB', 'Kotak'],
      ['YES', 'Yes Bank'], ['IDFC', 'IDFC First'], ['PNB', 'PNB'], ['BOB', 'Bank of Baroda'], ['BOI', 'Bank of India'], ['CANARA', 'Canara Bank'], ['CANBNK', 'Canara Bank'],
      ['UNION', 'Union Bank'], ['INDUS', 'IndusInd'], ['FEDERAL', 'Federal Bank'], ['FEDBNK', 'Federal Bank'], ['AUBANK', 'AU Bank'], ['PAYTM', 'Paytm'], ['AMEX', 'Amex'], ['ONECRD', 'OneCard']];
    for (const [k, v] of map) if (a.includes(k)) return v;
    for (const [k, v] of map) if (new RegExp('\\b' + k).test(body.toUpperCase())) return v;
    return a ? titleCase(a) : 'Bank';
  }

  function categorize(merchant, body, overrides) {
    if (overrides && merchant && overrides[merchant.toLowerCase()]) return overrides[merchant.toLowerCase()];
    for (const [cat, re] of RULES) if (merchant && re.test(merchant)) return cat;
    for (const [cat, re] of RULES) if (re.test(body)) return cat;
    // A UPI payment to a person's name looks like 2–3 plain words
    if (/upi|vpa|imps|neft|rtgs|transfer|trf|\bsent\b/i.test(body)) return 'transfer';
    return 'other';
  }

  function parseOne(sms, overrides) {
    const body = (sms.body || '').replace(/\s+/g, ' ').trim();
    if (!body || PERSONAL_SENDER.test((sms.address || '').trim())) return null;
    if (IGNORE.test(body)) return null;
    const am = body.match(AMOUNT);
    if (!am) return null;
    const amount = parseFloat(am[1].replace(/,/g, ''));
    if (!isFinite(amount) || amount <= 0 || amount > 1e8) return null;

    const dIdx = body.search(DEBIT), cIdx = body.search(CREDIT);
    let type = null;
    if (dIdx >= 0 && (cIdx < 0 || dIdx <= cIdx)) type = 'debit';
    else if (cIdx >= 0) type = 'credit';
    // "Your a/c is credited ... on debit of ..." style edge cases fall to whichever appears first
    if (!type) return null;

    let merchant = extractMerchant(body, type) || (type === 'credit' ? 'Incoming' : 'Unknown');
    const category = type === 'debit' ? categorize(merchant, body, overrides) : 'income';
    if (merchant === 'Unknown' && category !== 'other' && category !== 'transfer') merchant = CATEGORIES[category].name;
    return {
      id: (sms.id != null ? String(sms.id) : '') + '_' + sms.date,
      date: Number(sms.date),
      amount,
      type,
      merchant,
      category,
      bank: extractBank(sms.address, body),
      body,
    };
  }

  function parseAll(list, overrides) {
    const out = [];
    for (const s of list) {
      const t = parseOne(s, overrides);
      if (t) out.push(t);
    }
    out.sort((a, b) => a.date - b.date);
    // Drop duplicates: the bank and the UPI app often both report the same payment.
    const kept = [];
    for (const t of out) {
      const dup = kept.slice(-8).find(k => k.type === t.type && k.amount === t.amount && Math.abs(k.date - t.date) < 5 * 60 * 1000);
      if (dup) { if (dup.merchant === 'Unknown' && t.merchant !== 'Unknown') { dup.merchant = t.merchant; dup.category = t.category; } continue; }
      kept.push(t);
    }
    return kept.reverse();
  }

  window.SpendParser = { CATEGORIES, parseAll, parseOne, categorize };
})();
