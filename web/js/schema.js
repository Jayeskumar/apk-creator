// Declarative editor schema. The generic form renderer in forms.js turns
// these definitions into editors, so adding a page type is mostly data.
//
// Field types: text, textarea, number, url, image, bool, select, icon,
// action, list, date, time, color

const submitVia = {
  k: "submitVia", l: "Send submissions to", t: "select", def: "server",
  options: [["server", "Dashboard inbox (recommended)"], ["whatsapp", "WhatsApp message"], ["email", "Email"]],
  help: "Dashboard inbox needs the app to reach this server over the internet. WhatsApp and email work offline-first.",
};

export const PAGE_TYPES = {
  home: {
    label: "Home", icon: "home", desc: "Hero banner, quick actions, highlights and shortcuts",
    fields: [
      { k: "heroTitle", l: "Headline", t: "text", ph: "Defaults to your business name" },
      { k: "heroSubtitle", l: "Sub-headline", t: "text" },
      { k: "heroImage", l: "Hero background image", t: "image" },
      { k: "ctaLabel", l: "Button label", t: "text", ph: "e.g. Book now" },
      { k: "ctaAction", l: "Button action", t: "action" },
      { k: "intro", l: "Intro text", t: "textarea" },
      { k: "showQuickActions", l: "Show Call / WhatsApp / Directions buttons", t: "bool", def: true },
      { k: "highlightsTitle", l: "Highlights heading", t: "text", ph: "Why choose us" },
      { k: "highlights", l: "Highlights", t: "list", item: "Highlight", title: "title",
        fields: [{ k: "icon", l: "Icon", t: "icon" }, { k: "title", l: "Title", t: "text" }, { k: "text", l: "Description", t: "text" }] },
      { k: "showShortcuts", l: "Show shortcuts to other pages", t: "bool", def: true },
    ],
  },
  about: {
    label: "About", icon: "info", desc: "Your story with an image and key numbers",
    fields: [
      { k: "image", l: "Image", t: "image" },
      { k: "content", l: "Text", t: "textarea", rows: 8, help: "Supports **bold**, *italic*, bullet lists (- item) and [links](https://…)." },
      { k: "stats", l: "Key numbers", t: "list", item: "Number", title: "label",
        fields: [{ k: "value", l: "Value", t: "text", ph: "15+" }, { k: "label", l: "Label", t: "text", ph: "Years" }] },
    ],
  },
  catalog: {
    label: "Catalog / Menu / Services", icon: "list", desc: "Products, menu items, services or listings with prices and ordering",
    fields: [
      { k: "intro", l: "Intro", t: "text" },
      { k: "layout", l: "Layout", t: "select", def: "list", options: [["list", "List"], ["grid", "Grid (2 columns)"]] },
      { k: "showPrices", l: "Show prices", t: "bool", def: true },
      { k: "enableOrders", l: "Enable ordering (cart + checkout)", t: "bool", def: false },
      { k: "orderVia", l: "Send orders to", t: "select", def: "whatsapp", showIf: (p) => p.enableOrders,
        options: [["whatsapp", "WhatsApp message"], ["server", "Dashboard inbox"], ["email", "Email"]] },
      { k: "enquireLabel", l: "Enquire button label", t: "text", ph: "Enquire now", showIf: (p) => !p.enableOrders },
      { k: "items", l: "Items", t: "list", item: "Item", title: "name", fields: [
        { k: "name", l: "Name", t: "text" },
        { k: "price", l: "Price", t: "text", ph: "Leave empty to hide" },
        { k: "category", l: "Category", t: "text", help: "Items with a category get filter chips." },
        { k: "description", l: "Short description", t: "text" },
        { k: "details", l: "Full details", t: "textarea" },
        { k: "badge", l: "Badge", t: "text", ph: "e.g. New, Bestseller" },
        { k: "image", l: "Image", t: "image" },
      ] },
    ],
  },
  pricing: {
    label: "Pricing / Plans", icon: "tag", desc: "Membership plans, packages or price tiers",
    fields: [
      { k: "intro", l: "Intro", t: "text" },
      { k: "buttonLabel", l: "Button label", t: "text", ph: "Enquire" },
      { k: "items", l: "Plans", t: "list", item: "Plan", title: "name", fields: [
        { k: "name", l: "Name", t: "text" },
        { k: "price", l: "Price", t: "text" },
        { k: "period", l: "Period", t: "text", ph: "month" },
        { k: "features", l: "Features (one per line)", t: "textarea" },
        { k: "highlighted", l: "Highlight as popular", t: "bool" },
      ] },
    ],
  },
  booking: {
    label: "Booking / Appointment", icon: "event", desc: "Appointment, reservation or enquiry form",
    fields: [
      { k: "intro", l: "Intro", t: "text" },
      { k: "serviceLabel", l: "Options label", t: "text", ph: "Service" },
      { k: "services", l: "Options (one per line)", t: "textarea", help: "Leave empty to hide the dropdown." },
      { k: "askDate", l: "Ask for a date", t: "bool", def: true },
      { k: "askTime", l: "Ask for a time", t: "bool", def: true },
      { k: "askGuests", l: "Ask for number of people", t: "bool", def: false },
      { k: "buttonLabel", l: "Button label", t: "text", ph: "Request booking" },
      submitVia,
    ],
  },
  gallery: {
    label: "Gallery", icon: "image", desc: "Photo grid with full-screen viewer",
    fields: [
      { k: "intro", l: "Intro", t: "text" },
      { k: "images", l: "Photos", t: "list", item: "Photo", title: "caption",
        fields: [{ k: "image", l: "Image", t: "image" }, { k: "caption", l: "Caption", t: "text" }] },
    ],
  },
  team: {
    label: "Team", icon: "people", desc: "Staff, doctors, trainers or agents",
    fields: [
      { k: "intro", l: "Intro", t: "text" },
      { k: "members", l: "People", t: "list", item: "Person", title: "name", fields: [
        { k: "name", l: "Name", t: "text" }, { k: "role", l: "Role", t: "text" }, { k: "bio", l: "Bio", t: "textarea" }, { k: "photo", l: "Photo", t: "image" },
      ] },
    ],
  },
  testimonials: {
    label: "Reviews", icon: "star", desc: "Customer testimonials with star ratings",
    fields: [
      { k: "items", l: "Reviews", t: "list", item: "Review", title: "name", fields: [
        { k: "name", l: "Name", t: "text" }, { k: "text", l: "Review", t: "textarea" }, { k: "rating", l: "Rating (1–5)", t: "number", min: 1, max: 5 },
      ] },
    ],
  },
  faq: {
    label: "FAQ", icon: "help", desc: "Frequently asked questions",
    fields: [{ k: "items", l: "Questions", t: "list", item: "Question", title: "question", fields: [
      { k: "question", l: "Question", t: "text" }, { k: "answer", l: "Answer", t: "textarea" },
    ] }],
  },
  offers: {
    label: "Offers & Coupons", icon: "offer", desc: "Promotions, discount codes and loyalty deals",
    fields: [{ k: "items", l: "Offers", t: "list", item: "Offer", title: "title", fields: [
      { k: "title", l: "Title", t: "text" }, { k: "description", l: "Description", t: "textarea" },
      { k: "code", l: "Coupon code", t: "text" }, { k: "validUntil", l: "Valid until", t: "text", ph: "e.g. 31 Dec" }, { k: "image", l: "Image", t: "image" },
    ] }],
  },
  events: {
    label: "Events / Schedule", icon: "event", desc: "Classes, events, timetables or deadlines",
    fields: [{ k: "items", l: "Events", t: "list", item: "Event", title: "title", fields: [
      { k: "title", l: "Title", t: "text" }, { k: "date", l: "Date", t: "date" }, { k: "time", l: "Time", t: "text", ph: "7:00 PM" },
      { k: "location", l: "Location", t: "text" }, { k: "description", l: "Description", t: "textarea" },
    ] }],
  },
  links: {
    label: "Links", icon: "link", desc: "Buttons to websites, social profiles, documents or payment pages",
    fields: [{ k: "items", l: "Links", t: "list", item: "Link", title: "label", fields: [
      { k: "label", l: "Label", t: "text" }, { k: "url", l: "URL", t: "url" }, { k: "icon", l: "Icon", t: "icon" },
    ] }],
  },
  contact: {
    label: "Contact", icon: "phone", desc: "Contact details, opening hours, social links and message form",
    fields: [
      { k: "intro", l: "Intro", t: "text" },
      { k: "showHours", l: "Show opening hours", t: "bool", def: true },
      { k: "showForm", l: "Show message form", t: "bool", def: true },
      { k: "formTitle", l: "Form title", t: "text", ph: "Send us a message", showIf: (p) => p.showForm !== false },
      { ...submitVia, showIf: (p) => p.showForm !== false },
    ],
    note: "Contact details come from the Business tab.",
  },
  text: {
    label: "Text page", icon: "text", desc: "Free text: policies, checklists, announcements",
    fields: [
      { k: "image", l: "Image", t: "image" },
      { k: "content", l: "Content", t: "textarea", rows: 10, help: "Supports **bold**, *italic*, bullet lists (- item) and [links](https://…)." },
    ],
  },
  web: {
    label: "Web page", icon: "web", desc: "Show an existing web page (shop, booking system, blog) inside the app",
    fields: [{ k: "url", l: "Web address", t: "url", ph: "https://" }],
  },
};

