/**
 * Rule-based fallback when OpenAI is not configured or fails.
 * Answers common handbag shop questions.
 */
export function ruleBasedReply(message) {
  const m = message.toLowerCase().trim();

  if (/hello|hi\b|hey/.test(m)) {
    return "Hello! I'm here to help with Belle Sac — our women's handbag boutique. Ask about shipping, returns, sizes, or orders.";
  }
  if (/shipping|delivery|ship/.test(m)) {
    return 'We offer standard (5–7 business days) and express (2–3 days) shipping. Free standard shipping on orders over $75. You can track orders from your account.';
  }
  if (/return|refund|exchange/.test(m)) {
    return 'Returns are accepted within 30 days of delivery if items are unused with tags. Contact support with your order number to start a return.';
  }
  if (/payment|pay|card|visa|mastercard|stripe/.test(m)) {
    return 'We accept major cards (Visa, Mastercard, etc.) securely via Stripe at checkout.';
  }
  if (/hours|open|store|location|address/.test(m)) {
    return 'Our online store is open 24/7. Visit the Contact page for email, phone, and our showroom address.';
  }
  if (/order|track|status/.test(m)) {
    return 'Log in and open Order History to see status: Pending → Shipped → Delivered. You will also receive email updates.';
  }
  if (/handbag|bag|purse|leather|tote|clutch/.test(m)) {
    return 'We carry totes, crossbody bags, clutches, and more — filter by category on the Shop page. Each product page has details, photos, and reviews.';
  }

  return "Thanks for your message! For product details browse our Shop; for account or order help, check Order History or use the Contact form. I'm a simple assistant — for complex issues, our team will reply by email.";
}
