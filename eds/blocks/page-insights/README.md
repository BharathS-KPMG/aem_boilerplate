# page-insights

A floating **Page Insights** button that opens a side panel with data about the current page:

| Card | Data | Source |
| --- | --- | --- |
| Page Analytics | visits, bounce rate, time spent, form / FAQ / video / PDF counts, mobile share | Adobe Analytics, via the AEM servlet `/bin/analytics/page-insights` |
| Performance Metrics | performance score, Core Web Vitals (desktop / mobile) | Google PageSpeed Insights |
| Accessibility Compliance | accessibility score, failed WCAG checks (desktop / mobile) | Google PageSpeed Insights (same call) |
| SEO Insights | impressions, clicks, CTR, average position vs last month | AEM servlet `/apcolourcatalogue/seo_details.json` |

Ported from the AEM clientlibs `clientlib-insights` and `clientlib-template`.

## Who sees it

- **Signed-in users only.** The header (`blocks/header/header.js`) does the Keycloak sign-in and saves the session in localStorage. `page-insights-auth.js` reads it.
- **Only the `app-IT`, `app-brand` and `app-marketing` Keycloak realm roles.** `page-insights-auth.js` reads `realm_access.roles` from the saved access token, the same claim `keycloak.hasRealmRole()` checks. To change who sees it, edit `ALLOWED_ROLES` there. This only hides the button: anyone can edit localStorage, so the analytics and SEO APIs must check the roles themselves.
- **All screen sizes.** On phones and tablets (768 px and narrower) the button sits bottom-right, above the chat button, and the panel opens full screen.

## How it gets on the page

`scripts/scripts.js` imports `scripts/page-insights-loader.js` once the page load event has fired. The loader waits for an idle moment, then:

1. If the user is signed in with an allowed role, it loads `page-insights.css` + `page-insights.js` and, in the next idle moment, adds the block at the end of `<body>`.
2. If not, it downloads nothing else and re-checks on the header's `keycloakLoginReady` event.

The block also works when authored on a page as a `page-insights` block.

`page-insights.js` draws the button and the panel straight away, then loads the other stylesheets and the date picker libraries (jQuery, moment, daterangepicker) in the background; a click that comes before they are ready waits for them. If the user signs out (in another tab, or the session can't be refreshed), the panel is removed.

## Files

| File | What it does |
| --- | --- |
| `page-insights.js` | Entry point: sign-in / role gate, loads CSS and libraries, builds the panel |
| `page-insights-auth.js` | Is the user signed in with an allowed role (`ALLOWED_ROLES`)? Watches sign-in / sign-out |
| `page-insights-api.js` | **All API calls.** Each API is between `START:` / `END:` comments, with its URL, parameters and reply format |
| `page-insights-markup.js` | HTML of the button and the panel |
| `page-insights-sidebar.js` | Open / close the panel, switch between overview and detail screens |
| `page-insights-overview.js` | Overview screen: first-load loader, "Critical Metrics" warnings, status pill |
| `page-insights-performance.js` | Loads PageSpeed (progress bar, error + Try Again) and draws the Performance tab |
| `page-insights-accessibility.js` | Accessibility tab (score + failed checks) |
| `page-insights-analytics.js` | Page Analytics tab (date range, Overall / Organic) |
| `page-insights-seo.js` | SEO Insights tab (month picker, metric cards) |
| `page-insights-state.js` | Data shared between the files (PageSpeed results, caches) |
| `page-insights-constants.js` | Image paths, Core Web Vitals limits, page checks |
| `page-insights-helpers.js` | Number formatting, quality ratings, score gauge |
| `page-insights.css` | Panel shell: button, panel, overview, loaders, gauges |
| `page-insights-<tab>.css` | Styles of each tab, plus `page-insights-daterangepicker.css` for the date picker |
| `images/` | Icons used by the panel |

## Notes

- **Which page the APIs report on:** the live `www.asianpaints.com` URL of the current page (beta URLs are mapped to www; localhost uses the home page). See `page-insights-api.js`.
- **Page checks:** the Form, Conversion, Video and PDF rows only show when the page has the matching AEM component (`PAGE_FEATURES` in `page-insights-constants.js`).
- **PageSpeed API key:** it's in `page-insights-api.js` and anyone can see it in the browser, so keep it restricted to the site's domains in Google Cloud Console.
