import type { Metadata } from "next";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Admin • Agenda Médica",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Admin</div>
        <nav className={styles.nav}>
          <a className={styles.navItem} href="/admin/medicos">
            Médicos
          </a>
          <a className={styles.navItem} href="/admin/agenda">
            Configurar agenda
          </a>
          <a className={styles.navItem} href="/admin/horarios">
            Horários
          </a>
          <a className={styles.navItem} href="/admin/calendario">
            Calendário
          </a>
        </nav>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

