"use strict";

/*
 * Built-in business templates. Each template is a complete, ready-to-build
 * app configuration that users then customise in the editor.
 *
 * Extra templates can be dropped into TEMPLATES_DIR as JSON files, or saved
 * from any app by an administrator (stored in the database).
 */

// ------------------------------------------------------------------ helpers

const DEMO_PHONE = "+1 555 010 0100";

function hours(weekdays, saturday, sunday) {
  return [
    { label: "Mon – Fri", value: weekdays },
    { label: "Saturday", value: saturday },
    { label: "Sunday", value: sunday },
  ];
}

function business(o) {
  return {
    name: "",
    tagline: "",
    description: "",
    logo: "",
    phone: DEMO_PHONE,
    whatsapp: DEMO_PHONE,
    email: "hello@example.com",
    address: "123 Main Street, Springfield",
    mapQuery: "",
    website: "",
    currency: "$",
    hours: hours("9:00 AM – 6:00 PM", "10:00 AM – 4:00 PM", "Closed"),
    social: { facebook: "", instagram: "", x: "", youtube: "", linkedin: "", tiktok: "" },
    ...o,
  };
}

function theme(primary, secondary, extra = {}) {
  return { primary, secondary, dark: false, font: "system", corners: "rounded", headerStyle: "solid", ...extra };
}

const page = (id, type, title, icon, extra = {}) => ({ id, type, title, icon, ...extra });

const home = (o) => page("home", "home", "Home", "home", { showQuickActions: true, showShortcuts: true, ...o });
const about = (content, o = {}) => page("about", "about", "About", "info", { content, ...o });
const contact = (o = {}) =>
  page("contact", "contact", "Contact", "phone", { showHours: true, showForm: true, submitVia: "server", ...o });
const booking = (title, services, o = {}) =>
  page("booking", "booking", title, "event", { services: services.join("\n"), submitVia: "server", ...o });
const faq = (items, o = {}) =>
  page("faq", "faq", "FAQ", "help", { items: items.map(([question, answer]) => ({ question, answer })), ...o });
const reviews = (items, o = {}) =>
  page("reviews", "testimonials", "Reviews", "star", {
    items: items.map(([name, text, rating = 5]) => ({ name, text, rating })),
    ...o,
  });
const team = (members, o = {}) =>
  page("team", "team", "Team", "people", { members: members.map(([name, role, bio = ""]) => ({ name, role, bio, photo: "" })), ...o });
const catalog = (id, title, icon, items, o = {}) =>
  page(id, "catalog", title, icon, {
    layout: "list",
    showPrices: true,
    enableOrders: false,
    orderVia: "whatsapp",
    items: items.map(([name, price, category, description, badge = ""]) => ({ name, price, category, description, badge, image: "" })),
    ...o,
  });
const pricing = (title, items, o = {}) =>
  page("plans", "pricing", title, "tag", {
    items: items.map(([name, price, period, features, highlighted = false]) => ({ name, price, period, features: features.join("\n"), highlighted })),
    ...o,
  });
const events = (title, items, o = {}) =>
  page("events", "events", title, "event", {
    items: items.map(([title_, date, time, location, description]) => ({ title: title_, date, time, location, description, image: "" })),
    ...o,
  });
const offers = (items, o = {}) =>
  page("offers", "offers", "Offers", "offer", {
    items: items.map(([title, description, code, validUntil]) => ({ title, description, code, validUntil, image: "" })),
    ...o,
  });
const gallery = (o = {}) => page("gallery", "gallery", "Gallery", "image", { images: [], intro: "", ...o });
const highlights = (list) => list.map(([icon, title, text]) => ({ icon, title, text }));

function upcoming(days) {
  const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + days));
  return d.toISOString().slice(0, 10);
}

function app(appName, b, t, pages, extra = {}) {
  return {
    schemaVersion: 1,
    mode: "app",
    appName,
    theme: t,
    navigation: "bottom",
    business: b,
    features: { floatingButton: "whatsapp", shareText: "" },
    pages,
    ...extra,
  };
}

function tpl(id, name, category, icon, description, config, tags = []) {
  return { id, name, category, icon, description, tags, builtin: true, config };
}

// ------------------------------------------------------------------ catalog

