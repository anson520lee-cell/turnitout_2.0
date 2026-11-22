import { HomeExperience } from "@/components/orbital/home-experience";
import { JsonLd } from "@/components/seo/json-ld";
import { brand } from "@/config/app";
import { appUrl } from "@/lib/utils";

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "@id": `${appUrl()}/#org`, name: brand.name, url: appUrl(), description: brand.description },
            { "@type": "WebSite", "@id": `${appUrl()}/#site`, name: brand.name, url: appUrl(), description: brand.tagline, publisher: { "@id": `${appUrl()}/#org` } },
          ],
        }}
      />
      <HomeExperience />
    </>
  );
}
