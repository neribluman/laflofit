import { redirect } from "next/navigation";
import { currentUser } from "@/lib/data";

export default async function Home() {
  const user = await currentUser();
  redirect(user ? "/today" : "/login");
}