const templates = [
  tpl("restaurant", "Restaurant", "Food & Drink", "restaurant",
    "Digital menu with online ordering via WhatsApp, table reservations, gallery and reviews.",
    app("Bella Cucina",
      business({ name: "Bella Cucina", tagline: "Authentic Italian kitchen since 1998", currency: "$",
        description: "Family-run trattoria serving hand-made pasta, wood-fired pizza and seasonal Italian classics.",
        hours: hours("11:30 AM – 10:00 PM", "11:00 AM – 11:00 PM", "12:00 PM – 9:00 PM") }),
      theme("#B3261E", "#F2A900", { font: "serif" }),
      [
        home({ heroTitle: "Bella Cucina", heroSubtitle: "Hand-made pasta & wood-fired pizza", ctaLabel: "Order now", ctaAction: "menu",
          highlights: highlights([["restaurant", "Fresh every day", "Pasta made in-house each morning."], ["truck", "Fast delivery", "Hot to your door in 30 minutes."], ["star", "Loved locally", "Rated 4.8 by 2,000+ guests."]]) }),
        catalog("menu", "Menu", "restaurant", [
          ["Margherita Pizza", 12, "Pizza", "San Marzano tomato, fior di latte, basil.", "Bestseller"],
          ["Diavola Pizza", 14, "Pizza", "Spicy salami, chilli oil, mozzarella."],
          ["Spaghetti Carbonara", 15, "Pasta", "Guanciale, egg yolk, pecorino, black pepper."],
          ["Lasagna della Nonna", 16, "Pasta", "Slow-cooked ragù, béchamel, parmigiano."],
          ["Caesar Salad", 9, "Starters", "Romaine, croutons, parmesan, house dressing."],
          ["Bruschetta", 7, "Starters", "Grilled bread, tomato, garlic, olive oil."],
          ["Tiramisu", 7, "Desserts", "Mascarpone, espresso, cocoa."],
          ["Panna Cotta", 6, "Desserts", "Vanilla cream with berry coulis."],
        ], { enableOrders: true, layout: "list", intro: "Tap + to add dishes to your order." }),
        booking("Reserve", ["Lunch", "Dinner", "Private event"], { askGuests: true, intro: "Book a table and we'll confirm by phone.", buttonLabel: "Reserve a table", serviceLabel: "Occasion" }),
        gallery(),
        reviews([["Maria G.", "Best carbonara outside of Rome!"], ["Tom H.", "Cosy place, friendly staff, amazing pizza."], ["Priya S.", "Our go-to for family dinners.", 4]]),
        contact(),
      ])),

  tpl("cafe", "Café & Bakery", "Food & Drink", "cafe",
    "Coffee shop app with drinks & pastries menu, loyalty offers and opening hours.",
    app("Morning Brew",
      business({ name: "Morning Brew", tagline: "Specialty coffee & fresh pastries", currency: "$",
        description: "Small-batch roasted coffee and pastries baked on site every morning.",
        hours: hours("7:00 AM – 7:00 PM", "8:00 AM – 6:00 PM", "8:00 AM – 2:00 PM") }),
      theme("#6F4E37", "#D4A373", { font: "rounded" }),
      [
        home({ heroSubtitle: "Freshly roasted. Freshly baked.", ctaLabel: "See the menu", ctaAction: "menu",
          highlights: highlights([["cafe", "Specialty beans", "Single-origin, roasted weekly."], ["leaf", "Plant-based options", "Oat, almond and soy at no extra cost."], ["web", "Free Wi-Fi", "Perfect spot to work or study."]]) }),
        catalog("menu", "Menu", "cafe", [
          ["Espresso", 2.5, "Coffee", "Double shot of our house blend."],
          ["Flat White", 3.8, "Coffee", "Velvety micro-foam over ristretto.", "Popular"],
          ["Iced Latte", 4.2, "Coffee", "Espresso, milk and ice."],
          ["Matcha Latte", 4.5, "Tea", "Ceremonial grade matcha."],
          ["Butter Croissant", 3, "Bakery", "Flaky, all-butter, baked at 6 AM."],
          ["Cinnamon Roll", 3.5, "Bakery", "With cream cheese frosting."],
          ["Avocado Toast", 8, "Food", "Sourdough, smashed avocado, chilli flakes."],
        ], { layout: "grid", enableOrders: true }),
        offers([["Loyalty card", "Buy 9 coffees, get the 10th free. Show this screen at the counter.", "BREW10", ""], ["Happy hour", "20% off all pastries after 5 PM.", "", ""]]),
        about("We started as a tiny coffee cart in 2015. Today we roast our own beans and bake everything in-house.\n\nCome say hi!"),
        contact(),
      ])),

  tpl("cloud-kitchen", "Food Delivery", "Food & Drink", "truck",
    "Delivery-first food brand with categories, cart and WhatsApp checkout.",
    app("Spice Box",
      business({ name: "Spice Box", tagline: "Home-style meals, delivered hot", currency: "₹",
        hours: hours("11:00 AM – 11:00 PM", "11:00 AM – 11:30 PM", "11:00 AM – 11:30 PM") }),
      theme("#E65100", "#2E7D32"),
      [
        home({ heroSubtitle: "Order in 3 taps. Delivered in 30 minutes.", ctaLabel: "Order food", ctaAction: "menu",
          highlights: highlights([["truck", "Free delivery", "On orders above ₹299."], ["bolt", "30-minute delivery", "Or your next meal is on us."], ["shield", "Hygienic kitchen", "FSSAI certified, sealed packaging."]]) }),
        catalog("menu", "Order", "cart", [
          ["Butter Chicken Bowl", 249, "Bowls", "Creamy tomato gravy, jeera rice.", "Bestseller"],
          ["Paneer Tikka Bowl", 229, "Bowls", "Char-grilled paneer, mint rice."],
          ["Veg Biryani", 199, "Biryani", "Fragrant basmati, seasonal vegetables."],
          ["Chicken Biryani", 259, "Biryani", "Hyderabadi dum style."],
          ["Masala Fries", 99, "Sides", "Crispy fries with house spice."],
          ["Gulab Jamun (2 pcs)", 79, "Desserts", "Warm, soaked in saffron syrup."],
        ], { enableOrders: true, layout: "grid" }),
        offers([["First order 20% off", "Use this code on your first WhatsApp order.", "WELCOME20", ""]]),
        contact({ showForm: false }),
      ])),

  tpl("retail-store", "Retail Store", "Retail & Shopping", "store",
    "Product catalog with categories, offers, store locator and enquiries.",
    app("City Mart",
      business({ name: "City Mart", tagline: "Everything you need, close to home",
        hours: hours("8:00 AM – 9:00 PM", "8:00 AM – 9:00 PM", "9:00 AM – 6:00 PM") }),
      theme("#00695C", "#FFB300"),
      [
        home({ heroSubtitle: "Quality products at everyday low prices", ctaLabel: "Browse products", ctaAction: "products",
          highlights: highlights([["tag", "Weekly deals", "New offers every Monday."], ["truck", "Home delivery", "Same-day within 5 km."], ["check", "Easy returns", "7-day no-questions return policy."]]) }),
        catalog("products", "Products", "store", [
          ["Wireless Earbuds", 39.99, "Electronics", "Bluetooth 5.3, 24h battery.", "New"],
          ["Smart Watch", 59.99, "Electronics", "Heart rate, sleep tracking, notifications."],
          ["Cotton T-Shirt", 12.99, "Clothing", "100% organic cotton, 6 colours."],
          ["Running Shoes", 49.99, "Clothing", "Lightweight, breathable mesh."],
          ["Ceramic Mug Set", 19.99, "Home", "Set of 4, dishwasher safe."],
          ["LED Desk Lamp", 24.99, "Home", "Dimmable, USB charging port."],
        ], { layout: "grid", enableOrders: true, orderVia: "whatsapp" }),
        offers([["Weekend sale", "Up to 30% off home essentials this weekend.", "", ""], ["Refer a friend", "Both of you get $5 off your next purchase.", "FRIEND5", ""]]),
        about("City Mart has served the neighbourhood for over 10 years with friendly service and fair prices."),
        contact(),
      ])),

  tpl("fashion-boutique", "Fashion Boutique", "Retail & Shopping", "tag",
    "Stylish lookbook-style catalog for clothing, jewellery and accessories brands.",
    app("Maison Rose",
      business({ name: "Maison Rose", tagline: "Curated fashion for every occasion", currency: "$" }),
      theme("#1A1A1A", "#D81B60", { font: "serif", corners: "square", headerStyle: "light" }),
      [
        home({ heroSubtitle: "New season collection is here", ctaLabel: "Shop collection", ctaAction: "shop",
          highlights: highlights([["star", "Handpicked styles", "Small batches, unique pieces."], ["truck", "Free shipping", "On orders over $75."], ["heart", "Personal styling", "Book a free styling session."]]) }),
        catalog("shop", "Shop", "tag", [
          ["Linen Summer Dress", 89, "Dresses", "Breathable linen, relaxed fit.", "New"],
          ["Silk Slip Dress", 129, "Dresses", "Bias-cut mulberry silk."],
          ["Oversized Blazer", 149, "Outerwear", "Tailored wool blend."],
          ["Gold Hoop Earrings", 39, "Accessories", "18k gold plated."],
          ["Leather Tote", 119, "Accessories", "Full-grain leather, hand-stitched."],
          ["High-Rise Jeans", 79, "Denim", "Stretch denim, straight leg."],
        ], { layout: "grid", enableOrders: true }),
        gallery({ title: "Lookbook", icon: "camera" }),
        booking("Styling", ["Personal styling (45 min)", "Wardrobe edit (90 min)", "Bridal consultation"], { intro: "Book a one-to-one session with our stylists." }),
        contact(),
      ])),

  tpl("grocery", "Grocery & Supermarket", "Retail & Shopping", "cart",
    "Fresh produce and daily essentials with cart ordering and home delivery info.",
    app("FreshBasket",
      business({ name: "FreshBasket", tagline: "Farm-fresh groceries delivered", currency: "$",
        hours: hours("7:00 AM – 10:00 PM", "7:00 AM – 10:00 PM", "8:00 AM – 8:00 PM") }),
      theme("#2E7D32", "#F9A825", { font: "rounded" }),
      [
        home({ heroSubtitle: "Fresh fruit, veg & essentials at your door", ctaLabel: "Start shopping", ctaAction: "shop",
          highlights: highlights([["leaf", "Farm fresh", "Sourced from local farms daily."], ["truck", "2-hour delivery", "Slots from 8 AM to 9 PM."], ["tag", "Best prices", "Price-match guarantee."]]) }),
        catalog("shop", "Shop", "cart", [
          ["Bananas (1 kg)", 1.49, "Fruit", "Ripe and sweet."],
          ["Avocados (2 pcs)", 2.99, "Fruit", "Ready to eat."],
          ["Tomatoes (500 g)", 1.99, "Vegetables", "Vine-ripened."],
          ["Baby Spinach (200 g)", 2.49, "Vegetables", "Washed and ready."],
          ["Whole Milk (1 L)", 1.29, "Dairy", "From grass-fed cows."],
          ["Free-range Eggs (12)", 3.99, "Dairy", "Large, free-range.", "Popular"],
          ["Sourdough Loaf", 4.5, "Bakery", "Baked fresh daily."],
        ], { layout: "grid", enableOrders: true }),
        offers([["Fresh Friday", "15% off all fruit & veg every Friday.", "FRESH15", ""]]),
        faq([["What's the minimum order?", "Minimum order is $20. Delivery is free above $40."], ["Which areas do you deliver to?", "We deliver within 10 km of our store."], ["How do I pay?", "Cash, card or UPI/mobile wallet on delivery."]]),
        contact(),
      ])),

  tpl("salon-spa", "Salon & Spa", "Health & Beauty", "scissors",
    "Service menu with prices, stylist profiles, appointment booking and offers.",
    app("Glow Studio",
      business({ name: "Glow Studio", tagline: "Hair · Beauty · Wellness", currency: "$",
        hours: hours("10:00 AM – 8:00 PM", "9:00 AM – 8:00 PM", "10:00 AM – 5:00 PM") }),
      theme("#8E24AA", "#F48FB1", { corners: "pill" }),
      [
        home({ heroSubtitle: "Look good. Feel amazing.", ctaLabel: "Book appointment", ctaAction: "booking",
          highlights: highlights([["scissors", "Expert stylists", "10+ years of experience."], ["leaf", "Organic products", "Cruelty-free, gentle on skin."], ["heart", "Relaxing space", "Complimentary tea & head massage."]]) }),
        catalog("services", "Services", "scissors", [
          ["Women's Haircut & Style", 45, "Hair", "Consultation, wash, cut and blow-dry."],
          ["Men's Haircut", 25, "Hair", "Classic or modern cut, hot towel finish."],
          ["Balayage", 140, "Hair", "Hand-painted highlights.", "Trending"],
          ["Classic Facial", 60, "Skin", "Deep cleanse, exfoliation, mask."],
          ["Gel Manicure", 35, "Nails", "Long-lasting shine for 3 weeks."],
          ["Swedish Massage (60 min)", 75, "Spa", "Full-body relaxation massage."],
        ]),
        booking("Book", ["Haircut & Style", "Colour / Balayage", "Facial", "Manicure / Pedicure", "Massage"], { intro: "Choose a service and time. We'll confirm on WhatsApp." }),
        team([["Sophie", "Senior Stylist", "Colour specialist with 12 years' experience."], ["Aiden", "Barber", "Fades, beard trims and classic cuts."], ["Lena", "Skin Therapist", "Facials and advanced skincare."]], { title: "Stylists" }),
        offers([["New client offer", "20% off your first visit.", "GLOW20", ""]]),
        contact(),
      ])),

  tpl("fitness-gym", "Gym & Fitness", "Health & Beauty", "fitness",
    "Membership plans, class schedule, trainer profiles and free-trial sign-ups.",
    app("Iron Pulse Gym",
      business({ name: "Iron Pulse Gym", tagline: "Stronger every day", currency: "$",
        hours: hours("5:00 AM – 11:00 PM", "6:00 AM – 9:00 PM", "7:00 AM – 7:00 PM") }),
      theme("#111827", "#F97316", { dark: true, font: "condensed" }),
      [
        home({ heroSubtitle: "Train with the best equipment and coaches in town", ctaLabel: "Claim free trial", ctaAction: "booking",
          highlights: highlights([["fitness", "Modern equipment", "200+ machines and free weights."], ["people", "Group classes", "HIIT, spin, yoga and more."], ["clock", "Open early & late", "5 AM to 11 PM on weekdays."]]) }),
        pricing("Plans", [
          ["Basic", 29, "month", ["Gym floor access", "Locker room", "Fitness assessment"]],
          ["Pro", 49, "month", ["Everything in Basic", "Unlimited classes", "1 PT session / month"], true],
          ["Elite", 89, "month", ["Everything in Pro", "Weekly PT sessions", "Nutrition plan", "Sauna access"]],
        ], { buttonLabel: "Join now" }),
        events("Classes", [
          ["HIIT Blast", upcoming(1), "6:30 AM", "Studio A", "45 minutes of high-intensity intervals."],
          ["Spin & Burn", upcoming(1), "6:00 PM", "Cycle Room", "Rhythm-based indoor cycling."],
          ["Power Yoga", upcoming(2), "7:30 AM", "Studio B", "Strength and flexibility flow."],
          ["Boxing Basics", upcoming(3), "7:00 PM", "Ring", "Technique, pads and conditioning."],
        ]),
        team([["Marcus Lee", "Head Coach", "Strength & conditioning, 15 years."], ["Ana Ruiz", "Yoga Instructor", "RYT-500 certified."], ["Jay Patel", "Personal Trainer", "Fat loss and body recomposition."]], { title: "Trainers" }),
        booking("Free trial", ["1-day free pass", "Personal training consultation", "Class trial"], { intro: "Try us free — no commitment.", buttonLabel: "Get my free pass" }),
        contact(),
      ])),

  tpl("medical-clinic", "Medical Clinic", "Healthcare", "medical",
    "Doctors, departments, appointment requests, emergency contact and FAQs.",
    app("CarePoint Clinic",
      business({ name: "CarePoint Clinic", tagline: "Compassionate care for the whole family",
        hours: hours("8:00 AM – 8:00 PM", "9:00 AM – 2:00 PM", "Emergency only") }),
      theme("#0277BD", "#26A69A"),
      [
        home({ heroSubtitle: "Same-day appointments available", ctaLabel: "Book appointment", ctaAction: "booking",
          highlights: highlights([["medical", "Experienced doctors", "Board-certified specialists."], ["clock", "Short waiting times", "Most patients seen within 15 minutes."], ["shield", "Insurance accepted", "We work with all major insurers."]]) }),
        catalog("departments", "Services", "medical", [
          ["General Medicine", "", "Primary care", "Check-ups, illness and chronic disease management."],
          ["Paediatrics", "", "Primary care", "Care for infants, children and teens."],
          ["Cardiology", "", "Specialists", "Heart health screening and treatment."],
          ["Dermatology", "", "Specialists", "Skin, hair and nail conditions."],
          ["Lab Tests", "", "Diagnostics", "Blood tests with results in 24 hours."],
          ["Vaccinations", "", "Preventive", "Flu, travel and routine vaccines."],
        ], { showPrices: false, enquireLabel: "Ask about this service" }),
        team([["Dr. Sarah Kim", "General Physician", "MBBS, MD — 14 years of family practice."], ["Dr. Rahul Mehta", "Cardiologist", "Fellow of the College of Cardiology."], ["Dr. Emily Brown", "Paediatrician", "Gentle care for little ones."]], { title: "Doctors", icon: "people" }),
        booking("Appointment", ["General consultation", "Specialist consultation", "Lab test", "Vaccination", "Follow-up visit"], { intro: "Request an appointment — our front desk will confirm by phone." }),
        faq([["Do I need a referral?", "No referral is needed for general consultations."], ["What should I bring?", "Photo ID, insurance card and any previous reports."], ["Do you offer teleconsultation?", "Yes, video consultations are available on request."]]),
        contact({ intro: "For emergencies call your local emergency number immediately." }),
      ])),

  tpl("dental", "Dental Clinic", "Healthcare", "medical",
    "Treatments, pricing, dentist profiles, before/after gallery and bookings.",
    app("BrightSmile Dental",
      business({ name: "BrightSmile Dental", tagline: "Gentle dentistry for the whole family", currency: "$" }),
      theme("#0097A7", "#80DEEA", { corners: "pill" }),
      [
        home({ heroSubtitle: "Healthy, confident smiles", ctaLabel: "Book a check-up", ctaAction: "booking",
          highlights: highlights([["heart", "Pain-free care", "Modern, gentle techniques."], ["star", "5-star rated", "Hundreds of happy patients."], ["tag", "Payment plans", "0% interest on treatments."]]) }),
        catalog("treatments", "Treatments", "medical", [
          ["Check-up & Cleaning", 79, "General", "Exam, scale and polish."],
          ["Teeth Whitening", 299, "Cosmetic", "Up to 8 shades whiter in one visit.", "Popular"],
          ["Clear Aligners", 2500, "Orthodontics", "Invisible teeth straightening."],
          ["Dental Implant", 1800, "Restorative", "Permanent tooth replacement."],
          ["Root Canal", 650, "Restorative", "Save your natural tooth."],
        ]),
        team([["Dr. Olivia Chen", "Lead Dentist", "Cosmetic and implant dentistry."], ["Dr. Ben Carter", "Orthodontist", "Aligners and braces."]], { title: "Dentists" }),
        booking("Book", ["Check-up & cleaning", "Whitening consultation", "Aligner consultation", "Emergency visit"]),
        reviews([["Hannah", "I used to be scared of dentists. Not anymore!"], ["Leo", "Whitening results were incredible."]]),
        contact(),
      ])),

  tpl("pharmacy", "Pharmacy", "Healthcare", "medical",
    "Medicine enquiries, prescription upload via WhatsApp, health products and offers.",
    app("HealthPlus Pharmacy",
      business({ name: "HealthPlus Pharmacy", tagline: "Your neighbourhood pharmacy, open late",
        hours: hours("8:00 AM – 11:00 PM", "8:00 AM – 11:00 PM", "9:00 AM – 9:00 PM") }),
      theme("#2E7D32", "#C62828"),
      [
        home({ heroSubtitle: "Send your prescription on WhatsApp — we'll have it ready", ctaLabel: "Send prescription", ctaAction: "whatsapp",
          highlights: highlights([["medical", "Licensed pharmacists", "Free medication advice."], ["truck", "Home delivery", "Free for seniors."], ["clock", "Open late", "Until 11 PM every day."]]) }),
        catalog("products", "Products", "cart", [
          ["Vitamin D3 1000 IU", 8.99, "Vitamins", "90 softgels."],
          ["Digital Thermometer", 12.5, "Devices", "Fast 10-second reading."],
          ["Blood Pressure Monitor", 39.99, "Devices", "Upper-arm, memory for 2 users."],
          ["Hand Sanitiser 500 ml", 4.99, "Personal care", "70% alcohol."],
          ["Sunscreen SPF 50", 14.99, "Skin care", "Broad spectrum, water resistant."],
        ], { enableOrders: true }),
        offers([["Senior citizens", "10% off all purchases for customers over 60.", "", ""]]),
        faq([["Can I order prescription medicines?", "Yes — send a photo of your valid prescription on WhatsApp."], ["Do you deliver?", "We deliver within 5 km, free for orders over $25."]]),
        contact(),
      ])),

  tpl("real-estate", "Real Estate Agency", "Real Estate", "business",
    "Property listings with prices, agent profiles, viewing requests and mortgage FAQs.",
    app("Skyline Realty",
      business({ name: "Skyline Realty", tagline: "Find a place you'll love to call home", currency: "$" }),
      theme("#1B3A5C", "#C9A227", { font: "serif" }),
      [
        home({ heroSubtitle: "Buy · Sell · Rent", ctaLabel: "View listings", ctaAction: "listings",
          highlights: highlights([["business", "500+ properties", "Homes, apartments and commercial."], ["people", "Local experts", "Agents who know every street."], ["check", "Hassle-free paperwork", "We handle the legal work."]]) }),
        catalog("listings", "Listings", "business", [
          ["Modern 3-Bed Family Home", 485000, "For sale", "3 bed · 2 bath · 1,850 sq ft · Garden & garage.", "New"],
          ["Downtown 1-Bed Apartment", 1850, "For rent", "Monthly rent · 1 bed · 1 bath · City views."],
          ["Luxury Penthouse", 1250000, "For sale", "4 bed · 3 bath · Private terrace."],
          ["Studio near University", 950, "For rent", "Monthly rent · Furnished · Bills included."],
          ["Retail Unit on High Street", 3200, "Commercial", "Monthly rent · 1,200 sq ft · High footfall."],
        ], { layout: "grid", enquireLabel: "Request a viewing" }),
        team([["James Walker", "Senior Agent", "Residential sales specialist."], ["Aisha Khan", "Lettings Manager", "Rentals and property management."]], { title: "Agents" }),
        booking("Viewing", ["Property viewing", "Free valuation", "Rental appraisal"], { intro: "Book a viewing or a free valuation of your property." }),
        faq([["How much deposit do I need?", "Typically 5–20% of the purchase price for buyers, or 1 month's rent for tenants."], ["Do you offer valuations?", "Yes, free and with no obligation."]]),
        contact(),
      ])),

  tpl("law-firm", "Law Firm", "Professional Services", "gavel",
    "Practice areas, attorney profiles, consultation booking and client FAQs.",
    app("Sterling & Associates",
      business({ name: "Sterling & Associates", tagline: "Trusted legal counsel since 1985" }),
      theme("#263238", "#B08D57", { font: "serif", corners: "square" }),
      [
        home({ heroSubtitle: "Clear advice. Strong representation.", ctaLabel: "Free consultation", ctaAction: "booking",
          highlights: highlights([["gavel", "35+ years", "Decades of courtroom experience."], ["shield", "Confidential", "Attorney-client privilege guaranteed."], ["check", "No win, no fee", "Available for personal injury cases."]]) }),
        catalog("practice", "Practice Areas", "gavel", [
          ["Corporate & Commercial", "", "Business", "Company formation, contracts, M&A."],
          ["Family Law", "", "Private client", "Divorce, custody and settlements."],
          ["Real Estate Law", "", "Property", "Conveyancing, leases and disputes."],
          ["Employment Law", "", "Business", "Contracts, disputes and compliance."],
          ["Personal Injury", "", "Litigation", "Accidents and compensation claims."],
          ["Wills & Probate", "", "Private client", "Estate planning and administration."],
        ], { showPrices: false, enquireLabel: "Discuss my case" }),
        team([["Robert Sterling", "Managing Partner", "Corporate law, 35 years."], ["Elena Vasquez", "Partner", "Family and private client law."], ["David Okafor", "Senior Associate", "Litigation and dispute resolution."]], { title: "Attorneys" }),
        booking("Consultation", ["Corporate matter", "Family matter", "Property matter", "Employment matter", "Other"], { intro: "Request a free 30-minute consultation.", askTime: false }),
        faq([["Is the first consultation free?", "Yes, the first 30 minutes are free of charge."], ["How are fees calculated?", "Fixed fees for most services; hourly rates for litigation."]]),
        contact(),
      ])),

  tpl("consulting", "Consulting & Agency", "Professional Services", "work",
    "Corporate profile with services, case studies, team, pricing and lead capture.",
    app("Northstar Consulting",
      business({ name: "Northstar Consulting", tagline: "Strategy that turns into results", currency: "$" }),
      theme("#3949AB", "#00ACC1"),
      [
        home({ heroSubtitle: "Helping growing companies scale with confidence", ctaLabel: "Book a discovery call", ctaAction: "booking",
          highlights: highlights([["work", "200+ clients", "From start-ups to enterprises."], ["bolt", "Fast impact", "Measurable results in 90 days."], ["globe", "Global reach", "Teams in 6 countries."]]) }),
        about("Northstar is an independent consultancy specialising in growth strategy, operations and digital transformation.\n\nWe work side by side with leadership teams to turn plans into measurable results.",
          { stats: [{ value: "15+", label: "Years" }, { value: "200+", label: "Clients" }, { value: "92%", label: "Retention" }] }),
        catalog("services", "Services", "work", [
          ["Growth Strategy", "", "Strategy", "Market entry, positioning and go-to-market."],
          ["Operations Excellence", "", "Operations", "Process design, lean and cost optimisation."],
          ["Digital Transformation", "", "Technology", "Roadmaps, tooling and change management."],
          ["Leadership Coaching", "", "People", "1:1 coaching for founders and executives."],
        ], { showPrices: false }),
        pricing("Packages", [
          ["Advisory", 1500, "month", ["Monthly strategy session", "Email support", "Quarterly review"]],
          ["Growth", 4500, "month", ["Weekly sessions", "Dedicated consultant", "KPI dashboard"], true],
          ["Enterprise", "Custom", "", ["Full project team", "On-site workshops", "Executive reporting"]],
        ]),
        team([["Claire Dubois", "Managing Director"], ["Ken Watanabe", "Head of Operations"], ["Sam Adeyemi", "Digital Lead"]]),
        booking("Contact us", ["Discovery call (30 min)", "Workshop enquiry", "Partnership"], { askDate: true, askTime: true }),
        contact(),
      ], { navigation: "drawer" })),

  tpl("accounting", "Accounting & Finance", "Professional Services", "bank",
    "Tax and bookkeeping services, deadlines calendar, document checklist and consultations.",
    app("LedgerPro Accountants",
      business({ name: "LedgerPro Accountants", tagline: "Tax, payroll & bookkeeping made simple", currency: "$" }),
      theme("#1565C0", "#43A047"),
      [
        home({ heroSubtitle: "Spend less time on numbers and more on your business", ctaLabel: "Get a quote", ctaAction: "booking",
          highlights: highlights([["bank", "Certified accountants", "CPA-qualified team."], ["shield", "Secure & compliant", "Bank-grade data protection."], ["clock", "Never miss a deadline", "Automatic filing reminders."]]) }),
        pricing("Pricing", [
          ["Sole Trader", 49, "month", ["Annual tax return", "Bookkeeping software", "Email support"]],
          ["Small Business", 149, "month", ["Year-end accounts", "VAT / GST returns", "Payroll up to 5 staff"], true],
          ["Growing Company", 349, "month", ["Management accounts", "Payroll up to 25 staff", "Dedicated accountant"]],
        ], { buttonLabel: "Get started" }),
        events("Deadlines", [
          ["Quarterly VAT return", upcoming(14), "", "Online", "Submit returns for the last quarter."],
          ["Payroll year-end", upcoming(45), "", "Online", "Final payroll submission for the tax year."],
        ], { icon: "clock" }),
        page("documents", "text", "Checklist", "list", { content: "**Documents to bring for your tax return:**\n\n- Photo ID and tax number\n- Income statements and payslips\n- Bank statements\n- Receipts for business expenses\n- Previous year's tax return" }),
        booking("Consultation", ["Personal tax", "Business accounts", "Payroll", "Company formation"]),
        contact(),
      ])),

  tpl("it-services", "IT & Software Company", "Technology", "computer",
    "Showcase services, portfolio, tech stack, pricing and project enquiries.",
    app("Pixel Forge",
      business({ name: "Pixel Forge", tagline: "We build apps and websites that grow businesses", currency: "$" }),
      theme("#5E35B1", "#00E5FF", { dark: true, font: "mono" }),
      [
        home({ heroSubtitle: "Web · Mobile · Cloud · AI", ctaLabel: "Start a project", ctaAction: "booking",
          highlights: highlights([["computer", "Full-stack team", "Design, development and DevOps."], ["bolt", "Agile delivery", "Working software every two weeks."], ["shield", "Secure by design", "ISO 27001 aligned processes."]]) }),
        catalog("services", "Services", "computer", [
          ["Mobile App Development", "", "Development", "Native and cross-platform apps."],
          ["Web Applications", "", "Development", "Fast, scalable web platforms."],
          ["Cloud & DevOps", "", "Infrastructure", "AWS, Azure, GCP, Kubernetes."],
          ["AI Integration", "", "AI", "Chatbots, automation and analytics.", "New"],
          ["UI/UX Design", "", "Design", "Research, prototyping and design systems."],
        ], { showPrices: false, enquireLabel: "Get a quote" }),
        gallery({ title: "Portfolio", icon: "image", intro: "A selection of recent projects." }),
        reviews([["CTO, FinTech start-up", "Shipped our MVP in 8 weeks. Outstanding team."], ["Head of Digital, Retail chain", "Our new app doubled online orders."]]),
        booking("Enquiry", ["Mobile app", "Website / web app", "Cloud migration", "AI project", "Support & maintenance"], { intro: "Tell us about your project.", askTime: false, buttonLabel: "Send enquiry" }),
        contact(),
      ])),

  tpl("education", "School & Coaching", "Education", "school",
    "Courses with fees, batch timings, faculty, admissions enquiry and events.",
    app("Bright Minds Academy",
      business({ name: "Bright Minds Academy", tagline: "Learn today, lead tomorrow", currency: "$" }),
      theme("#3F51B5", "#FFC107", { font: "rounded" }),
      [
        home({ heroSubtitle: "Admissions open for the new term", ctaLabel: "Enquire now", ctaAction: "booking",
          highlights: highlights([["school", "Expert faculty", "Experienced and certified teachers."], ["people", "Small batches", "Max 15 students per class."], ["star", "Proven results", "95% exam success rate."]]) }),
        catalog("courses", "Courses", "school", [
          ["Mathematics (Grades 8–10)", 120, "School tuition", "Monthly fee · 3 classes/week."],
          ["Science (Grades 8–10)", 120, "School tuition", "Physics, chemistry and biology."],
          ["Spoken English", 90, "Languages", "Monthly fee · Fluency and confidence."],
          ["Coding for Kids", 150, "Technology", "Scratch, Python and robotics.", "Popular"],
          ["Exam Prep Crash Course", 300, "Test prep", "6-week intensive programme."],
        ], { enquireLabel: "Enquire about this course" }),
        events("Events", [
          ["Open Day", upcoming(10), "10:00 AM", "Main campus", "Meet teachers and tour the campus."],
          ["Science Fair", upcoming(25), "9:00 AM", "Auditorium", "Student projects and prizes."],
        ]),
        team([["Mrs. Anita Rao", "Principal", "25 years in education."], ["Mr. John Davis", "Maths Faculty"], ["Ms. Sara Ali", "English Faculty"]], { title: "Faculty" }),
        booking("Admission", ["Mathematics", "Science", "Spoken English", "Coding for Kids", "Exam Prep"], { intro: "Admission enquiry — we'll call you back within 24 hours.", serviceLabel: "Course", askTime: false }),
        contact(),
      ])),

  tpl("hotel", "Hotel & Resort", "Hospitality & Travel", "hotel",
    "Rooms and rates, amenities, gallery, direct booking requests and local guide.",
    app("Seaside Resort",
      business({ name: "Seaside Resort", tagline: "Your escape by the ocean", currency: "$",
        hours: [{ label: "Reception", value: "24 hours" }, { label: "Check-in", value: "From 2:00 PM" }, { label: "Check-out", value: "Until 11:00 AM" }] }),
      theme("#00838F", "#FFB74D", { font: "serif" }),
      [
        home({ heroSubtitle: "Beachfront rooms · Spa · Infinity pool", ctaLabel: "Book your stay", ctaAction: "booking",
          highlights: highlights([["hotel", "Ocean-view rooms", "Wake up to the sound of waves."], ["restaurant", "3 restaurants", "Local and international cuisine."], ["heart", "Full-service spa", "Massages and wellness treatments."]]) }),
        catalog("rooms", "Rooms", "hotel", [
          ["Deluxe Garden Room", 140, "Rooms", "Per night · King bed · Garden view."],
          ["Ocean View Room", 190, "Rooms", "Per night · Balcony with sea view.", "Popular"],
          ["Family Suite", 260, "Suites", "Per night · 2 bedrooms · Sleeps 5."],
          ["Beach Villa", 420, "Villas", "Per night · Private pool · Direct beach access."],
        ], { layout: "grid", enquireLabel: "Check availability" }),
        gallery(),
        booking("Book", ["Deluxe Garden Room", "Ocean View Room", "Family Suite", "Beach Villa"], { askGuests: true, askTime: false, serviceLabel: "Room type", intro: "Best rates guaranteed when you book direct." }),
        faq([["Is breakfast included?", "Yes, a buffet breakfast is included in all rates."], ["Do you offer airport transfers?", "Yes, on request for a small fee."], ["Are pets allowed?", "Pets are welcome in garden rooms."]]),
        contact(),
      ])),

  tpl("travel-agency", "Travel Agency", "Hospitality & Travel", "flight",
    "Tour packages with prices, travel offers, visa FAQs and trip enquiries.",
    app("Wanderlust Tours",
      business({ name: "Wanderlust Tours", tagline: "Unforgettable journeys, perfectly planned", currency: "$" }),
      theme("#0288D1", "#FF7043"),
      [
        home({ heroSubtitle: "Handcrafted holidays to 60+ destinations", ctaLabel: "Explore packages", ctaAction: "packages",
          highlights: highlights([["flight", "All-inclusive", "Flights, hotels and transfers."], ["shield", "Fully protected", "Licensed and insured."], ["chat", "24/7 support", "Help whenever you travel."]]) }),
        catalog("packages", "Packages", "flight", [
          ["Bali Bliss — 7 nights", 1299, "Asia", "Villas, temples and beaches. Flights included.", "Bestseller"],
          ["Swiss Alps — 5 nights", 1899, "Europe", "Scenic trains and mountain resorts."],
          ["Dubai City Break — 4 nights", 899, "Middle East", "Desert safari and city tour."],
          ["Kenya Safari — 6 nights", 2499, "Africa", "Masai Mara game drives."],
          ["Maldives Honeymoon — 5 nights", 2999, "Asia", "Overwater villa, all-inclusive."],
        ], { layout: "grid", enquireLabel: "Enquire about this trip" }),
        offers([["Early bird", "Book 90 days ahead and save 15%.", "EARLY15", ""]]),
        booking("Plan a trip", ["Beach holiday", "Adventure", "Honeymoon", "Family vacation", "Corporate travel"], { askGuests: true, askTime: false, serviceLabel: "Trip type", buttonLabel: "Get my itinerary" }),
        faq([["Do you help with visas?", "Yes, we provide visa guidance and documentation support."], ["Can I pay in instalments?", "Yes, pay a 20% deposit and the rest before departure."]]),
        contact(),
      ])),

  tpl("event-planner", "Events & Weddings", "Events & Community", "event",
    "Event packages, portfolio gallery, testimonials and consultation booking.",
    app("Ever After Events",
      business({ name: "Ever After Events", tagline: "Weddings & celebrations designed around you", currency: "$" }),
      theme("#AD1457", "#FFD54F", { font: "serif", corners: "pill" }),
      [
        home({ heroSubtitle: "From intimate gatherings to grand celebrations", ctaLabel: "Plan my event", ctaAction: "booking",
          highlights: highlights([["heart", "300+ weddings", "Every one unique."], ["star", "Full planning", "Venue, décor, catering and music."], ["camera", "Trusted vendors", "Curated photographers and florists."]]) }),
        pricing("Packages", [
          ["Day Coordination", 1200, "", ["On-the-day coordinator", "Vendor management", "Timeline planning"]],
          ["Partial Planning", 3500, "", ["Everything in Day Coordination", "Venue & vendor selection", "3 planning meetings"], true],
          ["Full Planning", 7500, "", ["End-to-end planning", "Design & décor", "Guest management", "Unlimited meetings"]],
        ], { buttonLabel: "Enquire" }),
        gallery({ title: "Portfolio", icon: "camera" }),
        reviews([["Emma & Noah", "They made our day absolutely perfect!"], ["Raj & Meera", "Flawless planning, stunning décor."]]),
        booking("Enquire", ["Wedding", "Engagement", "Birthday", "Corporate event", "Other celebration"], { askGuests: true, askTime: false, serviceLabel: "Event type" }),
        contact(),
      ])),

  tpl("photography", "Photography Portfolio", "Creative", "camera",
    "Full-screen portfolio gallery, session packages and shoot bookings.",
    app("Lens & Light Studio",
      business({ name: "Lens & Light Studio", tagline: "Portraits · Weddings · Commercial", currency: "$" }),
      theme("#212121", "#FFC400", { dark: true, corners: "square" }),
      [
        home({ heroSubtitle: "Telling your story, one frame at a time", ctaLabel: "Book a shoot", ctaAction: "booking", showShortcuts: true }),
        gallery({ title: "Portfolio", icon: "camera" }),
        pricing("Sessions", [
          ["Mini Portrait", 150, "session", ["30-minute shoot", "10 edited photos", "Online gallery"]],
          ["Family Session", 300, "session", ["1-hour shoot", "30 edited photos", "Print release"], true],
          ["Wedding Day", 2200, "", ["8 hours coverage", "500+ edited photos", "Second shooter", "Album"]],
        ], { buttonLabel: "Book" }),
        about("I'm a photographer who loves natural light and genuine moments. Based in the city, available worldwide."),
        booking("Book", ["Portrait session", "Family session", "Wedding", "Commercial / product"], { serviceLabel: "Shoot type" }),
        contact(),
      ])),

  tpl("auto-repair", "Auto Repair & Garage", "Automotive", "car",
    "Service price list, booking for repairs, offers and emergency roadside call button.",
    app("QuickFix Auto",
      business({ name: "QuickFix Auto", tagline: "Honest repairs. Fair prices.", currency: "$",
        hours: hours("8:00 AM – 6:00 PM", "8:00 AM – 2:00 PM", "Closed") }),
      theme("#C62828", "#FFD600", { font: "condensed" }),
      [
        home({ heroSubtitle: "Certified mechanics · All makes & models", ctaLabel: "Book a service", ctaAction: "booking",
          highlights: highlights([["wrench", "Certified mechanics", "ASE-certified technicians."], ["clock", "Same-day service", "Most repairs done the same day."], ["shield", "12-month warranty", "On all parts and labour."]]) }),
        catalog("services", "Services", "wrench", [
          ["Oil & Filter Change", 49, "Maintenance", "Synthetic blend, up to 5 quarts."],
          ["Brake Pad Replacement", 149, "Brakes", "Per axle, parts and labour."],
          ["Full Service", 199, "Maintenance", "50-point inspection, fluids, filters.", "Popular"],
          ["AC Re-gas", 89, "Air conditioning", "Recharge and leak check."],
          ["Tyre Fitting & Balancing", 25, "Tyres", "Per tyre."],
          ["Diagnostics Scan", 39, "Diagnostics", "Engine light and fault codes."],
        ]),
        booking("Book", ["Oil change", "Brakes", "Full service", "AC service", "Tyres", "Diagnostics"], { intro: "Choose a service and drop-off time." }),
        offers([["Winter check", "Free 20-point winter safety check with any service.", "", ""]]),
        contact(),
      ], { features: { floatingButton: "call", shareText: "" } })),

  tpl("home-services", "Home Services", "Home Services", "wrench",
    "Plumbing, electrical, cleaning or handyman business with quotes and bookings.",
    app("HandyPro Services",
      business({ name: "HandyPro Services", tagline: "Plumbing · Electrical · Cleaning · Repairs", currency: "$",
        hours: hours("7:00 AM – 8:00 PM", "8:00 AM – 6:00 PM", "Emergency call-outs only") }),
      theme("#1565C0", "#FF8F00"),
      [
        home({ heroSubtitle: "Trusted pros at your door, often the same day", ctaLabel: "Get a free quote", ctaAction: "booking",
          highlights: highlights([["shield", "Licensed & insured", "Background-checked professionals."], ["clock", "On-time guarantee", "Or $20 off your bill."], ["tag", "Upfront pricing", "No hidden fees."]]) }),
        catalog("services", "Services", "wrench", [
          ["Plumbing Repair", 79, "Plumbing", "Leaks, taps, toilets and drains. Call-out fee."],
          ["Electrical Repair", 89, "Electrical", "Sockets, switches, lighting. Call-out fee."],
          ["Deep Home Cleaning", 149, "Cleaning", "Full house, up to 3 bedrooms.", "Popular"],
          ["AC Servicing", 69, "Appliances", "Cleaning and gas check."],
          ["Handyman (per hour)", 45, "Handyman", "Assembly, mounting and small repairs."],
          ["Pest Control", 120, "Cleaning", "Safe, family-friendly treatment."],
        ]),
        booking("Book", ["Plumbing", "Electrical", "Cleaning", "AC servicing", "Handyman", "Pest control"], { intro: "Describe the job and we'll send a quote." }),
        reviews([["Karen", "Fixed our leak within an hour of calling!"], ["Mohammed", "Professional and spotless cleaning."]]),
        faq([["Do you charge for quotes?", "No, quotes are always free."], ["Are you available on weekends?", "Yes, Saturdays plus emergency call-outs on Sundays."]]),
        contact(),
      ], { features: { floatingButton: "call", shareText: "" } })),

  tpl("pet-care", "Pet Care & Vet", "Health & Beauty", "pets",
    "Grooming, boarding and vet services with booking and pet-care tips.",
    app("Happy Paws",
      business({ name: "Happy Paws", tagline: "Grooming · Boarding · Vet care", currency: "$" }),
      theme("#6D4C41", "#4DB6AC", { font: "rounded", corners: "pill" }),
      [
        home({ heroSubtitle: "Loving care for your furry family", ctaLabel: "Book a visit", ctaAction: "booking",
          highlights: highlights([["pets", "Pet-loving team", "Certified groomers and vets."], ["heart", "Stress-free", "Calm, cage-free environment."], ["camera", "Daily photo updates", "When your pet boards with us."]]) }),
        catalog("services", "Services", "pets", [
          ["Full Groom (small dog)", 45, "Grooming", "Bath, cut, nails and ears."],
          ["Full Groom (large dog)", 65, "Grooming", "Bath, cut, nails and ears."],
          ["Cat Grooming", 50, "Grooming", "Gentle handling, de-matting."],
          ["Boarding (per night)", 35, "Boarding", "Walks, play time and cuddles."],
          ["Vet Consultation", 55, "Vet", "Health check and advice."],
          ["Vaccination", 30, "Vet", "Per vaccine."],
        ]),
        booking("Book", ["Grooming", "Boarding", "Vet consultation", "Vaccination"], { intro: "Tell us about your pet and preferred date." }),
        page("tips", "text", "Pet Tips", "heart", { content: "**Keeping your pet healthy**\n\n- Brush your dog's teeth 2–3 times a week\n- Keep vaccinations up to date\n- Groom every 4–8 weeks depending on coat\n- Fresh water and regular exercise every day" }),
        contact(),
      ])),

  tpl("church-community", "Church & Community", "Events & Community", "heart",
    "Service times, events calendar, sermons/links, donations and prayer requests.",
    app("Grace Community",
      business({ name: "Grace Community Church", tagline: "A place to belong",
        hours: [{ label: "Sunday service", value: "9:00 AM & 11:00 AM" }, { label: "Wednesday prayer", value: "7:00 PM" }, { label: "Office", value: "Mon – Fri, 9 AM – 4 PM" }] }),
      theme("#4527A0", "#FFB300", { font: "serif" }),
      [
        home({ heroSubtitle: "Everyone is welcome", ctaLabel: "Plan a visit", ctaAction: "contact",
          highlights: highlights([["people", "Community groups", "Connect throughout the week."], ["music", "Worship & music", "Choir and youth band."], ["heart", "Outreach", "Serving our city together."]]) }),
        events("Events", [
          ["Sunday Service", upcoming(3), "9:00 AM", "Main hall", "Worship, message and kids' church."],
          ["Youth Night", upcoming(5), "6:30 PM", "Youth centre", "Games, music and talks for ages 12–18."],
          ["Community Food Drive", upcoming(12), "10:00 AM", "Car park", "Bring non-perishable food to donate."],
        ]),
        page("media", "links", "Media", "music", { items: [
          { label: "Watch latest sermon", url: "https://www.youtube.com/", icon: "music" },
          { label: "Podcast", url: "https://example.com/podcast", icon: "chat" },
          { label: "Give online", url: "https://example.com/give", icon: "heart" },
        ] }),
        booking("Prayer", ["Prayer request", "Pastoral visit", "Baptism", "Wedding"], { title: "Requests", askDate: false, askTime: false, serviceLabel: "Request type", buttonLabel: "Send request", intro: "Share a prayer request or ask for a pastoral visit." }),
        contact(),
      ])),

  tpl("ngo", "Non-profit / NGO", "Events & Community", "leaf",
    "Mission, programs, impact stats, volunteer sign-up and donation links.",
    app("GreenEarth Foundation",
      business({ name: "GreenEarth Foundation", tagline: "Planting hope, one tree at a time" }),
      theme("#33691E", "#8BC34A"),
      [
        home({ heroSubtitle: "Join 10,000 volunteers restoring our planet", ctaLabel: "Volunteer", ctaAction: "booking",
          highlights: highlights([["leaf", "1M trees planted", "Across 12 countries."], ["people", "10,000 volunteers", "Local action, global impact."], ["shield", "Transparent", "92% of donations go to programs."]]) }),
        about("We restore forests, protect wildlife and educate communities about sustainable living.",
          { stats: [{ value: "1M+", label: "Trees" }, { value: "12", label: "Countries" }, { value: "10k", label: "Volunteers" }] }),
        catalog("programs", "Programs", "leaf", [
          ["Urban Forests", "", "Restoration", "Planting trees in city neighbourhoods."],
          ["Clean Rivers", "", "Conservation", "River clean-ups and water testing."],
          ["Green Schools", "", "Education", "Environmental education for children."],
        ], { showPrices: false, enquireLabel: "Get involved" }),
        events("Events", [["Tree Planting Day", upcoming(9), "8:00 AM", "Riverside Park", "Gloves and saplings provided."]]),
        booking("Volunteer", ["Tree planting", "Clean-up drives", "Teaching", "Fundraising", "Office support"], { title: "Volunteer", askTime: false, serviceLabel: "I'd like to help with", buttonLabel: "Sign me up" }),
        page("donate", "links", "Donate", "heart", { items: [{ label: "Donate online", url: "https://example.com/donate", icon: "heart" }, { label: "Sponsor a tree", url: "https://example.com/tree", icon: "leaf" }] }),
        contact(),
      ])),

  tpl("logistics", "Logistics & Courier", "Transport & Logistics", "truck",
    "Shipping services, rate cards, pickup requests and tracking link.",
    app("SwiftShip Logistics",
      business({ name: "SwiftShip Logistics", tagline: "Fast, reliable, trackable delivery", currency: "$",
        hours: hours("7:00 AM – 9:00 PM", "8:00 AM – 6:00 PM", "Closed") }),
      theme("#283593", "#FF6F00"),
      [
        home({ heroSubtitle: "Same-day local · Next-day national · International", ctaLabel: "Request pickup", ctaAction: "booking",
          highlights: highlights([["truck", "Door-to-door", "Pickup from your home or office."], ["globe", "220+ countries", "International express shipping."], ["shield", "Insured parcels", "Up to $1,000 cover included."]]) }),
        pricing("Rates", [
          ["Local Same-day", 9.99, "parcel", ["Up to 5 kg", "Within city limits", "Delivered by 8 PM"]],
          ["National Next-day", 14.99, "parcel", ["Up to 10 kg", "Tracking & SMS updates", "Signature on delivery"], true],
          ["International Express", 39.99, "parcel", ["Up to 5 kg", "3–5 business days", "Customs support"]],
        ], { buttonLabel: "Book" }),
        page("track", "links", "Track", "place", { items: [{ label: "Track your shipment", url: "https://example.com/track", icon: "place" }, { label: "Shipping guidelines", url: "https://example.com/guidelines", icon: "list" }] }),
        booking("Pickup", ["Document", "Small parcel", "Large parcel", "Pallet / freight"], { title: "Pickup", serviceLabel: "Shipment type", intro: "Schedule a pickup — we'll confirm the time slot." }),
        faq([["What can't I ship?", "Hazardous materials, cash and perishables (unless using cold chain)."], ["How do I pay?", "Card, bank transfer or cash on pickup."]]),
        contact(),
      ])),

  tpl("freelancer", "Freelancer / Personal Brand", "Creative", "star",
    "Personal portfolio with services, testimonials, links and hire-me form.",
    app("Alex Morgan",
      business({ name: "Alex Morgan", tagline: "Designer & brand consultant", currency: "$", address: "", hours: [] }),
      theme("#00897B", "#FF5252", { corners: "pill" }),
      [
        home({ heroSubtitle: "I help small brands look big", ctaLabel: "Hire me", ctaAction: "booking",
          highlights: highlights([["star", "8 years' experience", "100+ brands launched."], ["bolt", "Fast turnaround", "First concepts in 5 days."], ["chat", "Clear communication", "Weekly updates, no surprises."]]) }),
        catalog("services", "Services", "work", [
          ["Logo & Identity", 900, "Branding", "Logo, colours, typography, guidelines."],
          ["Website Design", 1500, "Web", "Up to 5 pages, responsive."],
          ["Social Media Kit", 400, "Marketing", "Templates for posts and stories."],
        ]),
        gallery({ title: "Work", icon: "image" }),
        reviews([["Founder, Bloom Tea", "Alex completely transformed our brand."], ["CEO, FitLab", "Professional, creative and on time."]]),
        page("links", "links", "Links", "link", { items: [{ label: "Portfolio website", url: "https://example.com", icon: "web" }, { label: "LinkedIn", url: "https://linkedin.com", icon: "work" }] }),
        booking("Hire me", ["Branding project", "Website", "Social media kit", "Consultation call"], { title: "Hire me", askTime: false, serviceLabel: "Project type", buttonLabel: "Send brief" }),
      ], { features: { floatingButton: "none", shareText: "" } })),

  tpl("custom-code", "Custom Web App (HTML / JS)", "Developer & AI", "code",
    "Bring your own code: HTML, CSS and JavaScript — written by you or generated by an AI assistant — packaged as a native Android app. Upload files or a ZIP, or let Claude write them through the MCP server.",
    {
      schemaVersion: 1,
      mode: "code",
      appName: "My App",
      theme: theme("#1E63E9", "#1E63E9"),
      navigation: "bottom",
      business: { name: "My App" },
      features: {},
      pages: [],
    }),

  tpl("android-project", "Android Studio Project (Gradle)", "Developer & AI", "android",
    "Compile a complete native Android project (Java or Kotlin, Gradle) into a signed APK or AAB. Ideal for AI-generated source code: upload the project, read the build log, fix, rebuild.",
    {
      schemaVersion: 1,
      mode: "project",
      appName: "My Native App",
      theme: theme("#2E7D32", "#2E7D32"),
      navigation: "bottom",
      business: { name: "My Native App" },
      features: {},
      pages: [],
    }),

  tpl("website-to-app", "Website to App", "Website to App", "web",
    "Turn any existing website into an Android app in minutes — with offline screen and in-app browsing.",
    {
      schemaVersion: 1,
      mode: "website",
      appName: "My Website",
      website: { url: "https://example.com" },
      theme: theme("#1E63E9", "#1E63E9"),
      navigation: "bottom",
      business: business({ name: "My Website" }),
      features: { floatingButton: "none", shareText: "" },
      pages: [],
    }),

  tpl("blank", "Blank Business App", "Starter", "business",
    "Start from scratch with a home page and contact page, then add any pages you like.",
    app("My Business",
      business({ name: "My Business", tagline: "Your tagline here" }),
      theme("#1E63E9", "#00BFA5"),
      [
        home({ heroSubtitle: "Welcome to our app", ctaLabel: "Contact us", ctaAction: "contact", highlights: [] }),
        about("Tell your customers who you are and what you do."),
        contact(),
      ])),
];

module.exports = templates;
