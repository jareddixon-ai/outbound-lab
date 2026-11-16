// The ideal customer profile (ICP): who is a good fit for Nectar.
//
// Claude scores every lead against this text, so this is the one place to
// change when the team's view of a good customer changes. It is written as
// plain English on purpose: a sales leader should be able to read and edit it.

export const ICP = `
Nectar Social is an AI social-commerce startup. It helps consumer brands turn
their social media audience into sales.

A strong-fit company:
- Sells consumer products: DTC (direct-to-consumer) or CPG (consumer packaged
  goods). Beauty, personal care, fashion, apparel, food and beverage, wellness,
  home and pet are the best categories.
- Is visibly active on social media, especially TikTok and Instagram, and
  sells online.
- Is big enough to buy software and have a social or e-commerce team: roughly
  50 to 5,000 employees. Under 20 employees is usually too early.

A strong-fit person:
- Owns social, community, e-commerce, growth or brand marketing.
  For example: Head of Social, Director of E-commerce, VP Marketing, CMO,
  Social Media Manager, Head of Growth.
- Founders and CEOs are a good fit at companies under about 200 employees.

A poor fit:
- B2B companies, agencies, software companies, banks, industrial companies.
- People in roles that don't touch social or revenue (finance, legal, IT, HR).
`.trim();
