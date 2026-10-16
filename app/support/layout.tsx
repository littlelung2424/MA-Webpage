import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import styles from "./support.module.css";
import SupportNavigation from "./navigation";

export const metadata = {
  title: "Support Center | Mission Atlas xD",
  description: "Guides and documentation for Mission Atlas xD tools.",
};

export default function SupportLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap"
        rel="stylesheet"
      />
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/" aria-label="Mission Atlas xD home">
            <Image src="/assets/brand/02.png" width={58} height={58} alt="Mission Atlas xD logo" unoptimized />
            <span>MissionAtlas<span className={styles.brandXD}>XD</span></span>
          </Link>
          <SupportNavigation />
        </header>
        {children}
        <footer className={styles.footer}>
          © {new Date().getFullYear()} Mission Atlas xD · <Link href="/support">Support Center</Link>
        </footer>
      </div>
    </>
  );
}
