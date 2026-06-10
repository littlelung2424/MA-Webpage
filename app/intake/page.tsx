import type { Metadata } from "next";
import "../../features/intake/intake.css";
import { IntakeForm } from "../../features/intake/components/IntakeForm";

const intakeUrl = "https://missionatlasxd.com/intake";
const title = "Automation Intake Form | Mission Atlas xD";
const description =
  "Share the repetitive workflow, report, or process slowing you down and upload screenshots so Mission Atlas xD can scope an automation solution.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: intakeUrl,
  },
  openGraph: {
    title,
    description,
    url: intakeUrl,
    siteName: "Mission Atlas xD",
    type: "website",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

const intakeStructuredData = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: title,
  description,
  url: intakeUrl,
  isPartOf: {
    "@type": "WebSite",
    name: "Mission Atlas xD",
    url: "https://missionatlasxd.com/",
  },
  mainEntity: {
    "@type": "Service",
    name: "Workflow automation intake",
    provider: {
      "@type": "Organization",
      name: "Mission Atlas xD",
      url: "https://missionatlasxd.com/",
    },
    serviceType: "Workflow automation and process improvement",
    description:
      "Intake for teams and operators to request help simplifying workflows, automating repetitive tasks, and improving reports or processes.",
  },
};

export default function IntakePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(intakeStructuredData) }}
      />
      <IntakeForm />
    </>
  );
}
