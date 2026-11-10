# Templates

There are three ways to add templates to the gallery.

1. **Built-in** templates live in `server/src/templates/builtin.js` (30 business templates plus two developer starters). They're written with small helper functions, so a new one is usually 30–60 lines.
2. **File templates** are JSON files in `templates/`, or in the folder named by `TEMPLATES_DIR`. They're loaded at start-up, which makes them good for shipping an industry pack with an on-premise install. See `templates/example-bakery.json`.
3. **Saved templates:** an administrator opens any app, goes to **Settings → Save as template**, and it appears in the gallery for every user on that installation. Admins can delete these in **Admin → Custom templates**.

## File format

```json
{
  "id": "custom-bakery",
  "name": "Artisan Bakery",
  "category": "Food & Drink",
  "icon": "cafe",
  "description": "Shown on the template card.",
  "config": { "...": "an app configuration — see ARCHITECTURE.md" }
}
```

- `id` must be unique across all templates.
- `icon` and every page `icon` must be an icon name from `runtime/icons.js` (`home, info, phone, email, star, list, image, event, people, help, web, place, clock, cart, restaurant, store, chat, share, fitness, medical, school, hotel, car, scissors, business, gavel, wrench, pets, flight, camera, cafe, heart, truck, music, work, check, tag, bank, computer, link, text, offer, globe, shield, leaf, bolt, whatsapp`, …).
- `ctaAction` on a home page is either one of `call, whatsapp, email, map, website` or the `id` of another page.
- When a user creates an app from a template, the business name and app name are replaced with the name they enter, and a launcher icon is derived from the template icon and primary colour, unless `config.icon` is set.

## Page type reference

| Type | Key fields |
|---|---|
| `home` | `heroTitle`, `heroSubtitle`, `heroImage`, `ctaLabel`, `ctaAction`, `intro`, `showQuickActions`, `highlights[] {icon,title,text}`, `showShortcuts` |
| `about` | `image`, `content` (markdown-lite), `stats[] {value,label}` |
| `text` | `image`, `content` |
| `catalog` | `intro`, `layout` (list/grid), `showPrices`, `enableOrders`, `orderVia`, `enquireLabel`, `items[] {name,price,category,description,details,badge,image}` |
| `pricing` | `intro`, `buttonLabel`, `items[] {name,price,period,features (one per line),highlighted}` |
| `booking` | `intro`, `services` (one per line), `serviceLabel`, `askDate`, `askTime`, `askGuests`, `buttonLabel`, `submitVia` |
| `gallery` | `intro`, `images[] {image,caption}` |
| `team` | `intro`, `members[] {name,role,bio,photo}` |
| `testimonials` | `items[] {name,text,rating}` |
| `faq` | `items[] {question,answer}` |
| `offers` | `items[] {title,description,code,validUntil,image}` |
| `events` | `items[] {title,date (YYYY-MM-DD),time,location,description}` |
| `links` | `items[] {label,url,icon}` |
| `contact` | `intro`, `showHours`, `showForm`, `formTitle`, `submitVia` (uses `business.*`) |
| `web` | `url` |

`submitVia` / `orderVia` is one of `server` (dashboard leads inbox), `whatsapp` or `email`.

Markdown-lite (used in `content`, `details` and FAQ answers) supports paragraphs, `- bullet` lists, `**bold**`, `*italic*` and `[links](https://…)`.