export const BUSINESS_FIELDS = [
  { k: "name", l: "Business name", t: "text" },
  { k: "tagline", l: "Tagline", t: "text" },
  { k: "description", l: "Short description", t: "textarea" },
  { k: "logo", l: "Logo", t: "image", help: "Shown on the home screen and in the menu." },
  { k: "phone", l: "Phone", t: "text", ph: "+1 555 010 0100" },
  { k: "whatsapp", l: "WhatsApp number", t: "text", ph: "Include country code", help: "Used for orders, bookings and the WhatsApp button." },
  { k: "email", l: "Email", t: "text" },
  { k: "website", l: "Website", t: "url", ph: "https://" },
  { k: "address", l: "Address", t: "textarea", rows: 2 },
  { k: "mapQuery", l: "Map search (optional)", t: "text", help: "What to search in Maps for directions. Defaults to the address." },
  { k: "currency", l: "Currency symbol", t: "text", ph: "$" },
  { k: "hours", l: "Opening hours", t: "list", item: "Row", title: "label",
    fields: [{ k: "label", l: "Days", t: "text", ph: "Mon – Fri" }, { k: "value", l: "Hours", t: "text", ph: "9 AM – 6 PM" }] },
  { k: "social.facebook", l: "Facebook", t: "url" },
  { k: "social.instagram", l: "Instagram", t: "url" },
  { k: "social.x", l: "X / Twitter", t: "url" },
  { k: "social.youtube", l: "YouTube", t: "url" },
  { k: "social.linkedin", l: "LinkedIn", t: "url" },
  { k: "social.tiktok", l: "TikTok", t: "url" },
];

export const THEME_PRESETS = [
  { name: "Ocean", primary: "#1E63E9", secondary: "#00BFA5" },
  { name: "Ruby", primary: "#B3261E", secondary: "#F2A900" },
  { name: "Forest", primary: "#2E7D32", secondary: "#F9A825" },
  { name: "Royal", primary: "#4527A0", secondary: "#FFB300" },
  { name: "Teal", primary: "#00695C", secondary: "#FFB300" },
  { name: "Sunset", primary: "#E65100", secondary: "#2E7D32" },
  { name: "Berry", primary: "#AD1457", secondary: "#FFD54F" },
  { name: "Coffee", primary: "#6F4E37", secondary: "#D4A373" },
  { name: "Navy", primary: "#1B3A5C", secondary: "#C9A227" },
  { name: "Graphite", primary: "#263238", secondary: "#B08D57" },
  { name: "Midnight", primary: "#111827", secondary: "#F97316", dark: true },
  { name: "Neon", primary: "#5E35B1", secondary: "#00E5FF", dark: true },
];
