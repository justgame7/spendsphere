// Demo SMS inbox, used only when the app runs in a browser (no SMS access).
// Bodies mimic real Indian bank / UPI alerts so they go through the real parser.
window.makeDemoSms = function (months) {
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const amt = (lo, hi) => Math.round(lo + rnd() * (hi - lo));
  const fmt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const d2 = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(2)}`;

  const tpl = [
    [6, () => ['swiggy@icici', 180, 650], (m, a, d) => `Rs.${fmt(a)} debited from A/c XX4821 on ${d2(d)} to VPA ${m} (UPI Ref No 4${amt(1e10, 9e10)}). Not you? Call 18002586161 -SBI`, 'JD-SBIUPI'],
    [5, () => ['zomato@hdfcbank', 220, 900], (m, a, d) => `Sent Rs.${fmt(a)} From HDFC Bank A/C *7712 To ZOMATO On ${d2(d)} Ref ${amt(1e11, 9e11)} Not You? Call 18002586161/SMS BLOCK UPI to 7308080808`, 'AD-HDFCBK'],
    [4, () => [pick(['BLINKIT', 'ZEPTO', 'BIGBASKET', 'DMART']), 300, 2400], (m, a, d) => `INR ${fmt(a)} spent on ICICI Bank Card XX9004 on ${d2(d)} at ${m}. Avl Lmt: INR 1,82,340.00. To dispute, call 18001080.`, 'VM-ICICIT'],
    [3, () => [pick(['AMAZON PAY INDIA', 'FLIPKART', 'MYNTRA', 'AJIO']), 450, 6000], (m, a, d) => `INR ${fmt(a)} spent on HDFC Bank Card x3321 at ${m} on ${d.toISOString().slice(0, 10)}. Avl bal: INR 54,210.00`, 'AX-HDFCBK'],
    [4, () => [pick(['UBER INDIA', 'OLA', 'RAPIDO']), 90, 650], (m, a, d) => `Your A/c XX4821 has been debited by Rs.${fmt(a)} on ${d2(d)} towards ${m} via UPI. Avl Bal Rs.${fmt(amt(8000, 90000))} -Axis Bank`, 'BZ-AXISBK'],
    [1.5, () => [pick(['HPCL PETROL PUMP', 'INDIAN OIL', 'BPCL FUEL STN']), 800, 3000], (m, a, d) => `Rs ${fmt(a)} spent on your SBI Credit Card ending 5521 at ${m} on ${d2(d)}. Trxn not done by you? Report at sbicard.com`, 'VK-SBICRD'],
    [1, () => [pick(['NETFLIX', 'SPOTIFY', 'BOOKMYSHOW', 'PVR CINEMAS']), 119, 1200], (m, a, d) => `INR ${fmt(a)} spent on ICICI Bank Card XX9004 on ${d2(d)} at ${m}. Avl Lmt: INR 1,74,020.00.`, 'VM-ICICIT'],
    [0.8, () => [pick(['APOLLO PHARMACY', 'PHARMEASY', 'TATA 1MG']), 200, 2200], (m, a, d) => `Rs.${fmt(a)} debited from A/c XX4821 on ${d2(d)} to VPA apollopharmacy@ybl (UPI Ref No 3${amt(1e10, 9e10)}) -SBI`, 'JD-SBIUPI'],
    [2, () => [pick(['RAMESH KUMAR', 'PRIYA S', 'ARUN M', 'KAVITHA R']), 200, 3500], (m, a, d) => `Sent Rs.${fmt(a)} From HDFC Bank A/C *7712 To ${m} On ${d2(d)} Ref ${amt(1e11, 9e11)} Not You? Call 18002586161`, 'AD-HDFCBK'],
    [0.6, () => ['ATM', 1000, 5000], (m, a, d) => `Rs.${fmt(a)} withdrawn at ATM S1AW0123 from A/c XX4821 on ${d2(d)}. Avl Bal Rs.${fmt(amt(8000, 90000))} -SBI`, 'VM-SBIINB'],
    [2.5, () => [pick(['CHAAYOS', 'STARBUCKS', 'THIRD WAVE COFFEE', 'A2B RESTAURANT']), 120, 900], (m, a, d) => `INR ${fmt(a)} spent on HDFC Bank Card x3321 at ${m} on ${d.toISOString().slice(0, 10)}. Avl bal: INR 41,880.00`, 'AX-HDFCBK'],
  ];
  const monthly = [
    [5, (d) => `Rs.${fmt(799)} debited from A/c XX4821 on ${d2(d)} to VPA airtel.payments@icici for Airtel Postpaid bill -SBI`, 'JD-SBIUPI'],
    [8, (d) => `Your a/c XX4821 is debited for Rs.${fmt(amt(1400, 3600))} on ${d2(d)} towards BESCOM electricity bill payment via BillDesk -SBI`, 'VM-SBIINB'],
    [3, (d) => `EMI of Rs.${fmt(12450)} for loan a/c XX0921 has been debited from your A/c XX7712 on ${d2(d)} -HDFC Bank`, 'AD-HDFCBK'],
    [10, (d) => `Rs.${fmt(5000)} debited from A/c XX4821 on ${d2(d)} towards SIP in ZERODHA COIN mutual fund. -SBI`, 'VM-SBIINB'],
    [1, (d) => `Dear Customer, your A/c XX7712 is credited with INR ${fmt(amt(98000, 104000))} on ${d2(d)} by NEFT from ACME TECHNOLOGIES PVT LTD (Salary). -HDFC Bank`, 'AD-HDFCBK'],
    [2, (d) => `Rs.${fmt(18000)} debited from A/c XX7712 on ${d2(d)} to VPA landlord.rent@okaxis for house rent -HDFC`, 'AD-HDFCBK'],
  ];
  const noise = [
    (d) => `${amt(100000, 999999)} is your OTP for txn of Rs.${fmt(amt(100, 2000))} at AMAZON. Do not share. -HDFC Bank`,
    (d) => `Your credit card bill of Rs.${fmt(amt(5000, 40000))} is due on ${d2(d)}. Minimum amount due Rs.2,000.00`,
    (d) => `Congratulations! You are eligible for a pre-approved loan of Rs.5,00,000. Apply now.`,
  ];

  const out = [];
  const now = new Date();
  const start = new Date(now); start.setMonth(start.getMonth() - months);
  let id = 1;
  for (let day = new Date(start); day <= now; day.setDate(day.getDate() + 1)) {
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    for (const [w, meta, body, addr] of tpl) {
      const p = (w / 30) * (weekend ? 1.6 : 0.9) * (day.getMonth() === 9 || day.getMonth() === 10 ? 1.25 : 1);
      if (rnd() < p) {
        const [m, lo, hi] = meta();
        const d = new Date(day); d.setHours(8 + Math.floor(rnd() * 14), Math.floor(rnd() * 60));
        out.push({ id: id++, address: addr, date: d.getTime(), body: body(m, amt(lo, hi), d) });
      }
    }
    for (const [dom, body, addr] of monthly) {
      if (day.getDate() === dom) {
        const d = new Date(day); d.setHours(10, 5);
        out.push({ id: id++, address: addr, date: d.getTime(), body: body(d) });
      }
    }
    if (rnd() < 0.15) { const d = new Date(day); out.push({ id: id++, address: 'AD-HDFCBK', date: d.getTime(), body: pick(noise)(d) }); }
  }
  return out;
};
