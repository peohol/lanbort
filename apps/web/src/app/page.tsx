import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { getPageAccount } from "@/server/session";

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

  return (
    <main>
      <h1>Hei, {account.realName}</h1>
      <p>Du er logget inn. Flere funksjoner kommer i neste faser.</p>
      <p>
        <Link href="/konto/sikkerhet">Innlogging og sikkerhet</Link>
      </p>
      <SignOutButton />
    </main>
  );
}
