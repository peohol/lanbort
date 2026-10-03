import Link from "next/link";
import { redirect } from "next/navigation";
import { readHome } from "@lanbort/domain";
import { HomeView } from "@/components/home-view";
import { getPageAccount, pageQuery } from "@/server/session";

export default async function HomePage() {
  const account = await getPageAccount();

  if (account?.status === "pending_registration") {
    redirect("/registrering");
  }

  if (!account) {
    return (
      <main>
        <h1>Lånbort</h1>
        <p>Lån ting av mennesker du stoler på.</p>
        <Link className="button" href="/logg-inn">
          Logg inn eller opprett konto
        </Link>
      </main>
    );
  }

  const home = await pageQuery(readHome, {});

  return <HomeView realName={account.realName ?? ""} home={home!} />;
}
