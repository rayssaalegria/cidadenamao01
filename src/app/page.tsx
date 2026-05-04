import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Cidade na Mão</h1>
        <p className={styles.subtitle}>
          Abra a tela para carregar dados via <code>sasi-token</code>.
        </p>
        <div className={styles.ctas}>
          <Link className={styles.primary} href="/meus-dados">
            Meus Dados
          </Link>
          <Link className={styles.secondary} href="/novo-exame">
            Novo Exame
          </Link>
          <Link className={styles.secondary} href="/minhas-solicitacoes">
            Minhas solicitações
          </Link>
        </div>
      </main>
    </div>
  );
}
