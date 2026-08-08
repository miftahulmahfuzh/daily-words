import { redirect } from "next/navigation";

export default function Home() {
  // Auth lands here in F1; for now the app opens on the card.
  redirect("/today");
}
