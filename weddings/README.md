# Iron Arbor Weddings

A self-contained, responsive static wedding coordination landing page.

## Deployment
Keep this as a separate Cloudflare project from Advisory and the parent website.

### Cloudflare Pages (Git integration)
1. Connect the ironarbor/ironarborllc repository.
2. Select the branch containing this change (main after merge).
3. Set root directory to weddings, leave the build command empty, and set output directory to public.
4. Add weddings.ironarborllc.com as the custom domain in this Pages project and follow Cloudflare's DNS instructions.

### Cloudflare Workers (alternative)
Run npx wrangler deploy from the weddings directory using an authenticated Cloudflare account. Then attach weddings.ironarborllc.com as a custom domain to this Worker.

Use only one of these deployment methods. Do not point the existing parent or advisory projects at this directory.

## Content
Contact: sc@ironarborllc.com, taken from the existing Advisory page.
The service copy is an initial draft; pricing, packages, qualifications, testimonials, and availability claims are intentionally absent.

## Future wedding pages
Create public/caldwell-rodriguez/index.html when the guest page is ready. It will live at /caldwell-rodriguez/ on the weddings subdomain. No guest details are included in this initial version.

## Checks
Open public/index.html directly in a browser; the page uses no external assets, fonts, JavaScript, or form backend. Inquiry links open the visitor's email application. Mobile layout switches below 760px.
