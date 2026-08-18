import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// i18n (ADR-031): Cookie-Locale ohne URL-Routing; das Plugin verdrahtet
// nur die Request-Config für Server Components.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone-Output fuer Docker-Deployment
  // Erzeugt eine eigenstaendige Kopie mit allen Dependencies
  output: 'standalone',

  experimental: {
    // Router-Zwischenspeicher (18.08.2026). Next 16 haelt dynamische Routen
    // per Vorgabe 0 Sekunden vor — dadurch loest selbst der Zurueck-Knopf eine
    // volle Server-Runde aus, obwohl die Seite gerade erst besucht wurde.
    // 30 Sekunden machen Zurueck-Navigation sofort, ohne dass Inhalte
    // sichtbar veralten: die Live-Daten (Radio, Publikum) kommen ohnehin
    // ueber eigene Abfragen im Browser, nicht ueber die Seiten-Nutzlast.
    staleTimes: { dynamic: 30 },
  },

  // MCP-Discovery: Link-Header auf jeder Antwort, damit KI-Agenten den
  // öffentlichen MCP-Server schon am HTTP-Header erkennen (Workflow
  // kbk-mcp-discovery). URL-SoT ist src/lib/mcp-info.ts — next.config kann
  // nicht aus src/ importieren, daher hier wörtlich zitiert.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Link',
            value: '<https://mcp.kaboomkartell.com/mcp>; rel="mcp-server"',
          },
        ],
      },
    ];
  },

  // Permanente Redirects fuer umbenannte Routen
  async redirects() {
    return [
      {
        source: '/registrieren',
        destination: '/register',
        permanent: true,
      },
      {
        source: '/ueber-uns',
        destination: '/about',
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
