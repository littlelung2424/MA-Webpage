"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import styles from "./support.module.css";

export default function SupportNavigation() {
  const segment = useSelectedLayoutSegment();

  return (
    <nav className={styles.nav} aria-label="Primary">
      <Link href="/">Home</Link>
      <Link href="/workspace">The Workspace</Link>
      {segment === "order-verification" ? <Link href="/support">Support</Link> : null}
    </nav>
  );
}
